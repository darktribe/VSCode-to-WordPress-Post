"use strict";
/**
 * WordPress Post Extension - Phase 1
 * 自前実装Markdown→HTML変換エンジン
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MarkdownParser = void 0;
class MarkdownParser {
    /**
     * MarkdownをHTMLに変換するメイン関数
     */
    parse(markdown) {
        // YAMLヘッダーと本文を分離
        const { metadata, content } = this.extractYamlHeader(markdown);
        // Markdown本文をHTMLに変換
        const html = this.convertToHtml(content);
        return { html, metadata };
    }
    /**
     * YAMLヘッダーを抽出
     */
    extractYamlHeader(markdown) {
        const yamlPattern = /^---\s*\n(.*?)\n---\s*\n(.*)$/s;
        const match = markdown.match(yamlPattern);
        if (match) {
            const yamlContent = match[1];
            const content = match[2];
            const metadata = this.parseYaml(yamlContent);
            return { metadata, content };
        }
        return { metadata: {}, content: markdown };
    }
    /**
     * 簡易YAML解析（基本的なkey: value形式のみ）
     */
    parseYaml(yamlContent) {
        const metadata = {};
        const lines = yamlContent.split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#'))
                continue;
            if (trimmed.includes(':')) {
                const [key, ...valueParts] = trimmed.split(':');
                const value = valueParts.join(':').trim();
                // 配列形式の処理 [item1, item2]
                if (value.startsWith('[') && value.endsWith(']')) {
                    const arrayContent = value.slice(1, -1);
                    metadata[key.trim()] = arrayContent.split(',').map(item => item.trim());
                }
                // 引用符で囲まれた文字列
                else if ((value.startsWith('"') && value.endsWith('"')) ||
                    (value.startsWith("'") && value.endsWith("'"))) {
                    metadata[key.trim()] = value.slice(1, -1);
                }
                // 普通の文字列
                else {
                    metadata[key.trim()] = value;
                }
            }
        }
        return metadata;
    }
    /**
     * Markdown本文をHTMLに変換
     */
    convertToHtml(content) {
        let html = content;
        // コードブロックを先に処理（他の記法と干渉しないよう）
        html = this.processCodeBlocks(html);
        // 見出し
        html = this.processHeadings(html);
        // 太字（イタリックは無効化済み）
        html = this.processBold(html);
        // インラインコード
        html = this.processInlineCode(html);
        // リンク・画像
        html = this.processImages(html);
        html = this.processLinks(html);
        // リスト
        html = this.processLists(html);
        // テーブル
        html = this.processTables(html);
        // 段落
        html = this.processParagraphs(html);
        return html;
    }
    /**
     * コードブロック処理（改行を正しく保持）
     */
    processCodeBlocks(text) {
        return text.replace(/```(\w+)?\n(.*?)\n```/gs, (match, language, code) => {
            const lang = language ? ` class="language-${language}"` : '';
            // 改行を明示的に<br>タグに変換
            const escapedCode = this.escapeHtml(code).replace(/\n/g, '<br>');
            return `<pre><code${lang}>${escapedCode}</code></pre>`;
        });
    }
    /**
     * 見出し処理
     */
    processHeadings(text) {
        return text.replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, title) => {
            const level = hashes.length;
            return `<h${level}>${title.trim()}</h${level}>`;
        });
    }
    /**
     * 太字処理
     */
    processBold(text) {
        // **記法
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        // __記法
        text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');
        return text;
    }
    /**
     * インラインコード処理
     */
    processInlineCode(text) {
        return text.replace(/`([^`]+?)`/g, '<code>$1</code>');
    }
    /**
     * 画像処理
     */
    processImages(text) {
        return text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
    }
    /**
     * リンク処理
     */
    processLinks(text) {
        return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    }
    /**
    * ネストしたリスト処理（改良版）
    * インデント（スペース2個または4個、タブ）でネストレベルを判定
    */
    processLists(text) {
        const lines = text.split('\n');
        const result = [];
        const listStack = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            // インデントレベルを計算（スペース2個=1レベル、タブ=1レベル）
            const indentMatch = line.match(/^(\s*)/);
            const indentText = indentMatch ? indentMatch[1] : '';
            const indentLevel = this.calculateIndentLevel(indentText);
            // 無序リスト（- item）
            const unorderedMatch = trimmed.match(/^-\s+(.+)$/);
            if (unorderedMatch) {
                const content = unorderedMatch[1];
                this.adjustListStack(result, listStack, 'ul', indentLevel);
                result.push(`<li>${content}</li>`);
            }
            // 有序リスト（1. item）
            else if (trimmed.match(/^\d+\.\s+(.+)$/)) {
                const content = trimmed.replace(/^\d+\.\s+/, '');
                this.adjustListStack(result, listStack, 'ol', indentLevel);
                result.push(`<li>${content}</li>`);
            }
            // リスト以外
            else {
                // 全てのリストを閉じる
                this.closeAllLists(result, listStack);
                result.push(line);
            }
        }
        // 最後に残ったリストタグを全て閉じる
        this.closeAllLists(result, listStack);
        return result.join('\n');
    }
    /**
     * インデントレベルを計算
     * スペース2個または4個、タブで1レベルとカウント
     */
    calculateIndentLevel(indentText) {
        let level = 0;
        let i = 0;
        while (i < indentText.length) {
            if (indentText[i] === '\t') {
                level++;
                i++;
            }
            else if (indentText[i] === ' ') {
                // スペースの場合、2個または4個で1レベル
                if (i + 1 < indentText.length && indentText[i + 1] === ' ') {
                    if (i + 3 < indentText.length &&
                        indentText[i + 2] === ' ' &&
                        indentText[i + 3] === ' ') {
                        // 4スペース
                        level++;
                        i += 4;
                    }
                    else {
                        // 2スペース
                        level++;
                        i += 2;
                    }
                }
                else {
                    // 1スペースは0.5レベル（切り捨て）
                    i++;
                }
            }
            else {
                break;
            }
        }
        return level;
    }
    /**
     * リストスタックを調整（ネスト処理の核心部分）
     */
    adjustListStack(result, listStack, currentType, currentLevel) {
        // 現在のレベルより深いスタックを削除
        while (listStack.length > 0 && listStack[listStack.length - 1].level > currentLevel) {
            const closing = listStack.pop();
            result.push(`</${closing.type}>`);
        }
        // 同じレベルで異なるタイプの場合、閉じて新しく開始
        if (listStack.length > 0 &&
            listStack[listStack.length - 1].level === currentLevel &&
            listStack[listStack.length - 1].type !== currentType) {
            const closing = listStack.pop();
            result.push(`</${closing.type}>`);
        }
        // 新しいレベルまたはタイプのリストを開始
        if (listStack.length === 0 ||
            listStack[listStack.length - 1].level < currentLevel ||
            (listStack[listStack.length - 1].level === currentLevel &&
                listStack[listStack.length - 1].type !== currentType)) {
            result.push(`<${currentType}>`);
            listStack.push({ type: currentType, level: currentLevel });
        }
    }
    /**
     * 全てのリストタグを閉じる
     */
    closeAllLists(result, listStack) {
        while (listStack.length > 0) {
            const closing = listStack.pop();
            result.push(`</${closing.type}>`);
        }
    }
    /**
     * テーブル処理
     */
    processTables(text) {
        const lines = text.split('\n');
        const result = [];
        let inTable = false;
        let isHeaderProcessed = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            // テーブル行の判定（|で始まり|で終わる）
            if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
                // 区切り行（|---|---|）をスキップ
                if (trimmed.match(/^\|[\s-|]+\|$/)) {
                    continue;
                }
                if (!inTable) {
                    result.push('<table>');
                    inTable = true;
                    isHeaderProcessed = false;
                }
                // セルを分割
                const cells = trimmed.slice(1, -1).split('|').map(cell => cell.trim());
                if (!isHeaderProcessed) {
                    // ヘッダー行
                    result.push('<thead><tr>');
                    cells.forEach(cell => {
                        result.push(`<th>${cell}</th>`);
                    });
                    result.push('</tr></thead><tbody>');
                    isHeaderProcessed = true;
                }
                else {
                    // データ行
                    result.push('<tr>');
                    cells.forEach(cell => {
                        result.push(`<td>${cell}</td>`);
                    });
                    result.push('</tr>');
                }
            }
            else {
                if (inTable) {
                    result.push('</tbody></table>');
                    inTable = false;
                }
                result.push(line);
            }
        }
        if (inTable) {
            result.push('</tbody></table>');
        }
        return result.join('\n');
    }
    /**
     * 段落処理
     */
    processParagraphs(text) {
        const lines = text.split('\n');
        const result = [];
        let currentParagraph = [];
        for (const line of lines) {
            const trimmed = line.trim();
            // 空行または既にHTMLタグの行
            if (trimmed === '' || this.isHtmlTag(trimmed)) {
                if (currentParagraph.length > 0) {
                    result.push(`<p>${currentParagraph.join(' ')}</p>`);
                    currentParagraph = [];
                }
                if (trimmed !== '') {
                    result.push(line);
                }
            }
            else {
                currentParagraph.push(trimmed);
            }
        }
        // 最後の段落
        if (currentParagraph.length > 0) {
            result.push(`<p>${currentParagraph.join(' ')}</p>`);
        }
        return result.join('\n');
    }
    /**
     * HTMLタグかどうか判定
     */
    isHtmlTag(line) {
        return /^<\/?[a-zA-Z][^>]*>/.test(line.trim());
    }
    /**
     * HTMLエスケープ
     */
    escapeHtml(text) {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
    }
}
exports.MarkdownParser = MarkdownParser;
