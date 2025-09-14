/**
 * WordPress Post Extension - Phase 2
 * 画像アップロード機能
 */

import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface ImageUploadResult {
  success: boolean;
  mediaId?: number;
  url?: string;
  error?: string;
}

export interface WordPressConfig {
  apiUrl: string;
  username: string;
  password: string; // アプリパスワード
}

export class ImageUploader {
  private config: WordPressConfig;

  constructor(config: WordPressConfig) {
    this.config = config;
  }

  /**
   * Markdown内の画像パスを処理してWordPressにアップロード
   */
  public async processMarkdownImages(
    markdown: string, 
    markdownFilePath: string
  ): Promise<string> {
    const baseDir = path.dirname(markdownFilePath);
    let processedMarkdown = markdown;

    // 画像記法 ![alt](path) を検索
    const imagePattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const matches = Array.from(markdown.matchAll(imagePattern));

    for (const match of matches) {
      const [fullMatch, altText, imagePath] = match;
      
      // 相対パスかどうか判定
      if (this.isLocalPath(imagePath)) {
        const fullImagePath = path.resolve(baseDir, imagePath);
        
        if (fs.existsSync(fullImagePath)) {
          try {
            const uploadResult = await this.uploadImage(fullImagePath, altText);
            
            if (uploadResult.success && uploadResult.url) {
              // MarkdownのパスをWordPressのURLに置き換え
              processedMarkdown = processedMarkdown.replace(
                fullMatch,
                `![${altText}](${uploadResult.url})`
              );
            }
          } catch (error) {
            console.error(`画像アップロードエラー: ${fullImagePath}`, error);
          }
        }
      }
    }

    return processedMarkdown;
  }

  /**
   * アイキャッチ画像を自動検出・アップロード
   */
  public async uploadFeaturedImage(markdownFilePath: string): Promise<ImageUploadResult | null> {
    const baseDir = path.dirname(markdownFilePath);
    const baseName = path.basename(markdownFilePath, path.extname(markdownFilePath));
    
    // サポートする画像拡張子
    const supportedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    
    for (const ext of supportedExtensions) {
      const imagePath = path.join(baseDir, `${baseName}${ext}`);
      
      if (fs.existsSync(imagePath)) {
        try {
          return await this.uploadImage(imagePath, 'Featured Image');
        } catch (error) {
          console.error(`アイキャッチ画像アップロードエラー: ${imagePath}`, error);
        }
      }
    }
    
    return null;
  }

  /**
   * 単一画像をWordPressにアップロード
   */
  public async uploadImage(imagePath: string, altText: string = ''): Promise<ImageUploadResult> {
    try {
      // ファイルの存在確認
      if (!fs.existsSync(imagePath)) {
        return {
          success: false,
          error: `ファイルが見つかりません: ${imagePath}`
        };
      }

      // ファイル情報取得
      const fileName = path.basename(imagePath);
      const fileBuffer = fs.readFileSync(imagePath);
      const mimeType = this.getMimeType(imagePath);

      // WordPress REST API: メディアアップロード
      const uploadUrl = `${this.config.apiUrl}/wp-json/wp/v2/media`;
      
      const response = await fetch(uploadUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`,
          'Content-Type': mimeType,
          'Content-Disposition': `attachment; filename="${fileName}"`,
          'Cache-Control': 'no-cache'
        },
        body: fileBuffer
      });

      if (!response.ok) {
        const errorText = await response.text();
        return {
          success: false,
          error: `アップロードエラー: ${response.status} ${response.statusText} - ${errorText}`
        };
      }

      const result = await response.json();
      
      // アップロード成功時に alt テキストを設定
      if (altText && result.id) {
        await this.updateImageAltText(result.id, altText);
      }

      return {
        success: true,
        mediaId: result.id,
        url: result.source_url
      };

    } catch (error) {
      return {
        success: false,
        error: `アップロードエラー: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * 画像のalt textを更新
   */
  private async updateImageAltText(mediaId: number, altText: string): Promise<void> {
    try {
      const updateUrl = `${this.config.apiUrl}/wp-json/wp/v2/media/${mediaId}`;
      
      await fetch(updateUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          alt_text: altText
        })
      });
    } catch (error) {
      console.error('Alt text更新エラー:', error);
    }
  }

  /**
   * ローカルパスかどうか判定
   */
  private isLocalPath(imagePath: string): boolean {
    // HTTP/HTTPSで始まる場合は外部URL
    if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
      return false;
    }
    
    // data:で始まる場合はdata URL
    if (imagePath.startsWith('data:')) {
      return false;
    }
    
    return true;
  }

  /**
   * ファイル拡張子からMIMEタイプを取得
   */
  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.bmp': 'image/bmp',
      '.ico': 'image/x-icon'
    };
    
    return mimeTypes[ext] || 'image/jpeg';
  }
}

/**
 * VS Code設定から WordPress 設定を取得
 */
export function getWordPressConfig(): WordPressConfig | null {
  const config = vscode.workspace.getConfiguration('wordpress-post');
  
  const apiUrl = config.get<string>('apiUrl');
  const username = config.get<string>('username');
  const password = config.get<string>('password');
  
  if (!apiUrl || !username || !password) {
    vscode.window.showErrorMessage(
      'WordPress設定が不完全です。設定でAPIエンドポイント、ユーザー名、パスワードを設定してください。'
    );
    return null;
  }
  
  return { apiUrl, username, password };
}

// 使用例
/*
const config = getWordPressConfig();
if (config) {
  const uploader = new ImageUploader(config);
  
  // Markdown内の画像を処理
  const processedMarkdown = await uploader.processMarkdownImages(
    markdownContent, 
    '/path/to/article.md'
  );
  
  // アイキャッチ画像をアップロード
  const featuredImage = await uploader.uploadFeaturedImage('/path/to/article.md');
}
*/