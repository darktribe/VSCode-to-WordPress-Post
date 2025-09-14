/**
 * WordPress Post Extension - 共通型定義
 */

// Markdownパーサーの結果
export interface MarkdownParseResult {
    html: string;
    metadata: PostMetadata;
  }
  
  // 記事メタデータ
  export interface PostMetadata {
    title?: string;
    categories?: string[];
    tags?: string[];
    hashtag?: string;
    meta_description?: string;
    language?: string;
    slug?: string;
    status?: 'draft' | 'publish' | 'private';
    date?: string;
    [key: string]: any;
  }
  
  // WordPress設定
  export interface WordPressConfig {
    apiUrl: string;
    username: string;
    password: string; // アプリパスワード
  }
  
  // 画像アップロード結果
  export interface ImageUploadResult {
    success: boolean;
    mediaId?: number;
    url?: string;
    error?: string;
  }
  
  // WordPress投稿データ
  export interface WordPressPost {
    id?: number;
    title: string;
    content: string;
    status: 'draft' | 'publish' | 'private';
    categories?: number[];
    tags?: number[];
    featured_media?: number;
    slug?: string;
    date?: string;
    meta?: Record<string, any>;
    lang?: string; // Polylang用
  }
  
  // WordPress カテゴリ/タグ
  export interface WordPressTerm {
    id: number;
    name: string;
    slug: string;
  }
  
  // API応答
  export interface WordPressApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
  }
  
  // 投稿処理の結果
  export interface PostResult {
    success: boolean;
    postId?: number;
    url?: string;
    error?: string;
    isUpdate?: boolean; // 更新か新規作成か
  }
  
  // 拡張機能の設定
  export interface ExtensionConfig {
    wordpress: WordPressConfig;
    defaultStatus: 'draft' | 'publish';
    autoUploadImages: boolean;
    autoSetFeaturedImage: boolean;
    supportedImageExtensions: string[];
  }
  
  // ファイル処理の結果
  export interface FileProcessResult {
    success: boolean;
    processedContent?: string;
    featuredImageId?: number;
    error?: string;
  }