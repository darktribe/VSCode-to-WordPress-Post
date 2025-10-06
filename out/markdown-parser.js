"use strict";
/**
 * WordPress Post Extension - Phase 1
 * 自前実装Markdown→HTML変換エンジン（リスト処理修正版 + 打ち消し線・表対応）
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
     * Markdown本文をHTMLに変換（処理順序を修正）
     */
    convertToHtml(content) {
        let html = content;
        // 1. コードブロックを先に処理（他の記法と干渉しないよう）
        html = this.processCodeBlocks(html);
        // 2. ブロックレベル要素を処理
        html = this.processHeadings(html);
        html = this.processTables(html);
        html = this.processListsImproved(html);
        // 3. インライン記法を処理
        html = this.processBold(html);
        html = this.processStrikethrough(html); // 打ち消し線を追加
        html = this.processInlineCode(html);
        html = this.processImages(html);
        html = this.processLinks(html);
        // 4. 最後に段落処理（すべての構造が確定してから）
        html = this.processParagraphsImproved(html);
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
     * 打ち消し線処理（新規追加）
     */
    processStrikethrough(text) {
        // ~~記法
        return text.replace(/~~(.+?)~~/g, '<del>$1</del>');
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
     * 改良版リスト処理（段落処理との整合性を保つ）
     */
    processListsImproved(text) {
        const lines = text.split('\n');
        const result = [];
        const listStack = [];
        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            const trimmed = line.trim();
            // インデントレベルを正確に計算
            const indentLevel = this.calculateIndentLevelPrecise(line);
            // 無序リスト（- item）
            const unorderedMatch = trimmed.match(/^-\s+(.+)$/);
            if (unorderedMatch) {
                const content = unorderedMatch[1];
                this.adjustListStack(result, listStack, 'ul', indentLevel);
                result.push(`<li>${content}</li>`);
                i++;
                continue;
            }
            // 有序リスト（1. item）
            const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
            if (orderedMatch) {
                const content = orderedMatch[1];
                this.adjustListStack(result, listStack, 'ol', indentLevel);
                result.push(`<li>${content}</li>`);
                i++;
                continue;
            }
            // リスト中で空行に遭遇した場合の処理
            if (listStack.length > 0 && trimmed === '') {
                // 次の行をチェックして、リストが続くかどうか判定
                let nextLineIndex = i + 1;
                let foundNonEmptyLine = false;
                let isListContinuing = false;
                // 空行を飛ばして次の非空行を探す
                while (nextLineIndex < lines.length) {
                    const nextLine = lines[nextLineIndex].trim();
                    if (nextLine !== '') {
                        foundNonEmptyLine = true;
                        // 次の非空行がリスト項目かチェック
                        if (nextLine.match(/^-\s+/) || nextLine.match(/^\d+\.\s+/)) {
                            isListContinuing = true;
                        }
                        break;
                    }
                    nextLineIndex++;
                }
                if (!foundNonEmptyLine || !isListContinuing) {
                    // リスト終了：すべてのリストを閉じる
                    this.closeAllLists(result, listStack);
                    // 空行を保持（段落処理で使用される）
                    result.push(line);
                }
                else {
                    // リスト継続：空行をスキップ
                    // 何もしない（空行は無視）
                }
                i++;
                continue;
            }
            // 構造的な要素（見出し、HTMLタグ）に遭遇した場合
            if (this.isStructuralHtmlTag(trimmed) || trimmed.match(/^#{1,6}\s+/)) {
                // リストを強制終了
                this.closeAllLists(result, listStack);
                result.push(line);
                i++;
                continue;
            }
            // 通常の行
            if (listStack.length > 0) {
                // リスト中の非リスト行：リストを終了
                this.closeAllLists(result, listStack);
            }
            result.push(line);
            i++;
        }
        // 最後に残ったリストタグを全て閉じる
        this.closeAllLists(result, listStack);
        return result.join('\n');
    }
    /**
     * より正確なインデントレベル計算
     */
    calculateIndentLevelPrecise(line) {
        let level = 0;
        let i = 0;
        while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
            if (line[i] === '\t') {
                level++;
                i++;
            }
            else if (line[i] === ' ') {
                let spaceCount = 0;
                while (i < line.length && line[i] === ' ') {
                    spaceCount++;
                    i++;
                }
                level += Math.floor(spaceCount / 2); // 2スペースで1レベル
            }
        }
        return level;
    }
    /**
     * リストスタック調整
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
        // 新しいレベルのリストを開始
        if (listStack.length === 0 || listStack[listStack.length - 1].level < currentLevel) {
            result.push(`<${currentType}>`);
            listStack.push({ type: currentType, level: currentLevel });
        }
    }
    /**
     * すべてのリストタグを閉じる
     */
    closeAllLists(result, listStack) {
        while (listStack.length > 0) {
            const closing = listStack.pop();
            result.push(`</${closing.type}>`);
        }
    }
    /**
     * テーブル処理（修正版）
     */
    processTables(text) {
        const lines = text.split('\n');
        const result = [];
        let inTable = false;
        let isHeaderProcessed = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            // テーブル行の判定（|で始まり|で終わる、または|を含む）
            if (trimmed.includes('|')) {
                // 区切り行（|---|---|）の判定
                const isSeparatorLine = /^\|?[\s:-]*-[\s:-]*(\|[\s:-]*-[\s:-]*)+\|?$/.test(trimmed);
                if (isSeparatorLine) {
                    // 区切り行：ヘッダーとボディの境界
                    if (!inTable) {
                        // テーブル開始（前の行がヘッダーのはず）
                        inTable = true;
                        // 前の行を削除してヘッダーとして再処理
                        const headerLine = result.pop();
                        if (headerLine) {
                            result.push('<table>');
                            result.push('<thead><tr>');
                            const headerCells = this.parseTableRow(headerLine);
                            headerCells.forEach((cell) => {
                                result.push(`<th>${cell}</th>`);
                            });
                            result.push('</tr></thead><tbody>');
                            isHeaderProcessed = true;
                        }
                    }
                    continue;
                }
                if (inTable) {
                    // データ行
                    result.push('<tr>');
                    const cells = this.parseTableRow(trimmed);
                    cells.forEach((cell) => {
                        result.push(`<td>${cell}</td>`);
                    });
                    result.push('</tr>');
                }
                else {
                    // まだテーブルモードに入っていない場合は一時保存
                    result.push(line);
                }
            }
            else {
                // テーブル行ではない
                if (inTable) {
                    // テーブル終了
                    result.push('</tbody></table>');
                    inTable = false;
                    isHeaderProcessed = false;
                }
                result.push(line);
            }
        }
        // 最後にテーブルが閉じられていない場合
        if (inTable) {
            result.push('</tbody></table>');
        }
        return result.join('\n');
    }
    /**
     * テーブル行をセルに分割（新規追加）
     */
    parseTableRow(line) {
        const trimmed = line.trim();
        // 先頭と末尾の|を除去
        let content = trimmed;
        if (content.startsWith('|')) {
            content = content.substring(1);
        }
        if (content.endsWith('|')) {
            content = content.substring(0, content.length - 1);
        }
        // セルに分割してトリム
        return content.split('|').map(cell => cell.trim());
    }
    /**
     * 改良版段落処理（リスト後の処理を含む）
     */
    processParagraphsImproved(text) {
        const lines = text.split('\n');
        const result = [];
        let currentParagraph = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            // 既に構造的HTMLタグの行はそのまま通す
            if (this.isStructuralHtmlTag(trimmed)) {
                // 段落を閉じる
                if (currentParagraph.length > 0) {
                    result.push(`<p>${currentParagraph.join('<br>')}</p>`);
                    currentParagraph = [];
                }
                result.push(line);
                continue;
            }
            // 空行の場合
            if (trimmed === '') {
                // 段落を閉じる
                if (currentParagraph.length > 0) {
                    result.push(`<p>${currentParagraph.join('<br>')}</p>`);
                    currentParagraph = [];
                }
                continue;
            }
            // 通常の行：行頭スペースを保持
            const processedLine = this.preserveLeadingSpaces(line);
            currentParagraph.push(processedLine);
        }
        // 最後の段落
        if (currentParagraph.length > 0) {
            result.push(`<p>${currentParagraph.join('<br>')}</p>`);
        }
        return result.join('\n');
    }
    /**
     * 行頭スペースを保持する処理
     */
    preserveLeadingSpaces(line) {
        const match = line.match(/^(\s*)(.*)/);
        if (!match)
            return line;
        const [, leadingSpaces, content] = match;
        // 行頭スペースを&nbsp;に変換（半角・全角を区別）
        let preservedSpaces = '';
        for (const char of leadingSpaces) {
            if (char === ' ') {
                preservedSpaces += '&nbsp;'; // 半角スペース
            }
            else if (char === '　') {
                preservedSpaces += '&#12288;'; // 全角スペース
            }
            else if (char === '\t') {
                preservedSpaces += '&nbsp;&nbsp;&nbsp;&nbsp;'; // タブは4つの&nbsp;
            }
            else {
                preservedSpaces += char;
            }
        }
        return preservedSpaces + content;
    }
    /**
     * 構造的HTMLタグかどうか判定（厳密版）
     */
    isStructuralHtmlTag(line) {
        const structuralTags = [
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'p', 'div', 'section', 'article', 'nav', 'aside', 'header', 'footer',
            'ul', 'ol', 'li', 'dl', 'dt', 'dd',
            'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
            'pre', 'code', 'blockquote',
            'form', 'fieldset', 'legend'
        ];
        const trimmed = line.trim();
        if (!trimmed.startsWith('<'))
            return false;
        // 開始タグまたは終了タグのタグ名を抽出
        const tagMatch = trimmed.match(/^<\/?([a-zA-Z][a-zA-Z0-9]*)/);
        if (!tagMatch)
            return false;
        const tagName = tagMatch[1].toLowerCase();
        return structuralTags.includes(tagName);
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
