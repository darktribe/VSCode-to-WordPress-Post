"use strict";
/**
 * WordPress Post Extension - Phase 4
 * VS Code拡張機能のメインエントリーポイント
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const markdown_parser_1 = require("./markdown-parser");
const image_uploader_1 = require("./image-uploader");
const wordpress_client_1 = require("./wordpress-client");
/**
 * 拡張機能の有効化時に呼ばれる
 */
function activate(context) {
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
function deactivate() {
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
            const config = (0, image_uploader_1.getWordPressConfig)();
            if (!config) {
                return;
            }
            // Markdownファイルを読み込み
            const markdownContent = fs.readFileSync(filePath, 'utf8');
            // Markdownを解析
            const parser = new markdown_parser_1.MarkdownParser();
            const parseResult = parser.parse(markdownContent);
            progress.report({ increment: 20, message: '画像をアップロード中...' });
            // 画像処理
            const imageUploader = new image_uploader_1.ImageUploader(config);
            // Markdown内の画像をアップロード
            const processedMarkdown = await imageUploader.processMarkdownImages(markdownContent, filePath);
            // 処理済みMarkdownを再解析（画像URLが更新されたため）
            const finalParseResult = parser.parse(processedMarkdown);
            // アイキャッチ画像をアップロード
            let featuredImageId;
            const featuredImageResult = await imageUploader.uploadFeaturedImage(filePath);
            if (featuredImageResult && featuredImageResult.success) {
                featuredImageId = featuredImageResult.mediaId;
            }
            progress.report({ increment: 30, message: 'WordPressに投稿中...' });
            // WordPress連携
            const wordpressClient = new wordpress_client_1.WordPressClient(config);
            // タイトルを決定（メタデータまたはファイル名から）
            const title = finalParseResult.metadata.title ||
                path.basename(filePath, path.extname(filePath));
            // ハッシュタグを追加（指定されている場合）
            let content = finalParseResult.html;
            if (finalParseResult.metadata.hashtag) {
                content = `<p>${finalParseResult.metadata.hashtag}</p>\n${content}`;
            }
            // 記事を投稿
            const result = await wordpressClient.postArticle(title, content, finalParseResult.metadata, featuredImageId);
            progress.report({ increment: 40, message: '完了' });
            // 結果を表示
            if (result.success) {
                const action = result.isUpdate ? '更新' : '作成';
                const message = `記事の${action}が完了しました！`;
                if (result.url) {
                    const openAction = '記事を開く';
                    vscode.window.showInformationMessage(message, openAction).then(selection => {
                        if (selection === openAction) {
                            vscode.env.openExternal(vscode.Uri.parse(result.url));
                        }
                    });
                }
                else {
                    vscode.window.showInformationMessage(message);
                }
            }
            else {
                vscode.window.showErrorMessage(`投稿エラー: ${result.error}`);
            }
        });
    }
    catch (error) {
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
        const config = (0, image_uploader_1.getWordPressConfig)();
        if (!config) {
            return;
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: 'WordPress接続をテスト中...',
            cancellable: false
        }, async () => {
            const client = new wordpress_client_1.WordPressClient(config);
            const result = await client.testConnection();
            if (result.success) {
                vscode.window.showInformationMessage('WordPress接続テストが成功しました！');
            }
            else {
                vscode.window.showErrorMessage(`WordPress接続テストが失敗しました: ${result.error}`);
            }
        });
    }
    catch (error) {
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
        const config = (0, image_uploader_1.getWordPressConfig)();
        if (!config) {
            return;
        }
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: '画像をアップロード中...',
            cancellable: false
        }, async () => {
            const markdownContent = fs.readFileSync(filePath, 'utf8');
            const imageUploader = new image_uploader_1.ImageUploader(config);
            // Markdown内の画像をアップロード
            const processedMarkdown = await imageUploader.processMarkdownImages(markdownContent, filePath);
            // アイキャッチ画像をアップロード
            const featuredImageResult = await imageUploader.uploadFeaturedImage(filePath);
            // 処理済みMarkdownでファイルを更新するか確認
            if (processedMarkdown !== markdownContent) {
                const updateFile = '更新';
                const cancel = 'キャンセル';
                const selection = await vscode.window.showInformationMessage('画像URLが更新されました。ファイルを更新しますか？', updateFile, cancel);
                if (selection === updateFile) {
                    // ファイルを更新
                    fs.writeFileSync(filePath, processedMarkdown, 'utf8');
                    // エディタの内容を更新
                    const fullRange = new vscode.Range(activeEditor.document.positionAt(0), activeEditor.document.positionAt(activeEditor.document.getText().length));
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
    }
    catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`画像アップロードエラー: ${errorMessage}`);
    }
}
