"use strict";
/**
 * WordPress Post Extension - Phase 3
 * WordPress REST API連携
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WordPressClient = void 0;
class WordPressClient {
    constructor(config) {
        this.config = config;
    }
    /**
     * 記事を投稿または更新
     */
    async postArticle(title, content, metadata, featuredImageId) {
        try {
            // 既存記事を検索
            const existingPost = await this.findExistingPost(title, metadata.slug);
            // カテゴリとタグのIDを取得
            const categoryIds = await this.resolveCategoryIds(metadata.categories || []);
            const tagIds = await this.resolveTagIds(metadata.tags || []);
            // 投稿データを構築
            const postData = {
                title: title,
                content: content,
                status: metadata.status || 'draft',
                categories: categoryIds,
                tags: tagIds,
                slug: metadata.slug,
                date: metadata.date
            };
            // アイキャッチ画像を設定
            if (featuredImageId) {
                postData.featured_media = featuredImageId;
            }
            // Polylang対応（言語設定）
            if (metadata.language) {
                postData.lang = metadata.language;
            }
            // SEOメタデータ設定
            if (metadata.meta_description) {
                postData.meta = {
                    _yoast_wpseo_metadesc: metadata.meta_description,
                    description: metadata.meta_description
                };
            }
            let result;
            if (existingPost) {
                // 既存記事を更新
                postData.id = existingPost.id;
                result = await this.updatePost(postData);
                result.isUpdate = true;
            }
            else {
                // 新規記事を作成
                result = await this.createPost(postData);
                result.isUpdate = false;
            }
            return result;
        }
        catch (error) {
            return {
                success: false,
                error: `記事投稿エラー: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
    /**
     * 新規記事作成
     */
    async createPost(postData) {
        const url = `${this.config.apiUrl}/wp-json/wp/v2/posts`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': this.getAuthHeader(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(postData)
        });
        if (!response.ok) {
            const errorText = await response.text();
            return {
                success: false,
                error: `記事作成エラー: ${response.status} ${response.statusText} - ${errorText}`
            };
        }
        const result = await response.json();
        return {
            success: true,
            postId: result.id,
            url: result.link
        };
    }
    /**
     * 既存記事更新
     */
    async updatePost(postData) {
        const url = `${this.config.apiUrl}/wp-json/wp/v2/posts/${postData.id}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': this.getAuthHeader(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(postData)
        });
        if (!response.ok) {
            const errorText = await response.text();
            return {
                success: false,
                error: `記事更新エラー: ${response.status} ${response.statusText} - ${errorText}`
            };
        }
        const result = await response.json();
        return {
            success: true,
            postId: result.id,
            url: result.link
        };
    }
    /**
     * 既存記事を検索（スラッグまたはタイトルで）
     */
    async findExistingPost(title, slug) {
        try {
            // まずスラッグで検索
            if (slug) {
                const slugResult = await this.searchPostBySlug(slug);
                if (slugResult)
                    return slugResult;
            }
            // スラッグで見つからない場合はタイトルで検索
            const titleResult = await this.searchPostByTitle(title);
            return titleResult;
        }
        catch (error) {
            console.error('既存記事検索エラー:', error);
            return null;
        }
    }
    /**
     * スラッグで記事を検索
     */
    async searchPostBySlug(slug) {
        const url = `${this.config.apiUrl}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': this.getAuthHeader()
            }
        });
        if (response.ok) {
            const posts = await response.json();
            return posts.length > 0 ? posts[0] : null;
        }
        return null;
    }
    /**
     * タイトルで記事を検索
     */
    async searchPostByTitle(title) {
        const url = `${this.config.apiUrl}/wp-json/wp/v2/posts?search=${encodeURIComponent(title)}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': this.getAuthHeader()
            }
        });
        if (response.ok) {
            const posts = await response.json();
            // 完全一致するタイトルを探す
            const exactMatch = posts.find((post) => post.title.rendered === title || post.title.raw === title);
            return exactMatch || null;
        }
        return null;
    }
    /**
     * カテゴリ名をIDに変換（存在しない場合は作成）
     */
    async resolveCategoryIds(categoryNames) {
        const categoryIds = [];
        for (const categoryName of categoryNames) {
            try {
                let category = await this.findCategoryByName(categoryName);
                if (!category) {
                    // カテゴリが存在しない場合は作成
                    category = await this.createCategory(categoryName);
                }
                if (category) {
                    categoryIds.push(category.id);
                }
            }
            catch (error) {
                console.error(`カテゴリ処理エラー: ${categoryName}`, error);
            }
        }
        return categoryIds;
    }
    /**
     * タグ名をIDに変換（存在しない場合は作成）
     */
    async resolveTagIds(tagNames) {
        const tagIds = [];
        for (const tagName of tagNames) {
            try {
                let tag = await this.findTagByName(tagName);
                if (!tag) {
                    // タグが存在しない場合は作成
                    tag = await this.createTag(tagName);
                }
                if (tag) {
                    tagIds.push(tag.id);
                }
            }
            catch (error) {
                console.error(`タグ処理エラー: ${tagName}`, error);
            }
        }
        return tagIds;
    }
    /**
     * カテゴリ名で検索
     */
    async findCategoryByName(name) {
        const url = `${this.config.apiUrl}/wp-json/wp/v2/categories?search=${encodeURIComponent(name)}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': this.getAuthHeader()
            }
        });
        if (response.ok) {
            const categories = await response.json();
            const exactMatch = categories.find((cat) => cat.name === name);
            return exactMatch || null;
        }
        return null;
    }
    /**
     * タグ名で検索
     */
    async findTagByName(name) {
        const url = `${this.config.apiUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(name)}`;
        const response = await fetch(url, {
            headers: {
                'Authorization': this.getAuthHeader()
            }
        });
        if (response.ok) {
            const tags = await response.json();
            const exactMatch = tags.find((tag) => tag.name === name);
            return exactMatch || null;
        }
        return null;
    }
    /**
     * カテゴリ作成
     */
    async createCategory(name) {
        const url = `${this.config.apiUrl}/wp-json/wp/v2/categories`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': this.getAuthHeader(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name })
        });
        if (response.ok) {
            return await response.json();
        }
        return null;
    }
    /**
     * タグ作成
     */
    async createTag(name) {
        const url = `${this.config.apiUrl}/wp-json/wp/v2/tags`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': this.getAuthHeader(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name })
        });
        if (response.ok) {
            return await response.json();
        }
        return null;
    }
    /**
     * WordPress接続テスト
     */
    async testConnection() {
        try {
            const url = `${this.config.apiUrl}/wp-json/wp/v2/users/me`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': this.getAuthHeader()
                }
            });
            if (response.ok) {
                return { success: true };
            }
            else {
                const errorText = await response.text();
                return {
                    success: false,
                    error: `接続エラー: ${response.status} ${response.statusText} - ${errorText}`
                };
            }
        }
        catch (error) {
            return {
                success: false,
                error: `接続エラー: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
    /**
     * 認証ヘッダーを生成
     */
    getAuthHeader() {
        const credentials = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
        return `Basic ${credentials}`;
    }
}
exports.WordPressClient = WordPressClient;
// 使用例
/*
const config = {
  apiUrl: 'https://your-site.com',
  username: 'your-username',
  password: 'your-app-password'
};

const client = new WordPressClient(config);

// 接続テスト
const connectionTest = await client.testConnection();
console.log(connectionTest);

// 記事投稿
const result = await client.postArticle(
  'テスト記事',
  '<p>記事内容</p>',
  {
    categories: ['技術', 'JavaScript'],
    tags: ['WordPress', 'API'],
    status: 'draft',
    meta_description: 'SEO用の説明文'
  },
  123 // featured image ID
);
console.log(result);
*/ 
