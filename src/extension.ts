/**
 * WordPress Post Extension - Phase 4
 * VS Code拡張機能のメインエントリーポイント（meta_description送信表示付き）
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { MarkdownParser } from './markdown-parser';
import { ImageUploader, getWordPressConfig } from './image-uploader';
import { WordPressClient } from './wordpress-client';
import { PostMetadata } from './types';

/**
 * 拡張機能の有効化時に呼ばれる
 */
export function activate(context: vscode.ExtensionContext) {
  console.log('WordPress Post Extension が有効化されました');

  // コマンドを登録
  const commands = [
    // メインコマンド：記事を投稿
    vscode.commands.registerCommand('wordpress-post.postArticle', postCurrentMarkdown),
    
    // 設定テストコマンド
    vscode.commands.registerCommand('wordpress-post.testConnection', testWordPressConnection),
    
    // 画像アップロードのみ
    vscode.commands.registerCommand('wordpress-post.uploadImages', uploadImagesOnly)
  ];

  // コマンドをコンテキストに追加
  commands.forEach(command => context.subscriptions.push(command));

  // ステータスバーにボタンを追加
  const statusBarButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarButton.text = '$(cloud-upload) WordPress投稿';
  statusBarButton.command = 'wordpress-post.postArticle';
  statusBarButton.tooltip = 'MarkdownファイルをWordPressに投稿';
  statusBarButton.show();
  context.subscriptions.push(statusBarButton);
}

/**
 * 拡張機能の無効化時に呼ばれる
 */
export function deactivate() {
  console.log('WordPress Post Extension が無効化されました');
}

/**
 * 現在のMarkdownファイルをWordPressに投稿
 */
async function postCurrentMarkdown() {
  try {
    // アクティブなエディタを取得
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      vscode.window.showErrorMessage('Markdownファイルを開いてください');
      return;
    }

    // ファイルパスとMarkdown内容を取得
    const filePath = activeEditor.document.fileName;
    const fileExtension = path.extname(filePath).toLowerCase();
    
    if (fileExtension !== '.md') {
      vscode.window.showErrorMessage('Markdownファイル(.md)を選択してください');
      return;
    }

    // ファイルを保存
    await activeEditor.document.save();
    
    // プログレスバーを表示
    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'WordPressに投稿中...',
      cancellable: false
    }, async (progress) => {
      
      progress.report({ increment: 10, message: 'Markdownを解析中...' });
      
      // WordPress設定を取得
      const config = getWordPressConfig();
      if (!config) {
        return;
      }

      // Markdownファイルを読み込み
      const markdownContent = fs.readFileSync(filePath, 'utf8');
      
      // Markdownを解析
      const parser = new MarkdownParser();
      const parseResult = parser.parse(markdownContent);
      
      // デバッグ：メタデータの内容を詳細確認
      console.log('=== YAML解析デバッグ ===');
      console.log('元のMarkdown冒頭50文字:', markdownContent.substring(0, 50));
      console.log('解析されたメタデータ全体:', parseResult.metadata);
      console.log('meta_descriptionキー存在チェック:', 'meta_description' in parseResult.metadata);
      console.log('meta_descriptionの値:', parseResult.metadata.meta_description);
      console.log('meta_descriptionの型:', typeof parseResult.metadata.meta_description);
      console.log('========================');
      
      if (parseResult.metadata.meta_description) {
        console.log('✅ meta_description検出:', parseResult.metadata.meta_description);
      } else {
        console.log('❌ meta_descriptionが検出されませんでした');
        console.log('利用可能なキー:', Object.keys(parseResult.metadata));
      }
      
      progress.report({ increment: 20, message: '画像をアップロード中...' });
      
      // 画像処理
      const imageUploader = new ImageUploader(config);
      
      // Markdown内の画像をアップロード
      const processedMarkdown = await imageUploader.processMarkdownImages(markdownContent, filePath);
      
      // 処理済みMarkdownを再解析（画像URLが更新されたため）
      const finalParseResult = parser.parse(processedMarkdown);
      
      // アイキャッチ画像をアップロード
      let featuredImageId: number | undefined;
      const featuredImageResult = await imageUploader.uploadFeaturedImage(filePath);
      if (featuredImageResult && featuredImageResult.success) {
        featuredImageId = featuredImageResult.mediaId;
      }
      
      // meta_description の確認と表示
      if (finalParseResult.metadata.meta_description) {
        progress.report({ 
          increment: 25, 
          message: `meta_descriptionを送信中...「${finalParseResult.metadata.meta_description.substring(0, 50)}${finalParseResult.metadata.meta_description.length > 50 ? '...' : ''}」` 
        });
      } else {
        progress.report({ increment: 25, message: 'WordPressに投稿中...' });
      }
      
      // WordPress連携
      const wordpressClient = new WordPressClient(config);
      
      // タイトルを決定（メタデータまたはファイル名から）
      const title = finalParseResult.metadata.title || 
                   path.basename(filePath, path.extname(filePath));
      
      // ハッシュタグを追加（指定されている場合）
      let content = finalParseResult.html;
      if (finalParseResult.metadata.hashtag) {
        content = `<p>${finalParseResult.metadata.hashtag}</p>\n${content}`;
      }
      
      // 記事を投稿
      const result = await wordpressClient.postArticle(
        title,
        content,
        finalParseResult.metadata,
        featuredImageId
      );
      
      // meta_description送信結果を表示
      if (finalParseResult.metadata.meta_description) {
        if (result.success) {
          progress.report({ increment: 15, message: `✅ meta_description送信成功！` });
        } else {
          progress.report({ increment: 15, message: `❌ meta_description送信失敗` });
        }
      }
      
      progress.report({ increment: 10, message: '完了' });
      
      // 結果を表示
      if (result.success) {
        const action = result.isUpdate ? '更新' : '作成';
        let message = `記事の${action}が完了しました！`;
        
        // meta_description の送信結果を表示
        if (finalParseResult.metadata.meta_description) {
          message += ` meta_description「${finalParseResult.metadata.meta_description.substring(0, 30)}${finalParseResult.metadata.meta_description.length > 30 ? '...' : ''}」も送信されました。`;
        }
        
        if (result.url) {
          const openAction = '記事を開く';
          vscode.window.showInformationMessage(message, openAction).then(selection => {
            if (selection === openAction) {
              vscode.env.openExternal(vscode.Uri.parse(result.url!));
            }
          });
        } else {
          vscode.window.showInformationMessage(message);
        }
      } else {
        let errorMessage = `投稿エラー: ${result.error}`;
        
        // meta_description関連のエラーかチェック
        if (finalParseResult.metadata.meta_description && result.error?.includes('meta')) {
          errorMessage += ` ※meta_description「${finalParseResult.metadata.meta_description.substring(0, 30)}${finalParseResult.metadata.meta_description.length > 30 ? '...' : ''}」の送信に失敗した可能性があります。`;
        }
        
        vscode.window.showErrorMessage(errorMessage);
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`予期しないエラー: ${errorMessage}`);
    console.error('WordPress投稿エラー:', error);
  }
}

