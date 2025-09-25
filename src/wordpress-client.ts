/**
 * WordPress REST API デバッグ版
 * 問題の根本原因を特定するための詳細デバッグ機能付き
 */

import { WordPressConfig, WordPressPost, PostResult, PostMetadata } from './types';

export class WordPressClient {
  private config: WordPressConfig;

  constructor(config: WordPressConfig) {
    this.config = config;
  }

  /**
   * 記事投稿（フルデバッグ版）
   */
  public async postArticle(
    title: string,
    content: string,
    metadata: PostMetadata,
    featuredImageId?: number
  ): Promise<PostResult> {
    try {
      console.log('🚀 WordPress REST API デバッグ開始');
      console.log('='.repeat(60));

      // Step 1: 基本的な接続確認
      await this.debugConnection();

      // Step 2: カテゴリの詳細分析
      const categoryDebug = await this.debugCategories(metadata.categories || []);

      // Step 3: 最もシンプルな投稿テスト
      const simpleResult = await this.testSimplePost();

      // Step 4: カテゴリ付き投稿テスト
      const categoryResult = await this.testCategoryPost(categoryDebug.validIds);

      // Step 5: 実際の投稿実行
      const result = await this.executeActualPost(title, content, metadata, featuredImageId, categoryDebug.validIds);

      return result;

    } catch (error) {
      return {
        success: false,
        error: `デバッグ実行エラー: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 基本接続デバッグ
   */
  private async debugConnection(): Promise<void> {
    console.log('\n📡 基本接続デバッグ');
    console.log('-'.repeat(30));

    try {
      // 認証テスト
      const authUrl = `${this.config.apiUrl}/wp-json/wp/v2/users/me`;
      console.log(`🔍 認証テスト: ${authUrl}`);

      const authResponse = await fetch(authUrl, {
        headers: { 'Authorization': this.getAuthHeader() }
      });

      console.log(`📥 認証レスポンス: ${authResponse.status} ${authResponse.statusText}`);

      if (authResponse.ok) {
        const userInfo = await authResponse.json();
        console.log(`✅ 認証成功 - ユーザー: ${userInfo.name} (ID: ${userInfo.id})`);
        console.log(`📋 権限: ${userInfo.capabilities ? Object.keys(userInfo.capabilities).slice(0, 5).join(', ') + '...' : '不明'}`);
      } else {
        const errorText = await authResponse.text();
        console.log(`❌ 認証失敗: ${errorText}`);
      }

      // 基本API確認
      const basicUrl = `${this.config.apiUrl}/wp-json/wp/v2/posts?per_page=1`;
      console.log(`🔍 基本API確認: ${basicUrl}`);

      const basicResponse = await fetch(basicUrl);
      console.log(`📥 基本APIレスポンス: ${basicResponse.status} ${basicResponse.statusText}`);

      if (basicResponse.ok) {
        console.log('✅ 基本API接続正常');
      } else {
        console.log('❌ 基本API接続失敗');
      }

    } catch (error) {
      console.error('❌ 接続デバッグエラー:', error);
    }
  }

  /**
   * カテゴリ詳細デバッグ
   */
  private async debugCategories(requestedCategories: string[]): Promise<CategoryDebugResult> {
    console.log('\n📂 カテゴリ詳細デバッグ');
    console.log('-'.repeat(30));

    const result: CategoryDebugResult = {
      validIds: [],
      issues: []
    };

    try {
      // 全カテゴリ取得
      const categoriesUrl = `${this.config.apiUrl}/wp-json/wp/v2/categories?per_page=100`;
      console.log(`🔍 カテゴリ取得: ${categoriesUrl}`);

      const categoriesResponse = await fetch(categoriesUrl, {
        headers: { 'Authorization': this.getAuthHeader() }
      });

      console.log(`📥 カテゴリレスポンス: ${categoriesResponse.status} ${categoriesResponse.statusText}`);

      if (!categoriesResponse.ok) {
        const errorText = await categoriesResponse.text();
        console.log(`❌ カテゴリ取得失敗: ${errorText}`);
        result.issues.push(`カテゴリ取得失敗: ${errorText}`);
        return result;
      }

      const allCategories = await categoriesResponse.json();
      console.log(`📋 利用可能カテゴリ数: ${allCategories.length}`);

      // 全カテゴリを詳細表示
      console.log('\n📋 全カテゴリ一覧:');
      allCategories.forEach((cat: any, index: number) => {
        console.log(`  ${index + 1}. "${cat.name}" (ID: ${cat.id}, スラッグ: ${cat.slug}, 投稿数: ${cat.count})`);
      });

      // 要求されたカテゴリの解析
      console.log('\n🔍 要求カテゴリの解析:');
      for (const categoryName of requestedCategories) {
        console.log(`\n処理中: "${categoryName}"`);

        const exactMatch = allCategories.find((cat: any) => cat.name === categoryName);
        if (exactMatch) {
          result.validIds.push(exactMatch.id);
          console.log(`  ✅ 完全一致: ID ${exactMatch.id}`);
        } else {
          console.log(`  ❌ 完全一致なし`);

          // 部分一致検索
          const partialMatches = allCategories.filter((cat: any) => 
            cat.name.toLowerCase().includes(categoryName.toLowerCase()) ||
            categoryName.toLowerCase().includes(cat.name.toLowerCase())
          );

          if (partialMatches.length > 0) {
            console.log(`  🔍 部分一致候補:`);
            partialMatches.forEach((cat: any) => {
              console.log(`    - "${cat.name}" (ID: ${cat.id})`);
            });
          }

          // 新規作成テスト
          console.log(`  🆕 新規作成テスト...`);
          const newId = await this.testCreateCategory(categoryName);
          if (newId) {
            result.validIds.push(newId);
            console.log(`  ✅ 新規作成成功: ID ${newId}`);
          } else {
            console.log(`  ❌ 新規作成失敗`);
            result.issues.push(`カテゴリ "${categoryName}" の作成失敗`);
          }
        }
      }

      console.log(`\n📂 最終的に使用するカテゴリID: [${result.validIds.join(', ')}]`);

    } catch (error) {
      console.error('❌ カテゴリデバッグエラー:', error);
      result.issues.push(`カテゴリデバッグエラー: ${error}`);
    }

    return result;
  }

  /**
   * カテゴリ作成テスト
   */
  private async testCreateCategory(categoryName: string): Promise<number | null> {
    try {
      const url = `${this.config.apiUrl}/wp-json/wp/v2/categories`;
      
      const categoryData = {
        name: categoryName,
        slug: categoryName.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\-\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '')
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
        console.log(`    ✅ 作成成功:`, result);
        return result.id;
      } else {
        const errorText = await response.text();
        console.log(`    ❌ 作成失敗: ${errorText}`);
        return null;
      }
    } catch (error) {
      console.log(`    ❌ 作成エラー:`, error);
      return null;
    }
  }

  /**
   * シンプル投稿テスト（カテゴリなし）
   */
  private async testSimplePost(): Promise<void> {
    console.log('\n📝 シンプル投稿テスト（カテゴリなし）');
    console.log('-'.repeat(30));

    try {
      const url = `${this.config.apiUrl}/wp-json/wp/v2/posts`;
      
      const simplePostData = {
        title: 'テスト投稿 - ' + new Date().getTime(),
        content: 'これはカテゴリなしのテスト投稿です。',
        status: 'draft'
      };

      console.log(`📤 送信データ:`, simplePostData);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify(simplePostData)
      });

      console.log(`📥 レスポンス: ${response.status} ${response.statusText}`);
      console.log(`📋 レスポンスヘッダー:`);
      response.headers.forEach((value, key) => {
        console.log(`  ${key}: ${value}`);
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ シンプル投稿成功:`);
        console.log(`  ID: ${result.id}`);
        console.log(`  カテゴリ: [${result.categories?.join(', ') || 'なし'}]`);
        console.log(`  URL: ${result.link}`);

        // 作成した投稿を削除
        await this.cleanupTestPost(result.id);
      } else {
        const errorText = await response.text();
        console.log(`❌ シンプル投稿失敗: ${errorText}`);
      }

    } catch (error) {
      console.error('❌ シンプル投稿テストエラー:', error);
    }
  }

  /**
   * カテゴリ付き投稿テスト
   */
  private async testCategoryPost(categoryIds: number[]): Promise<void> {
    console.log('\n📝 カテゴリ付き投稿テスト');
    console.log('-'.repeat(30));

    if (categoryIds.length === 0) {
      console.log('⚠️ テスト用カテゴリIDがありません');
      return;
    }

    try {
      const url = `${this.config.apiUrl}/wp-json/wp/v2/posts`;
      
      const categoryPostData = {
        title: 'カテゴリテスト投稿 - ' + new Date().getTime(),
        content: `これはカテゴリ付きのテスト投稿です。カテゴリID: [${categoryIds.join(', ')}]`,
        status: 'draft',
        categories: categoryIds
      };

      console.log(`📤 送信データ:`, categoryPostData);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify(categoryPostData)
      });

      console.log(`📥 レスポンス: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ カテゴリ付き投稿成功:`);
        console.log(`  ID: ${result.id}`);
        console.log(`  設定したカテゴリID: [${categoryIds.join(', ')}]`);
        console.log(`  実際のカテゴリID: [${result.categories?.join(', ') || 'なし'}]`);
        console.log(`  URL: ${result.link}`);

        // カテゴリが正しく設定されたかチェック
        const categoriesMatch = categoryIds.every(id => result.categories?.includes(id));
        if (categoriesMatch) {
          console.log(`🎉 カテゴリ設定成功！`);
        } else {
          console.log(`⚠️ カテゴリ設定に問題があります`);
        }

        // 作成した投稿を削除
        await this.cleanupTestPost(result.id);
      } else {
        const errorText = await response.text();
        console.log(`❌ カテゴリ付き投稿失敗: ${errorText}`);
      }

    } catch (error) {
      console.error('❌ カテゴリ付き投稿テストエラー:', error);
    }
  }

  /**
   * 実際の投稿実行
   */
  private async executeActualPost(
    title: string,
    content: string,
    metadata: PostMetadata,
    featuredImageId?: number,
    categoryIds: number[] = []
  ): Promise<PostResult> {
    console.log('\n📝 実際の投稿実行');
    console.log('-'.repeat(30));

    try {
      const url = `${this.config.apiUrl}/wp-json/wp/v2/posts`;
      
      const postData: any = {
        title: title,
        content: content,
        status: metadata.status || 'draft'
      };

      if (metadata.slug) postData.slug = metadata.slug;
      if (metadata.date) postData.date = metadata.date;
      if (featuredImageId) postData.featured_media = featuredImageId;

      if (categoryIds.length > 0) {
        postData.categories = categoryIds;
        console.log(`📂 設定カテゴリID: [${categoryIds.join(', ')}]`);
      }

      if (metadata.meta_description) {
        postData.meta = {
          'fit_seo_description-single': metadata.meta_description,
          'description': metadata.meta_description,
          'meta_description': metadata.meta_description,
          '_yoast_wpseo_metadesc': metadata.meta_description,
          'rank_math_description': metadata.meta_description
        };
        postData.excerpt = metadata.meta_description;
      }

      console.log(`📤 最終投稿データ:`, JSON.stringify(postData, null, 2));

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': this.getAuthHeader(),
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify(postData)
      });

      console.log(`📥 投稿レスポンス: ${response.status} ${response.statusText}`);

      if (response.ok) {
        const result = await response.json();
        console.log(`✅ 投稿成功:`);
        console.log(`  ID: ${result.id}`);
        console.log(`  タイトル: ${result.title.rendered}`);
        console.log(`  設定予定カテゴリ: [${categoryIds.join(', ')}]`);
        console.log(`  実際のカテゴリ: [${result.categories?.join(', ') || 'なし'}]`);
        console.log(`  URL: ${result.link}`);

        // 詳細確認
        await this.detailedPostVerification(result.id);

        return {
          success: true,
          postId: result.id,
          url: result.link
        };
      } else {
        const errorText = await response.text();
        console.log(`❌ 投稿失敗: ${errorText}`);
        return {
          success: false,
          error: `投稿失敗: ${response.status} ${response.statusText} - ${errorText}`
        };
      }

    } catch (error) {
      console.error('❌ 投稿実行エラー:', error);
      return {
        success: false,
        error: `投稿実行エラー: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 詳細投稿確認
   */
  private async detailedPostVerification(postId: number): Promise<void> {
    console.log('\n🔍 詳細投稿確認');
    console.log('-'.repeat(30));

    try {
      const url = `${this.config.apiUrl}/wp-json/wp/v2/posts/${postId}`;
      const response = await fetch(url, {
        headers: { 'Authorization': this.getAuthHeader() }
      });

      if (response.ok) {
        const post = await response.json();
        
        console.log(`📊 投稿詳細:`);
        console.log(`  ID: ${post.id}`);
        console.log(`  タイトル: ${post.title.rendered}`);
        console.log(`  ステータス: ${post.status}`);
        console.log(`  カテゴリID: [${post.categories?.join(', ') || 'なし'}]`);
        console.log(`  タグID: [${post.tags?.join(', ') || 'なし'}]`);
        console.log(`  作成日時: ${post.date}`);
        console.log(`  更新日時: ${post.modified}`);

        if (post.categories && post.categories.length > 0) {
          console.log(`\n📂 カテゴリ詳細:`);
          for (const categoryId of post.categories) {
            const categoryInfo = await this.getCategoryInfo(categoryId);
            if (categoryInfo) {
              console.log(`  - "${categoryInfo.name}" (ID: ${categoryId}, スラッグ: ${categoryInfo.slug})`);
            }
          }
        } else {
          console.log(`\n⚠️ カテゴリが設定されていません`);
          console.log(`\n🔧 考えられる原因:`);
          console.log(`  1. カテゴリIDが正しくない`);
          console.log(`  2. ユーザー権限の問題`);
          console.log(`  3. プラグインの干渉`);
          console.log(`  4. WordPressの設定問題`);
        }

      }
    } catch (error) {
      console.error('❌ 詳細確認エラー:', error);
    }
  }

  /**
   * テスト投稿削除
   */
  private async cleanupTestPost(postId: number): Promise<void> {
    try {
      const url = `${this.config.apiUrl}/wp-json/wp/v2/posts/${postId}?force=true`;
      await fetch(url, {
        method: 'DELETE',
        headers: { 'Authorization': this.getAuthHeader() }
      });
      console.log(`🗑️ テスト投稿削除: ID ${postId}`);
    } catch (error) {
      console.log(`⚠️ テスト投稿削除失敗: ID ${postId}`);
    }
  }

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

  public async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const url = `${this.config.apiUrl}/wp-json/wp/v2/users/me`;
      const response = await fetch(url, {
        headers: { 'Authorization': this.getAuthHeader() }
      });
      if (response.ok) {
        return { success: true };
      } else {
        const errorText = await response.text();
        return {
          success: false,
          error: `接続エラー: ${response.status} ${response.statusText} - ${errorText}`
        };
      }
    } catch (error) {
      return {
        success: false,
        error: `接続エラー: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  private getAuthHeader(): string {
    const credentials = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
    return `Basic ${credentials}`;
  }
}

// デバッグ用型定義
interface CategoryDebugResult {
  validIds: number[];
  issues: string[];
}