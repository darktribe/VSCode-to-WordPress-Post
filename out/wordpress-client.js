"use strict";
/**
 * WordPress Post Extension - Phase 3
 * WordPress REST API連携（FITテーマ対応版）
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
            // SEOメタデータ設定（FITテーマ対応）
            if (metadata.meta_description) {
                console.log('📝 Meta description detected:', metadata.meta_description);
                postData.meta = {
                    // FITテーマ用
                    'fit_seo_description-single': metadata.meta_description,
                    // 汎用フィールド（保険として）
                    'description': metadata.meta_description,
                    'meta_description': metadata.meta_description,
                    // Yoast SEO（他のサイトでも使えるように）
                    '_yoast_wpseo_metadesc': metadata.meta_description,
                    // RankMath SEO（代替）
                    'rank_math_description': metadata.meta_description
                };
                // excerpt フィールドも設定（フォールバック）
                postData.excerpt = metadata.meta_description;
                console.log('📤 Sending meta fields:', postData.meta);
                console.log('📤 Sending excerpt:', postData.excerpt);
            }
            console.log('📤 Full post data being sent:', JSON.stringify(postData, null, 2));
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
     * 新規記事作成（レスポンス詳細ログ付き）
     */
    async createPost(postData) {
        const url = `${this.config.apiUrl}/wp-json/wp/v2/posts`;
        console.log('📡 Sending POST request to:', url);
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': this.getAuthHeader(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(postData)
        });
        console.log('📥 Response status:', response.status);
        console.log('📥 Response headers:', Object.fromEntries(response.headers.entries()));
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Error response:', errorText);
            return {
                success: false,
                error: `記事作成エラー: ${response.status} ${response.statusText} - ${errorText}`
            };
        }
        const result = await response.json();
        console.log('✅ Success response:', JSON.stringify(result, null, 2));
        // metaフィールドがレスポンスに含まれているかチェック
        if (result.meta) {
            console.log('📋 Meta fields in response:', result.meta);
            if (result.meta['fit_seo_description-single']) {
                console.log('✅ FIT theme meta_description successfully set:', result.meta['fit_seo_description-single']);
            }
            else {
                console.log('⚠️ FIT theme meta_description not found in response');
            }
        }
        else {
            console.log('⚠️ No meta fields in response');
        }
        return {
            success: true,
            postId: result.id,
            url: result.link
        };
    }
    /**
     * 既存記事更新（レスポンス詳細ログ付き）
     */
    async updatePost(postData) {
        const url = `${this.config.apiUrl}/wp-json/wp/v2/posts/${postData.id}`;
        console.log('📡 Sending POST request (update) to:', url);
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': this.getAuthHeader(),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(postData)
        });
        console.log('📥 Response status:', response.status);
        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Error response:', errorText);
            return {
                success: false,
                error: `記事更新エラー: ${response.status} ${response.statusText} - ${errorText}`
            };
        }
        const result = await response.json();
        console.log('✅ Success response:', JSON.stringify(result, null, 2));
        // metaフィールドがレスポンスに含まれているかチェック
        if (result.meta) {
            console.log('📋 Meta fields in response:', result.meta);
            if (result.meta['fit_seo_description-single']) {
                console.log('✅ FIT theme meta_description successfully set:', result.meta['fit_seo_description-single']);
            }
            else {
                console.log('⚠️ FIT theme meta_description not found in response');
            }
        }
        else {
            console.log('⚠️ No meta fields in response');
        }
        return {
            success: true,
            postId: result.id,
            url: result.link
        };
    }
    // 既存のメソッドはそのまま
    async findExistingPost(title, slug) {
        try {
            if (slug) {
                const slugResult = await this.searchPostBySlug(slug);
                if (slugResult)
                    return slugResult;
            }
            const titleResult = await this.searchPostByTitle(title);
            return titleResult;
        }
        catch (error) {
            console.error('既存記事検索エラー:', error);
            return null;
        }
    }
    async searchPostBySlug(slug) {
        const url = `${this.config.apiUrl}/wp-json/wp/v2/posts?slug=${encodeURIComponent(slug)}`;
        const response = await fetch(url, {
            headers: { 'Authorization': this.getAuthHeader() }
        });
        if (response.ok) {
            const posts = await response.json();
            return posts.length > 0 ? posts[0] : null;
        }
        return null;
    }
    async searchPostByTitle(title) {
        const url = `${this.config.apiUrl}/wp-json/wp/v2/posts?search=${encodeURIComponent(title)}`;
        const response = await fetch(url, {
            headers: { 'Authorization': this.getAuthHeader() }
        });
        if (response.ok) {
            const posts = await response.json();
            const exactMatch = posts.find((post) => post.title.rendered === title || post.title.raw === title);
            return exactMatch || null;
        }
        return null;
    }
    async resolveCategoryIds(categoryNames) {
        const categoryIds = [];
        for (const categoryName of categoryNames) {
            try {
                let category = await this.findCategoryByName(categoryName);
                if (!category) {
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
    async resolveTagIds(tagNames) {
        const tagIds = [];
        for (const tagName of tagNames) {
            try {
                let tag = await this.findTagByName(tagName);
                if (!tag) {
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
    async findCategoryByName(name) {
        const url = `${this.config.apiUrl}/wp-json/wp/v2/categories?search=${encodeURIComponent(name)}`;
        const response = await fetch(url, {
            headers: { 'Authorization': this.getAuthHeader() }
        });
        if (response.ok) {
            const categories = await response.json();
            const exactMatch = categories.find((cat) => cat.name === name);
            return exactMatch || null;
        }
        return null;
    }
    async findTagByName(name) {
        const url = `${this.config.apiUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(name)}`;
        const response = await fetch(url, {
            headers: { 'Authorization': this.getAuthHeader() }
        });
        if (response.ok) {
            const tags = await response.json();
            const exactMatch = tags.find((tag) => tag.name === name);
            return exactMatch || null;
        }
        return null;
    }
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
    async testConnection() {
        try {
            const url = `${this.config.apiUrl}/wp-json/wp/v2/users/me`;
            const response = await fetch(url, {
                headers: { 'Authorization': this.getAuthHeader() }
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
    getAuthHeader() {
        const credentials = Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64');
        return `Basic ${credentials}`;
    }
}
exports.WordPressClient = WordPressClient;