/**
 * WordPress接続テスト
 */
async function testWordPressConnection() {
  try {
    const config = getWordPressConfig();
    if (!config) {
      return;
    }

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'WordPress接続をテスト中...',
      cancellable: false
    }, async () => {
      const client = new WordPressClient(config);
      const result = await client.testConnection();
      
      if (result.success) {
        vscode.window.showInformationMessage('WordPress接続テストが成功しました！');
      } else {
        vscode.window.showErrorMessage(`WordPress接続テストが失敗しました: ${result.error}`);
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`接続テストエラー: ${errorMessage}`);
  }
}

/**
 * 画像のみアップロード（記事投稿はしない）
 */
async function uploadImagesOnly() {
  try {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      vscode.window.showErrorMessage('Markdownファイルを開いてください');
      return;
    }

    const filePath = activeEditor.document.fileName;
    const fileExtension = path.extname(filePath).toLowerCase();
    
    if (fileExtension !== '.md') {
      vscode.window.showErrorMessage('Markdownファイル(.md)を選択してください');
      return;
    }

    const config = getWordPressConfig();
    if (!config) {
      return;
    }

    await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: '画像をアップロード中...',
      cancellable: false
    }, async () => {
      const markdownContent = fs.readFileSync(filePath, 'utf8');
      const imageUploader = new ImageUploader(config);
      
      // Markdown内の画像をアップロード
      const processedMarkdown = await imageUploader.processMarkdownImages(markdownContent, filePath);
      
      // アイキャッチ画像をアップロード
      const featuredImageResult = await imageUploader.uploadFeaturedImage(filePath);
      
      // 処理済みMarkdownでファイルを更新するか確認
      if (processedMarkdown !== markdownContent) {
        const updateFile = '更新';
        const cancel = 'キャンセル';
        const selection = await vscode.window.showInformationMessage(
          '画像URLが更新されました。ファイルを更新しますか？',
          updateFile,
          cancel
        );
        
        if (selection === updateFile) {
          // ファイルを更新
          fs.writeFileSync(filePath, processedMarkdown, 'utf8');
          // エディタの内容を更新
          const fullRange = new vscode.Range(
            activeEditor.document.positionAt(0),
            activeEditor.document.positionAt(activeEditor.document.getText().length)
          );
          await activeEditor.edit(editBuilder => {
            editBuilder.replace(fullRange, processedMarkdown);
          });
        }
      }
      
      let message = '画像のアップロードが完了しました！';
      if (featuredImageResult && featuredImageResult.success) {
        message += ' アイキャッチ画像も設定されました。';
      }
      
      vscode.window.showInformationMessage(message);
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    vscode.window.showErrorMessage(`画像アップロードエラー: ${errorMessage}`);
  }
}