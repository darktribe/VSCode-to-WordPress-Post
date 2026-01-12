/**
 * WordPress REST API 修正版
 * Slug重複時の上書き機能付き
 */

import { WordPressConfig, PostResult, PostMetadata } from './types';

export class WordPressClient {
  private config: WordPressConfig;

  constructor(config: WordPressConfig) {
    this.config = config;
    // API URLを正規化（末尾のスラッシュを削除、/wp-jsonが含まれている場合は警告）
    this.config.apiUrl = this.normalizeApiUrl(config.apiUrl);
  }

  /**
   * API URLを正規化
   */
  private normalizeApiUrl(apiUrl: string): string {
    let normalized = apiUrl.trim();
    
    // 末尾のスラッシュを削除
    normalized = normalized.replace(/\/+$/, '');
    
    // /wp-jsonが含まれている場合は警告
    if (normalized.includes('/wp-json')) {
      console.warn('⚠️ API URLに/wp-jsonが含まれています。通常は不要です。');
      console.warn('   例: https://example.com/wp-json → https://example.com');
      normalized = normalized.replace(/\/wp-json.*$/, '');
    }
    
    return normalized;
  }

  /**
   * 記事投稿（Slug重複時上書き対応版）
   */
  public async postArticle(
    title: string,
    content: string,
    metadata: PostMetadata,
    featuredImageId?: number
  ): Promise<PostResult> {
    try {
      console.log('🚀 WordPress REST API Slug重複対応版 開始');
      
      // slugが指定されている場合、既存記事をチェック
      let existingPostId: number | null = null;
      if (metadata.slug) {
        console.log('🔍 既存記事チェック - slug:', metadata.slug);
        existingPostId = await this.findPostBySlug(metadata.slug);
        
        if (existingPostId) {
          console.log('📝 既存記事発見 - 更新処理に切り替え ID:', existingPostId);
          return await this.updateExistingPost(
            existingPostId, 
            title, 
            content, 
            metadata, 
            featuredImageId
          );
        } else {
          console.log('✨ 新規記事として作成');
        }
      }
      
      // 新規投稿処理（既存コード）
      return await this.createNewPost(title, content, metadata, featuredImageId);

    } catch (error) {
      console.error('❌ 投稿エラー:', error);
      return {
        success: false,
        error: `投稿エラー: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Slugで既存記事を検索
   */
  private async findPostBySlug(slug: string): Promise<number | null> {
    try {
      const url = `${this.config.apiUrl}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}&per_page=1`;
      
      const response = await fetch(url, {
        headers: { 'Authorization': this.getAuthHeader() }
      });

      if (response.ok) {
        const posts = await response.json();
        if (posts.length > 0) {
          console.log('🔍 既存記事詳細:', {
            id: posts[0].id,
            title: posts[0].title.rendered,
            slug: posts[0].slug,
            status: posts[0].status
          });
          return posts[0].id;
        }
      } else {
        const errorText = await response.text();
        console.warn('⚠️ 記事検索でエラー:', response.status, response.statusText);
        console.warn('   アクセスURL:', url);
        if (response.status === 404) {
          console.error('❌ 404エラー: WordPress REST APIが見つかりません');
          console.error('   確認事項:');
          console.error('   1. API URLが正しいか: ' + this.config.apiUrl);
          console.error('   2. WordPress REST APIが有効になっているか');
          console.error('   3. パーマリンク設定が「基本」になっていないか（設定 > パーマリンク設定）');
          console.error('   4. プラグインやテーマがREST APIを無効化していないか');
        }
        console.warn('   エラー詳細:', errorText.substring(0, 200));
      }

      return null;
    } catch (error) {
      console.error('❌ 記事検索エラー:', error);
      return null;
    }
  }

  /**
   * 既存記事を更新
   */
  private async updateExistingPost(
    postId: number,
    title: string,
    content: string,
    metadata: PostMetadata,
    featuredImageId?: number
  ): Promise<PostResult> {
    try {
      console.log('📝 既存記事更新開始 - ID:', postId);

      // カテゴリ名をIDに変換
      let categoryIds: number[] = [];
      const categoryNames = this.extractCategoryNames(metadata);
      
      if (categoryNames.length > 0) {
        console.log('📂 カテゴリ名検出:', categoryNames);
        categoryIds = await this.convertCategoriesToIds(categoryNames);
        console.log('🔢 変換後カテゴリID:', categoryIds);
      }

      const url = `${this.config.apiUrl}/wp-json/wp/v2/posts/${postId}`;
      
      const updateData: any = {
        title: title,
        content: content,
        status: metadata.status || 'draft'
      };

      // オプション項目の追加
      if (metadata.slug) updateData.slug = metadata.slug;
      if (metadata.date) updateData.date = metadata.date;
      if (featuredImageId) updateData.featured_media = featuredImageId;

      // カテゴリIDを設定
      if (categoryIds.length > 0) {
        updateData.categories = categoryIds;
        console.log('📂 更新カテゴリID:', categoryIds);
      }

      // SEOメタデータ設定
      if (metadata.meta_description) {
        updateData.excerpt = metadata.meta_description;
        updateData.meta = {
          'meta_description': metadata.meta_description,
          '_yoast_wpseo_metadesc': metadata.meta_description,
          'rank_math_description': metadata.meta_description
        };
        console.log('📝 meta_description更新:', metadata.meta_description.substring(0, 50) + '...');
      }

      // Polylang対応
      if (metadata.language) {
        updateData.lang = metadata.language;
        if (!updateData.meta) updateData.meta = {};
        updateData.meta.language = metadata.language;
        console.log('🌐 言語設定更新:', metadata.language);
      }

      console.log('📤 更新データ送信:', JSON.stringify(updateData, null, 2));

      const response = await fetch(url, {
        method: 'POST', // WordPressのREST APIは更新もPOSTを使用
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify(updateData)
      });

      console.log('📥 更新レスポンス:', response.status, response.statusText);

      if (response.ok) {
        const result = await response.json();
        console.log('✅ 記事更新成功:', {
          id: result.id,
          title: result.title.rendered,
          categories: result.categories,
          url: result.link
        });

        return {
          success: true,
          postId: result.id,
          url: result.link,
          isUpdate: true
        };
      } else {
        const errorText = await response.text();
        console.error('❌ 更新失敗:', errorText);
        console.error('   アクセスURL:', url);
        
        let errorMessage = `記事更新失敗: ${response.status} ${response.statusText}`;
        if (response.status === 404) {
          errorMessage += '\n\n404エラー: WordPress REST APIエンドポイントが見つかりません。\n';
          errorMessage += '確認事項:\n';
          errorMessage += '1. API URLが正しいか確認してください\n';
          errorMessage += '2. WordPress REST APIが有効になっているか確認してください\n';
          errorMessage += '3. パーマリンク設定を「基本」以外に変更してください（設定 > パーマリンク設定）\n';
          errorMessage += '4. プラグインやテーマがREST APIを無効化していないか確認してください\n';
          errorMessage += `\nアクセスしようとしたURL: ${url}`;
        } else {
          errorMessage += ` - ${errorText.substring(0, 200)}`;
        }
        
        return {
          success: false,
          error: errorMessage
        };
      }

    } catch (error) {
      console.error('❌ 更新エラー:', error);
      return {
        success: false,
        error: `更新エラー: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 新規記事作成
   */
  private async createNewPost(
    title: string,
    content: string,
    metadata: PostMetadata,
    featuredImageId?: number
  ): Promise<PostResult> {
    // カテゴリ名をIDに変換
    let categoryIds: number[] = [];
    const categoryNames = this.extractCategoryNames(metadata);
    
    if (categoryNames.length > 0) {
      console.log('📂 カテゴリ名検出:', categoryNames);
      categoryIds = await this.convertCategoriesToIds(categoryNames);
      console.log('🔢 変換後カテゴリID:', categoryIds);
    }

    const url = `${this.config.apiUrl}/wp-json/wp/v2/posts`;
    
    const postData: any = {
      title: title,
      content: content,
      status: metadata.status || 'draft'
    };

    // オプション項目の追加
    if (metadata.slug) postData.slug = metadata.slug;
    if (metadata.date) postData.date = metadata.date;
    if (featuredImageId) postData.featured_media = featuredImageId;

    // カテゴリIDを設定（整数の配列として）
    if (categoryIds.length > 0) {
      postData.categories = categoryIds;
      console.log('📂 送信カテゴリID:', categoryIds);
    }

    // SEOメタデータ設定
    if (metadata.meta_description) {
      postData.excerpt = metadata.meta_description;
      postData.meta = {
        'meta_description': metadata.meta_description,
        '_yoast_wpseo_metadesc': metadata.meta_description,
        'rank_math_description': metadata.meta_description
      };
      console.log('📝 meta_description設定:', metadata.meta_description.substring(0, 50) + '...');
    }

    // Polylang対応（言語設定）
    if (metadata.language) {
      postData.lang = metadata.language;
      if (!postData.meta) postData.meta = {};
      postData.meta.language = metadata.language;
      console.log('🌐 言語設定:', metadata.language);
    }

    console.log('📤 最終送信データ:', JSON.stringify(postData, null, 2));

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify(postData)
    });

    console.log('📥 レスポンス:', response.status, response.statusText);

    if (response.ok) {
      const result = await response.json();
      console.log('✅ 投稿成功:', {
        id: result.id,
        title: result.title.rendered,
        categories: result.categories,
        url: result.link
      });

      // 投稿後確認
      await this.verifyPost(result.id, categoryNames, categoryIds);

      return {
        success: true,
        postId: result.id,
        url: result.link,
        isUpdate: false
      };
    } else {
      const errorText = await response.text();
      console.error('❌ 投稿失敗:', errorText);
      console.error('   アクセスURL:', url);
      
      // エラー詳細を解析
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.code === 'rest_invalid_param' && errorJson.message.includes('categories')) {
          return {
            success: false,
            error: `カテゴリ設定エラー: WordPressが整数のカテゴリIDを期待していますが、文字列が送信された可能性があります。変換処理を確認してください。`
          };
        }
      } catch (parseError) {
        // JSON解析失敗は無視
      }
      
