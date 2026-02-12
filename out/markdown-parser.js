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
     * YAMLヘッダーを抽出（本文の---と区別するため、より厳密に判定）
     */
    extractYamlHeader(markdown) {
        // 行頭から始まる---のみをYAMLヘッダーの開始として認識
        const lines = markdown.split('\n');
        if (lines.length < 3) {
            return { metadata: {}, content: markdown };
        }
        // 最初の行が---かチェック
        if (lines[0].trim() !== '---') {
            return { metadata: {}, content: markdown };
        }
        // 2行目以降で最初に見つかる---を探す（YAMLヘッダーの終わり）
        let endIndex = -1;
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '---') {
                endIndex = i;
                break;
            }
        }
        if (endIndex === -1) {
            // YAMLヘッダーの終わりが見つからない場合はYAMLヘッダーなしと判定
            return { metadata: {}, content: markdown };
        }
        // YAMLヘッダーの内容を抽出
        const yamlContent = lines.slice(1, endIndex).join('\n');
        const content = lines.slice(endIndex + 1).join('\n');
        const metadata = this.parseYaml(yamlContent);
        return { metadata, content };
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
        // 2. 水平線処理（リスト処理の前に実施）
        html = this.processHorizontalRules(html);
        // 3. ブロックレベル要素を処理
        html = this.processHeadings(html);
        html = this.processTables(html);
        html = this.processListsImproved(html);
        // 4. インライン記法を処理
        html = this.processBold(html);
        html = this.processStrikethrough(html); // 打ち消し線を追加
        html = this.processInlineCode(html);
        html = this.processImages(html);
        html = this.processLinks(html);
        // 5. 最後に段落処理（すべての構造が確定してから）
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
     * 水平線処理（「---」を<hr />に変換）
     */
    processHorizontalRules(text) {
        // 「---」を黒の1pxのHRに変換
        // 行全体が「---」のみ、または前後にスペースのみの場合にマッチ
        return text.replace(/^[\s]*(---|___|\*\*\*)[\s]*$/gm, '<hr style="border: none; border-top: 1px solid black; margin: 1em 0;" />');
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
     * 改良版リスト処理（段落処理との整合性を保つ、ネスト対応改善版）
     */
    processListsImproved(text) {
        const lines = text.split('\n');
        const result = [];
        const listStack = [];
        const pendingLiClose = []; // 閉じるべき<li>タグ情報
        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            const trimmed = line.trim();
            // リスト項目かどうかを判定（インデントを含めて）
            const listItemInfo = this.parseListItem(line);
            if (listItemInfo) {
                // リスト項目の場合
                // まず、現在のレベルより深いレベルの保留中の<li>を閉じる（より浅いレベルに戻る場合）
                // これにより、より深いレベルのリストが閉じられる前に、その中の最後の項目の<li>を閉じる
                while (pendingLiClose.length > 0 &&
                    pendingLiClose[pendingLiClose.length - 1].level > listItemInfo.indentLevel) {
                    const closing = pendingLiClose.pop();
                    this.closeListItem(result, closing);
                }
                // ネストが深くなる場合は親<li>をブロック扱いにする
                if (listStack.length > 0 &&
                    listStack[listStack.length - 1].level < listItemInfo.indentLevel &&
                    pendingLiClose.length > 0) {
                    pendingLiClose[pendingLiClose.length - 1].hasBlock = true;
                }
                // 次に、深いレベルのリストを閉じる（adjustListStackで処理）
                // この際、閉じられたリストに関連する<li>を先に閉じてからリストを閉じる
                const { closedLevels, closingTagsDeep, closingTagsSameLevel, openingTags } = this.adjustListStack(listStack, listItemInfo.type, listItemInfo.indentLevel);
                // 閉じられたレベルに関連する<li>を閉じる（閉じられたリストの中の項目の<li>）
                this.closePendingLiTagsForClosedLevels(result, pendingLiClose, closedLevels, listItemInfo.indentLevel);
                // 深いレベルのリストを先に閉じる
                result.push(...closingTagsDeep);
                // 同じレベルの<li>を閉じる（同じリスト内の次の項目が来るため）
                this.closePendingLiTagsAtSameLevel(result, pendingLiClose, listItemInfo.indentLevel);
                // 同じレベルのタイプ変更によるリスト閉鎖
                result.push(...closingTagsSameLevel);
                result.push(...openingTags);
                // 新しい<li>タグを開始（まだ閉じない）
                const lineIndex = result.length;
                let listItemTag = '<li>';
                if (listItemInfo.type === 'ol') {
                    const currentList = listStack[listStack.length - 1];
                    if (currentList && currentList.type === 'ol' && currentList.level === listItemInfo.indentLevel) {
                        const explicitNumber = listItemInfo.orderNumber;
                        if (explicitNumber !== undefined && (currentList.explicitNumbering || explicitNumber !== 1)) {
                            currentList.explicitNumbering = true;
                            currentList.counter = explicitNumber;
                        }
                        else {
                            currentList.counter = (currentList.counter ?? 0) + 1;
                        }
                        listItemTag = `<li value="${currentList.counter ?? 1}">`;
                    }
                }
                result.push(`${listItemTag}${listItemInfo.content}`);
                // この<li>タグのレベルと開始行を記録
                pendingLiClose.push({ level: listItemInfo.indentLevel, hasBlock: false, lineIndex });
                i++;
                continue;
            }
            // リスト中の継続行（ASCIIスペース/タブのインデントのみ）を<li>内に含める
            if (listStack.length > 0 && pendingLiClose.length > 0 && trimmed !== '' && /^[ \t]+/.test(line)) {
                pendingLiClose[pendingLiClose.length - 1].hasBlock = true;
                result.push(`<br>${trimmed}`);
                i++;
                continue;
            }
            // リスト中で空行に遭遇した場合の処理
            if (listStack.length > 0 && trimmed === '') {
                // 空行はリストの区切りとして扱い、リストを確実に閉じる
                this.closeAllPendingLiTags(result, pendingLiClose);
                this.closeAllLists(result, listStack);
                pendingLiClose.length = 0;
                // 空行を保持（段落処理で使用される）
                result.push(line);
                i++;
                continue;
            }
            // 構造的な要素（見出し）に遭遇した場合
            // HTMLタグを含む行はリストの継続として扱う（リスト項目内にHTMLを含む可能性があるため）
            if (trimmed.match(/^#{1,6}\s+/)) {
                // 見出しの場合のみリストを強制終了
                this.closeAllPendingLiTags(result, pendingLiClose);
                this.closeAllLists(result, listStack);
                pendingLiClose.length = 0;
                result.push(line);
                i++;
                continue;
            }
            // テーブル行の場合もリストを終了
            if (trimmed.includes('|') && trimmed.split('|').length >= 3) {
                this.closeAllPendingLiTags(result, pendingLiClose);
                this.closeAllLists(result, listStack);
                pendingLiClose.length = 0;
                result.push(line);
                i++;
                continue;
            }
            // 通常の行
            if (listStack.length > 0) {
                // リスト中の非リスト行：すべての保留中の<li>タグを閉じ、リストを終了
                this.closeAllPendingLiTags(result, pendingLiClose);
                this.closeAllLists(result, listStack);
                pendingLiClose.length = 0;
            }
            result.push(line);
            i++;
        }
        // 最後に残ったすべての保留中の<li>タグを閉じる
        this.closeAllPendingLiTags(result, pendingLiClose);
        // 最後に残ったリストタグを全て閉じる
        this.closeAllLists(result, listStack);
        return result.join('\n');
    }
    /**
     * 指定されたレベル以上の保留中の<li>タグを閉じる
     * （より浅いレベルに戻る場合に使用）
     */
    closePendingLiTagsAtOrAboveLevel(result, pendingLiClose, currentLevel) {
        while (pendingLiClose.length > 0) {
            const pendingLevel = pendingLiClose[pendingLiClose.length - 1].level;
            if (pendingLevel >= currentLevel) {
                const closing = pendingLiClose.pop();
                this.closeListItem(result, closing);
            }
            else {
                break;
            }
        }
    }
    /**
     * 閉じられたレベルに関連する<li>タグを閉じる
     * 閉じられたリストのレベル以上の<li>を閉じる（閉じられたリストの中のすべての項目の<li>）
     * ただし、現在のリスト項目のレベルより浅いレベルの<li>は閉じない（親リストの<li>は残す）
     */
    closePendingLiTagsForClosedLevels(result, pendingLiClose, closedLevels, currentLevel) {
        if (closedLevels.length === 0) {
            return;
        }
        // 閉じられたレベルの中で最も浅いレベルを取得
        const shallowestClosedLevel = Math.min(...closedLevels);
        // 閉じられたリストのレベル以上の<li>を閉じる
        // ただし、現在のリスト項目のレベルより深いレベルの<li>のみを閉じる
        // （親リストの<li>は、closePendingLiTagsAtSameLevelで処理される）
        for (let i = pendingLiClose.length - 1; i >= 0; i--) {
            const pendingLevel = pendingLiClose[i].level;
            // 閉じられたリストのレベル以上で、かつ現在のレベルより深いレベルの<li>を閉じる
            // （例：レベル3のリストが閉じられ、現在のレベルが2の場合、レベル3以上の<li>を閉じる）
            // ただし、現在のレベルと同じかより浅いレベルの<li>は閉じない
            if (pendingLevel >= shallowestClosedLevel && pendingLevel > currentLevel) {
                const closing = pendingLiClose.splice(i, 1)[0];
                this.closeListItem(result, closing);
            }
        }
    }
    /**
     * 保留中の<li>タグを、同じレベルのもののみ閉じる
     * （同じリスト内の次の項目が来るため、前の項目を閉じる）
     */
    closePendingLiTagsAtSameLevel(result, pendingLiClose, currentLevel) {
        // 同じレベルの<li>タグのみ閉じる（同じリスト内の次の項目が来るため）
        while (pendingLiClose.length > 0) {
            const pendingLevel = pendingLiClose[pendingLiClose.length - 1].level;
            // 同じレベルの<li>のみ閉じる
            if (pendingLevel === currentLevel) {
                const closing = pendingLiClose.pop();
                this.closeListItem(result, closing);
            }
            else {
                // 異なるレベルの場合は閉じない
                break;
            }
        }
    }
    /**
     * すべての保留中の<li>タグを閉じる
     */
    closeAllPendingLiTags(result, pendingLiClose) {
        while (pendingLiClose.length > 0) {
            const closing = pendingLiClose.pop();
            this.closeListItem(result, closing);
        }
    }
    /**
     * <li>タグを閉じる（単一行なら同一行で閉じる）
     */
    closeListItem(result, closing) {
        if (closing.hasBlock || result.length === 0) {
            result.push('</li>');
            return;
        }
        // 対応する<li>行に閉じタグを追加
        if (closing.lineIndex >= 0 && closing.lineIndex < result.length) {
            result[closing.lineIndex] = `${result[closing.lineIndex]}</li>`;
        }
        else {
            result.push('</li>');
        }
    }
    /**
     * リスト項目を解析して、タイプ、インデントレベル、内容を取得
     */
    parseListItem(line) {
        // 先頭のスペース/タブをスキップしてインデントレベルを計算
        let indentLevel = 0;
        let i = 0;
        while (i < line.length && (line[i] === ' ' || line[i] === '\t' || line[i] === '　')) {
            if (line[i] === '\t') {
                indentLevel++;
                i++;
            }
            else if (line[i] === ' ') {
                let spaceCount = 0;
                while (i < line.length && line[i] === ' ') {
                    spaceCount++;
                    i++;
                }
                // マークダウン標準では2スペースまたは4スペースで1レベル
                // 2スペース単位で計算し、4スペースは2レベル、6スペースは3レベルとする
                // より柔軟に対応するため、2スペース単位で計算
                indentLevel += Math.floor(spaceCount / 2);
            }
            else if (line[i] === '　') {
                // 全角スペースは段落インデントとして扱うため、インデントレベルは加算しない
                i++;
            }
        }
        // インデントを除いた部分を取得
        const remaining = line.substring(i);
        // 無序リスト（- item、+ item、* item）
        // リスト記号の後にスペースが1つ以上必要
        const unorderedMatch = remaining.match(/^[-+*]\s+(.+)$/);
        if (unorderedMatch) {
            return {
                type: 'ul',
                indentLevel: indentLevel,
                content: unorderedMatch[1]
            };
        }
        // 有序リスト（1. item）
        // 数字の後にピリオドとスペースが1つ以上必要
        const orderedMatch = remaining.match(/^(\d+)\.\s+(.+)$/);
        if (orderedMatch) {
            return {
                type: 'ol',
                indentLevel: indentLevel,
                content: orderedMatch[2],
                orderNumber: parseInt(orderedMatch[1], 10)
            };
        }
        return null;
    }
    /**
     * リスト項目のインデントレベルを正確に計算
     * リスト記号（- 、+ 、* 、1. など）より前のスペース/タブをカウント
     */
    calculateListIndentLevel(line) {
        const itemInfo = this.parseListItem(line);
        return itemInfo ? itemInfo.indentLevel : 0;
    }
    /**
     * より正確なインデントレベル計算（旧メソッド、互換性のため残す）
     */
    calculateIndentLevelPrecise(line) {
        return this.calculateListIndentLevel(line);
    }
    /**
     * リストスタック調整（ネスト対応改善版）
     * @returns 閉じられたリストのレベル配列
     */
    adjustListStack(listStack, currentType, currentLevel) {
        const closedLevels = [];
        const closingTagsDeep = [];
        const closingTagsSameLevel = [];
        const openingTags = [];
        // 現在のレベルより深いスタックを削除（同じレベルは閉じない）
        while (listStack.length > 0 && listStack[listStack.length - 1].level > currentLevel) {
            const closing = listStack.pop();
            closedLevels.push(closing.level);
            closingTagsDeep.push(`</${closing.type}>`);
        }
        // 同じレベルで異なるタイプの場合、閉じて新しく開始
        if (listStack.length > 0 &&
            listStack[listStack.length - 1].level === currentLevel &&
            listStack[listStack.length - 1].type !== currentType) {
            // 同じレベルで異なるタイプのリストの場合、前のリストを閉じて新しいリストを開始
            const closing = listStack.pop();
            closingTagsSameLevel.push(`</${closing.type}>`);
            openingTags.push(`<${currentType}>`);
            listStack.push({
                type: currentType,
                level: currentLevel,
                counter: currentType === 'ol' ? 0 : undefined,
                explicitNumbering: currentType === 'ol' ? false : undefined
            });
            return { closedLevels, closingTagsDeep, closingTagsSameLevel, openingTags };
        }
        // 同じレベルの同じタイプの場合は何もしない（既に開始タグがある）
        if (listStack.length > 0 &&
            listStack[listStack.length - 1].level === currentLevel &&
            listStack[listStack.length - 1].type === currentType) {
            return { closedLevels, closingTagsDeep, closingTagsSameLevel, openingTags };
        }
        // 新しいレベルのリストを開始（スタックが空、または最後のスタックのレベルより深い場合）
        if (listStack.length === 0) {
            // スタックが空の場合、必ず開始タグを追加
            openingTags.push(`<${currentType}>`);
            listStack.push({
                type: currentType,
                level: currentLevel,
                counter: currentType === 'ol' ? 0 : undefined,
                explicitNumbering: currentType === 'ol' ? false : undefined
            });
        }
        else if (listStack[listStack.length - 1].level < currentLevel) {
            // より深いレベルに進む場合
            openingTags.push(`<${currentType}>`);
            listStack.push({
                type: currentType,
                level: currentLevel,
                counter: currentType === 'ol' ? 0 : undefined,
                explicitNumbering: currentType === 'ol' ? false : undefined
            });
        }
        return { closedLevels, closingTagsDeep, closingTagsSameLevel, openingTags };
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
     * 改良版段落処理（リスト後の処理を含む、HTMLタグ対応）
     */
    processParagraphsImproved(text) {
        const lines = text.split('\n');
        const result = [];
        let currentParagraph = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();
            // 既に構造的HTMLタグの行はそのまま通す（リスト、見出し、テーブルなど）
            // HTMLタグを含む行もそのまま通す
            if (this.isStructuralHtmlTag(trimmed) ||
                trimmed.startsWith('<') ||
                trimmed.match(/^<[a-zA-Z]/) ||
                this.isListOrTableLine(line) ||
                this.isProcessedHtmlTag(line)) {
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
     * 処理済みHTMLタグかどうかを判定（リスト、見出し、テーブルなどのタグ）
     */
    isProcessedHtmlTag(line) {
        const trimmed = line.trim();
        // リストタグ（開始タグ、終了タグ、または<li>で始まる行）
        if (/^<\/?(ul|ol)>/.test(trimmed) || /^<li>/.test(trimmed) || /^<\/li>/.test(trimmed)) {
            return true;
        }
        // 見出しタグ
        if (/^<h[1-6]>/.test(trimmed) || /^<\/h[1-6]>/.test(trimmed)) {
            return true;
        }
        // テーブルタグ
        if (/^<\/?(table|thead|tbody|tfoot|tr|th|td)>/.test(trimmed)) {
            return true;
        }
        // 水平線タグ
        if (/^<hr\s/.test(trimmed) || trimmed === '<hr>' || trimmed === '<hr />') {
            return true;
        }
        return false;
    }
    /**
     * リストまたはテーブル行かどうかを判定
     */
    isListOrTableLine(line) {
        const trimmed = line.trim();
        // リスト記号で始まる行（まだ処理されていないマークダウン）
        if (/^[-+*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
            return true;
        }
        // テーブル行（|を含む）
        if (trimmed.includes('|') && trimmed.split('|').length >= 2) {
            return true;
        }
        // HTMLのリストタグ（処理済み）
        if (trimmed.startsWith('<ul>') || trimmed.startsWith('</ul>') ||
            trimmed.startsWith('<ol>') || trimmed.startsWith('</ol>') ||
            trimmed.startsWith('<li>') || trimmed.endsWith('</li>')) {
            return true;
        }
        return false;
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
     * 構造的HTMLタグかどうか判定（HTMLタグを含む行は全て構造的要素として扱う）
     */
    isStructuralHtmlTag(line) {
        const trimmed = line.trim();
        // HTMLタグが含まれている場合は構造的要素として扱う
        // <で始まり>で終わるタグを検出
        const htmlTagPattern = /<\/?[a-zA-Z][a-zA-Z0-9]*(?:\s+[^>]*)?>/;
        if (htmlTagPattern.test(trimmed)) {
            return true;
        }
        // 構造的タグのリスト（既存の判定も残す）
        const structuralTags = [
            'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
            'p', 'div', 'section', 'article', 'nav', 'aside', 'header', 'footer',
            'ul', 'ol', 'li', 'dl', 'dt', 'dd',
            'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
            'pre', 'code', 'blockquote',
            'form', 'fieldset', 'legend',
            'hr', 'a', 'img', 'span', 'strong', 'em', 'i', 'b', 'u', 'del', 'ins',
            'script', 'style', 'br', 'hr'
        ];
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
