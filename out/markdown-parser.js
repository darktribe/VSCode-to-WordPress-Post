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
        // カスタムHTMLブロック（<!--! !-->）の処理
        html = this.processCustomHtmlBlocks(html);
        // コードブロックを先に処理（他の記法と干渉しないよう）
        html = this.processCodeBlocks(html);
        // 見出し
        html = this.processHeadings(html);
        // 太字・イタリック
        html = this.processBold(html);
        html = this.processItalic(html);
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
     * カスタムHTMLブロック処理（<!--! HTMLコード !-->）
     */
    processCustomHtmlBlocks(text) {
        return text.replace(/<!--!\s*(.*?)\s*!-->/gs, '$1');
    }
    /**
     * コードブロック処理
     */
    processCodeBlocks(text) {
        return text.replace(/```(\w+)?\n(.*?)\n```/gs, (match, language, code) => {
            const lang = language ? ` class="language-${language}"` : '';
            return `<pre><code${lang}>${this.escapeHtml(code)}</code></pre>`;
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
     * イタリック処理
     */
    processItalic(text) {
        // 全てのイタリック処理を無効化
        // text = text.replace(/(^|[^\w*])\*([^*\n]+?)\*(?=[^\w*]|$)/g, '$1<em>$2</em>');
        // text = text.replace(/(^|[^\w_:/]|(?<=\s))_([^_\n]+?)_(?=[^\w_]|$)/g, '$1<em>$2</em>');
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
     * リスト処理
     */
    processLists(text) {
        const lines = text.split('\n');
        const result = [];
        let inUnorderedList = false;
        let inOrderedList = false;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            // 無序リスト（- item）
            if (trimmed.match(/^-\s+(.+)$/)) {
                const content = trimmed.replace(/^-\s+/, '');
                if (!inUnorderedList) {
                    result.push('<ul>');
                    inUnorderedList = true;
                }
                if (inOrderedList) {
                    result.push('</ol>');
                    inOrderedList = false;
                }
                result.push(`<li>${content}</li>`);
            }
            // 有序リスト（1. item）
            else if (trimmed.match(/^\d+\.\s+(.+)$/)) {
                const content = trimmed.replace(/^\d+\.\s+/, '');
                if (!inOrderedList) {
                    result.push('<ol>');
                    inOrderedList = true;
                }
                if (inUnorderedList) {
                    result.push('</ul>');
                    inUnorderedList = false;
                }
                result.push(`<li>${content}</li>`);
            }
            // リスト以外
            else {
                if (inUnorderedList) {
                    result.push('</ul>');
                    inUnorderedList = false;
                }
                if (inOrderedList) {
                    result.push('</ol>');
                    inOrderedList = false;
                }
                result.push(line);
            }
        }
        // 最後のリストタグを閉じる
        if (inUnorderedList) {
            result.push('</ul>');
        }
        if (inOrderedList) {
            result.push('</ol>');
        }
        return result.join('\n');
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
// 使用例
/*
const parser = new MarkdownParser();
const result = parser.parse(`---
title: テスト記事
categories: [tech, javascript]
---

# 見出し1

これは**太字**で、これは*イタリック*です。

- リスト項目1
- リスト項目2

| 列1 | 列2 |
|-----|-----|
| A   | B   |
`);

console.log(result.html);
console.log(result.metadata);
*/ 