      let errorMessage = `投稿失敗: ${response.status} ${response.statusText}`;
      if (response.status === 404) {
        errorMessage += '\n\n404エラー: WordPress REST APIエンドポイントが見つかりません。\n';
        errorMessage += '確認事項:\n';
        errorMessage += '1. API URLが正しいか確認してください（末尾に/を付けないでください）\n';
        errorMessage += '   例: https://example.com （正）\n';
        errorMessage += '   例: https://example.com/ （誤）\n';
        errorMessage += '   例: https://example.com/wp-json （誤）\n';
        errorMessage += '2. WordPress REST APIが有効になっているか確認してください\n';
        errorMessage += '3. パーマリンク設定を「基本」以外に変更してください（設定 > パーマリンク設定）\n';
        errorMessage += '4. プラグインやテーマがREST APIを無効化していないか確認してください\n';
        errorMessage += `\nアクセスしようとしたURL: ${url}`;
      } else {
        errorMessage += ` - ${errorText.substring(0, 200)}`;
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * メタデータからカテゴリ名を抽出
   */
  private extractCategoryNames(metadata: PostMetadata): string[] {
    // 複数のキーをチェック
    const categoryKeys = ['categories', 'custom_tags', 'tags', 'labels', 'topics'];
    
    for (const key of categoryKeys) {
      if (metadata[key] && Array.isArray(metadata[key])) {
        console.log(`🔍 カテゴリ名検出 (${key}):`, metadata[key]);
        return metadata[key];
      }
    }
    
    return [];
  }

  /**
   * カテゴリ名の配列をカテゴリIDの配列に変換
   */
  private async convertCategoriesToIds(categoryNames: string[]): Promise<number[]> {
    const categoryIds: number[] = [];

    // 既存カテゴリを取得
    const existingCategories = await this.fetchAllCategories();
    console.log('📋 既存カテゴリ取得完了:', existingCategories.length + '個');

    for (const categoryName of categoryNames) {
      const trimmedName = categoryName.trim();
      if (!trimmedName) continue;

      console.log(`\n🔍 処理中: "${trimmedName}"`);

      // 既存カテゴリから検索
      const existingCategory = existingCategories.find(cat => cat.name === trimmedName);
      
      if (existingCategory) {
        categoryIds.push(existingCategory.id);
        console.log(`  ✅ 既存カテゴリ使用: "${trimmedName}" (ID: ${existingCategory.id})`);
      } else {
        // 新規作成
        console.log(`  🆕 カテゴリ新規作成: "${trimmedName}"`);
        const newCategoryId = await this.createCategory(trimmedName);
        
        if (newCategoryId) {
          categoryIds.push(newCategoryId);
          console.log(`  ✅ 作成成功: "${trimmedName}" (ID: ${newCategoryId})`);
        } else {
          console.log(`  ❌ 作成失敗: "${trimmedName}"`);
        }
      }
    }

    return categoryIds;
  }

  /**
   * 全カテゴリを取得
   */
  private async fetchAllCategories(): Promise<Array<{id: number, name: string, slug: string}>> {
    try {
      const url = `${this.config.apiUrl}/wp-json/wp/v2/categories?per_page=100`;
      const response = await fetch(url, {
        headers: { 'Authorization': this.getAuthHeader() }
      });

      if (response.ok) {
        const categories = await response.json();
        return categories;
      } else {
        const errorText = await response.text();
        console.error('❌ カテゴリ取得失敗:', response.status, response.statusText);
        console.error('   アクセスURL:', url);
        if (response.status === 404) {
          console.error('   404エラー: WordPress REST APIが見つかりません');
        }
        console.error('   エラー詳細:', errorText.substring(0, 200));
        return [];
      }
    } catch (error) {
      console.error('❌ カテゴリ取得エラー:', error);
      return [];
    }
  }

  /**
   * カテゴリを新規作成
   */
  private async createCategory(categoryName: string): Promise<number | null> {
    try {
      const url = `${this.config.apiUrl}/wp-json/wp/v2/categories`;
      
      const categoryData = {
        name: categoryName,
        slug: this.generateCategorySlug(categoryName)
      };

      console.log(`    📤 作成データ:`, categoryData);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify(categoryData)
      });

      console.log(`    📥 作成レスポンス: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const result = await response.json();
        return result.id;
      } else {
        const errorText = await response.text();
        console.log(`    ❌ 作成失敗: ${errorText}`);
        console.log(`    アクセスURL: ${url}`);
        
        if (response.status === 404) {
          console.error('    404エラー: WordPress REST APIが見つかりません');
        }
        
        // エラー詳細確認
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.code === 'term_exists') {
            // すでに存在する場合は既存のIDを取得
            console.log(`    ℹ️ カテゴリ「${categoryName}」は既に存在`);
            const existingId = errorJson.data?.term_id;
            if (existingId) {
              console.log(`    🔍 既存ID取得: ${existingId}`);
              return existingId;
            } else {
              // 再検索
              const existingCategory = await this.findCategoryByName(categoryName);
              return existingCategory;
            }
          }
        } catch (parseError) {
          // JSON解析失敗
        }
        
        return null;
      }
    } catch (error) {
      console.log(`    ❌ 作成エラー:`, error);
      return null;
    }
  }

  /**
   * カテゴリ名でカテゴリIDを検索
   */
  private async findCategoryByName(categoryName: string): Promise<number | null> {
    try {
      const categories = await this.fetchAllCategories();
      const found = categories.find(cat => cat.name === categoryName);
      return found ? found.id : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * カテゴリスラッグ生成（日本語対応）
   */
  private generateCategorySlug(categoryName: string): string {
    // 基本的なスラッグ生成
    let slug = categoryName
      .toLowerCase()
      .replace(/\s+/g, '-')  // スペースをハイフンに
      .replace(/[^\w\-\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '')  // 日本語文字とアルファベット、ハイフンのみ許可
      .replace(/--+/g, '-')  // 連続するハイフンを1つに
      .replace(/^-+|-+$/g, '');  // 先頭と末尾のハイフンを除去
    
    // 空になった場合は代替スラッグ
    if (!slug) {
      slug = 'category-' + Date.now();
    }
    
    return slug;
  }

  /**
   * 投稿後の確認
   */
  private async verifyPost(postId: number, expectedCategoryNames: string[], actualCategoryIds: number[]): Promise<void> {
    console.log('🔍 投稿後確認 - Post ID:', postId);

    try {
      const url = `${this.config.apiUrl}/wp-json/wp/v2/posts/${postId}`;
      const response = await fetch(url, {
        headers: { 'Authorization': this.getAuthHeader() }
      });

      if (response.ok) {
        const post = await response.json();
        
        console.log('📊 投稿確認結果:');
        console.log('  期待カテゴリ名:', expectedCategoryNames);
        console.log('  送信したID:', actualCategoryIds);
        console.log('  実際のカテゴリID:', post.categories);

        // カテゴリの詳細情報取得
        if (post.categories && post.categories.length > 0) {
          console.log('📂 設定されたカテゴリ詳細:');
          for (const categoryId of post.categories) {
            const categoryInfo = await this.getCategoryInfo(categoryId);
            if (categoryInfo) {
              console.log(`  - "${categoryInfo.name}" (ID: ${categoryId}, スラッグ: ${categoryInfo.slug})`);
            }
          }
          
          // 成功判定
          const categoriesMatch = actualCategoryIds.every(id => post.categories.includes(id));
          if (categoriesMatch && post.categories.length === actualCategoryIds.length) {
            console.log('🎉 カテゴリ設定完全成功！');
          } else {
            console.log('⚠️ カテゴリ設定に差異があります');
          }
        } else {
          console.log('❌ カテゴリが設定されていません');
        }

      }
    } catch (error) {
      console.error('❌ 投稿後確認エラー:', error);
    }
  }

  /**
   * カテゴリ情報取得
   */
  private async getCategoryInfo(categoryId: number): Promise<any | null> {
    try {
      const url = `${this.config.apiUrl}/wp-json/wp/v2/categories/${categoryId}`;
      const response = await fetch(url, {
        headers: { 'Authorization': this.getAuthHeader() }
      });
      return response.ok ? await response.json() : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 接続テスト
   */
  public async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log('🔌 WordPress接続テスト開始');
      console.log('   設定されたAPI URL:', this.config.apiUrl);
      
      // まずREST APIの基本エンドポイントをテスト
      const baseUrl = `${this.config.apiUrl}/wp-json`;
      console.log('   基本エンドポイントテスト:', baseUrl);
      
      try {
        const baseResponse = await fetch(baseUrl);
        if (!baseResponse.ok && baseResponse.status === 404) {
          return {
            success: false,
            error: `404エラー: WordPress REST APIが見つかりません。\n\n確認事項:\n1. API URLが正しいか: ${this.config.apiUrl}\n2. パーマリンク設定を「基本」以外に変更してください（設定 > パーマリンク設定）\n3. プラグインやテーマがREST APIを無効化していないか確認してください\n\nアクセスURL: ${baseUrl}`
          };
        }
      } catch (baseError) {
        console.warn('   基本エンドポイントテスト失敗（続行）:', baseError);
      }
      
      const url = `${this.config.apiUrl}/wp-json/wp/v2/users/me`;
      console.log('   ユーザー情報取得:', url);
      const response = await fetch(url, {
        headers: { 'Authorization': this.getAuthHeader() }
      });
      
      if (response.ok) {
        const userInfo = await response.json();
        console.log('✅ 基本接続成功 - ユーザー:', userInfo.name);
        
        // カテゴリ取得テスト
        const categories = await this.fetchAllCategories();
        console.log('✅ カテゴリ取得成功:', categories.length + '個');
        
        // カテゴリ作成権限テスト
        const testCategoryName = 'test-category-' + Date.now();
        const testId = await this.createCategory(testCategoryName);
        if (testId) {
          console.log('✅ カテゴリ作成権限確認');
          // テストカテゴリを削除
          await this.deleteCategory(testId);
        } else {
          console.log('⚠️ カテゴリ作成権限に問題がある可能性があります');
        }
        
        return { success: true };
      } else {
        const errorText = await response.text();
        let errorMessage = `接続エラー: ${response.status} ${response.statusText}`;
        
        if (response.status === 404) {
          errorMessage += '\n\n404エラー: WordPress REST APIエンドポイントが見つかりません。\n';
          errorMessage += '確認事項:\n';
          errorMessage += `1. API URLが正しいか: ${this.config.apiUrl}\n`;
          errorMessage += '2. API URLの末尾に/を付けていないか確認してください\n';
          errorMessage += '3. パーマリンク設定を「基本」以外に変更してください（設定 > パーマリンク設定）\n';
          errorMessage += '4. プラグインやテーマがREST APIを無効化していないか確認してください\n';
          errorMessage += `\nアクセスしようとしたURL: ${url}`;
        } else {
          errorMessage += ` - ${errorText.substring(0, 200)}`;
        }
        
        return {
          success: false,
          error: errorMessage
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        error: `接続エラー: ${errorMessage}\n\nAPI URL: ${this.config.apiUrl}`
      };
    }
  }

  /**
   * カテゴリ削除（テスト用）
   */
  private async deleteCategory(categoryId: number): Promise<void> {
    try {
      const url = `${this.config.apiUrl}/wp-json/wp/v2/categories/${categoryId}?force=true`;
      await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': this.getAuthHeader() }
      });
      console.log('🗑️ テストカテゴリ削除完了:', categoryId);
    } catch (error) {
      console.log('⚠️ テストカテゴリ削除失敗（問題ありません）');
    }
  }

  /**
   * デバッグ用：YAML例生成
   */
  public generateYamlExample(): string {
    return `---
title: "記事タイトル"
slug: "article-slug"
meta_description: "記事の説明文"
categories: [プログラミング, WordPress, VS Code]
language: ja
status: draft
---

# 記事本文

slugが指定されている場合：
1. 既存記事を検索
2. 見つかれば更新、見つからなければ新規作成
3. 同じslugの記事は上書きされます`;
  }

  /**
   * 認証ヘッダー生成
   */
  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
    return `Basic ${credentials}`;
  }
}

