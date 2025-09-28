/**
 * WordPress Post Extension - Phase 1
 * 自前実装Markdown→HTML変換エンジン（改行・スペース保持改良版）
 */

export interface MarkdownParseResult {
  html: string;
  metadata: Record<string, any>;
}

export class MarkdownParser {
  /**
   * MarkdownをHTMLに変換するメイン関数
   */
  public parse(markdown: string): MarkdownParseResult {
    // YAMLヘッダーと本文を分離
    const { metadata, content } = this.extractYamlHeader(markdown);
    
    // Markdown本文をHTMLに変換
    const html = this.convertToHtml(content);
    
    return { html, metadata };
  }

  /**
   * YAMLヘッダーを抽出
   */
  private extractYamlHeader(markdown: string): { metadata: Record<string, any>, content: string } {
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
  private parseYaml(yamlContent: string): Record<string, any> {
    const metadata: Record<string, any> = {};
    const lines = yamlContent.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
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
  private convertToHtml(content: string): string {
    let html = content;
    
    // コードブロックを先に処理（他の記法と干渉しないよう）
    html = this.processCodeBlocks(html);
    
    // 見出し
    html = this.processHeadings(html);
    
    // リスト（改良版）- インライン記法も内部で処理するため先に実行
    html = this.processListsImproved(html);
    
    // テーブル
    html = this.processTables(html);
    
    // 残りのインライン記法（リスト外の箇所）
    html = this.processBold(html);
    html = this.processInlineCode(html);
    html = this.processImages(html);
    html = this.processLinks(html);
    
    // 段落処理（改行・スペース保持版）- 最後に実行
    html = this.processParagraphsImproved(html);
    
    return html;
  }

  /**
   * コードブロック処理（改行を正しく保持）
   */
  private processCodeBlocks(text: string): string {
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
  private processHeadings(text: string): string {
    return text.replace(/^(#{1,6})\s+(.+)$/gm, (match, hashes, title) => {
      const level = hashes.length;
      return `<h${level}>${title.trim()}</h${level}>`;
    });
  }

  /**
   * 太字処理
   */
  private processBold(text: string): string {
    // **記法
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // __記法
    text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');
    return text;
  }

  /**
   * インラインコード処理
   */
  private processInlineCode(text: string): string {
    return text.replace(/`([^`]+?)`/g, '<code>$1</code>');
  }

  /**
   * 画像処理
   */
  private processImages(text: string): string {
    return text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
  }

  /**
   * リンク処理
   */
  private processLinks(text: string): string {
    return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  }

  /**
   * 改良版リスト処理（正しいHTMLネスト構造生成＋インライン記法処理）
   */
  private processListsImproved(text: string): string {
    const lines = text.split('\n');
    const result: string[] = [];
    const listStack: Array<{type: 'ul' | 'ol', level: number, hasContent: boolean}> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // インデントレベルを正確に計算
      const indentLevel = this.calculateIndentLevelPrecise(line);

      // 無序リスト（- item）
      const unorderedMatch = trimmed.match(/^-\s+(.+)$/);
      if (unorderedMatch) {
        const rawContent = unorderedMatch[1];
        // リスト項目内のインライン記法を処理
        const processedContent = this.processInlineMarkup(rawContent);
        this.adjustListStackForProperNesting(result, listStack, 'ul', indentLevel);
        result.push(`<li>${processedContent}</li>`);
      }
      // 有序リスト（1. item）
      else if (trimmed.match(/^\d+\.\s+(.+)$/)) {
        const rawContent = trimmed.replace(/^\d+\.\s+/, '');
        // リスト項目内のインライン記法を処理
        const processedContent = this.processInlineMarkup(rawContent);
        this.adjustListStackForProperNesting(result, listStack, 'ol', indentLevel);
        result.push(`<li>${processedContent}</li>`);
      }
      // 空行
      else if (trimmed === '') {
        result.push(line);
      }
      // リスト項目以外の行
      else {
        // 見出しやHTMLタグなど、明らかにリストを終了すべき行
        if (this.isHtmlTag(trimmed) || trimmed.match(/^#{1,6}\s+/)) {
          this.closeAllListsWithProperNesting(result, listStack);
        }
        result.push(line);
      }
    }

    // 最後に残ったリストタグを全て閉じる
    this.closeAllListsWithProperNesting(result, listStack);

    return result.join('\n');
  }

  /**
   * リスト項目内のインライン記法を処理
   */
  private processInlineMarkup(content: string): string {
    let processed = content;
    
    // 太字処理
    processed = processed.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    processed = processed.replace(/__(.+?)__/g, '<strong>$1</strong>');
    
    // インラインコード
    processed = processed.replace(/`([^`]+?)`/g, '<code>$1</code>');
    
    // リンク・画像
    processed = processed.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">');
    processed = processed.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    
    return processed;
  }

  /**
   * より正確なインデントレベル計算
   */
  private calculateIndentLevelPrecise(line: string): number {
    let level = 0;
    let i = 0;
    
    while (i < line.length && (line[i] === ' ' || line[i] === '\t')) {
      if (line[i] === '\t') {
        level++;
        i++;
      } else if (line[i] === ' ') {
        // スペース4個で1レベル、2個で0.5レベル
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
   * 正しいHTMLネスト構造でリストスタックを調整
   */
  private adjustListStackForProperNesting(
    result: string[], 
    listStack: Array<{type: 'ul' | 'ol', level: number, hasContent: boolean}>,
    currentType: 'ul' | 'ol',
    currentLevel: number
  ): void {
    // 現在のレベルより深いスタックを削除
    while (listStack.length > 0 && listStack[listStack.length - 1].level > currentLevel) {
      const closing = listStack.pop()!;
      result.push(`</${closing.type}>`);
      if (listStack.length > 0) {
        result.push('</li>');
      }
    }

    // 同じレベルで異なるタイプの場合、閉じて新しく開始
    if (listStack.length > 0 && 
        listStack[listStack.length - 1].level === currentLevel &&
        listStack[listStack.length - 1].type !== currentType) {
      const closing = listStack.pop()!;
      result.push(`</${closing.type}>`);
      if (listStack.length > 0) {
        result.push('</li>');
      }
    }

    // 同じレベルで同じタイプの場合、前のリスト項目を閉じる
    if (listStack.length > 0 && 
        listStack[listStack.length - 1].level === currentLevel &&
        listStack[listStack.length - 1].type === currentType &&
        listStack[listStack.length - 1].hasContent) {
      result.push('</li>');
      listStack[listStack.length - 1].hasContent = false;
    }

    // 新しいレベルのリストを開始
    if (listStack.length === 0 || listStack[listStack.length - 1].level < currentLevel) {
      if (listStack.length > 0) {
        // 親のli要素の中にネストしたリストを開始
        const lastIndex = result.length - 1;
        if (result[lastIndex].endsWith('</li>')) {
          result[lastIndex] = result[lastIndex].replace('</li>', '');
          listStack[listStack.length - 1].hasContent = true;
        }
      }
      
      result.push(`<${currentType}>`);
      listStack.push({type: currentType, level: currentLevel, hasContent: false});
    }
  }

  /**
   * 正しいHTMLネスト構造ですべてのリストタグを閉じる
   */
  private closeAllListsWithProperNesting(
    result: string[], 
    listStack: Array<{type: 'ul' | 'ol', level: number, hasContent: boolean}>
  ): void {
    while (listStack.length > 0) {
      const closing = listStack.pop()!;
      result.push(`</${closing.type}>`);
      if (listStack.length > 0) {
        result.push('</li>');
      }
    }
  }

  /**
   * テーブル処理
   */
  private processTables(text: string): string {
    const lines = text.split('\n');
    const result: string[] = [];
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
        const cells = trimmed.slice(1, -1).split('|').map((cell: string) => cell.trim());
        
        if (!isHeaderProcessed) {
          // ヘッダー行
          result.push('<thead><tr>');
          cells.forEach((cell: string) => {
            result.push(`<th>${cell}</th>`);
          });
          result.push('</tr></thead><tbody>');
          isHeaderProcessed = true;
        } else {
          // データ行
          result.push('<tr>');
          cells.forEach((cell: string) => {
            result.push(`<td>${cell}</td>`);
          });
          result.push('</tr>');
        }
      } else {
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
   * 改良版段落処理（行頭スペース・改行保持）
   */
  private processParagraphsImproved(text: string): string {
    const lines = text.split('\n');
    const result: string[] = [];
    let currentParagraph: string[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      // 既にHTMLタグの行はそのまま通す
      if (this.isHtmlTag(trimmed)) {
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
        // 空行は出力しない（段落区切りとしてのみ機能）
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
  private preserveLeadingSpaces(line: string): string {
    const match = line.match(/^(\s*)(.*)/);
    if (!match) return line;

    const [, leadingSpaces, content] = match;
    
    // 行頭スペースを&nbsp;に変換（半角・全角を区別）
    let preservedSpaces = '';
    for (const char of leadingSpaces) {
      if (char === ' ') {
        preservedSpaces += '&nbsp;'; // 半角スペース
      } else if (char === '　') {
        preservedSpaces += '&#12288;'; // 全角スペース
      } else if (char === '\t') {
        preservedSpaces += '&nbsp;&nbsp;&nbsp;&nbsp;'; // タブは4つの&nbsp;
      } else {
        preservedSpaces += char;
      }
    }

    // contentはそのまま返す（HTMLエスケープしない）
    return preservedSpaces + content;
  }

  /**
   * HTMLタグかどうか判定
   */
  private isHtmlTag(line: string): boolean {
    return /^<\/?[a-zA-Z][^>]*>/.test(line.trim());
  }

  /**
   * HTMLエスケープ
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }
}