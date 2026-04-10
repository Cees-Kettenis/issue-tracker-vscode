import { escapeHtml } from './strings';

export function renderMarkdown(value: string): string {
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  const blocks: string[] = [];
  let paragraph: string[] = [];
  let listType: 'ul' | 'ol' | undefined;
  let listItems: string[] = [];
  let blockquoteLines: string[] = [];
  let codeLines: string[] = [];
  let inCodeBlock = false;

  const flushParagraph = (): void => {
    if (!paragraph.length) {
      return;
    }

    blocks.push(`<p>${paragraph.join(' ')}</p>`);
    paragraph = [];
  };

  const flushList = (): void => {
    if (!listType) {
      return;
    }

    blocks.push(`<${listType}>${listItems.join('')}</${listType}>`);
    listType = undefined;
    listItems = [];
  };

  const flushBlockquote = (): void => {
    if (!blockquoteLines.length) {
      return;
    }

    blocks.push(`<blockquote>${blockquoteLines.join('<br />')}</blockquote>`);
    blockquoteLines = [];
  };

  const flushCodeBlock = (): void => {
    if (!inCodeBlock) {
      return;
    }

    blocks.push(`<pre><code>${codeLines.join('\n')}</code></pre>`);
    inCodeBlock = false;
    codeLines = [];
  };

  const closeOpenBlocks = (): void => {
    flushParagraph();
    flushList();
    flushBlockquote();
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (inCodeBlock) {
      if (trimmed === '```') {
        flushCodeBlock();
      } else {
        codeLines.push(escapeHtml(line));
      }

      continue;
    }

    if (trimmed === '```') {
      closeOpenBlocks();
      inCodeBlock = true;
      continue;
    }

    if (!trimmed) {
      closeOpenBlocks();
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      closeOpenBlocks();
      const level = headingMatch[1].length;
      blocks.push(`<h${level}>${formatInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    const unorderedMatch = line.match(/^\s*[-*+]\s+(.*)$/);
    if (unorderedMatch) {
      flushParagraph();
      flushBlockquote();
      if (listType && listType !== 'ul') {
        flushList();
      }

      listType = 'ul';
      listItems.push(`<li>${formatInline(unorderedMatch[1])}</li>`);
      continue;
    }

    const orderedMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      flushBlockquote();
      if (listType && listType !== 'ol') {
        flushList();
      }

      listType = 'ol';
      listItems.push(`<li>${formatInline(orderedMatch[1])}</li>`);
      continue;
    }

    const blockquoteMatch = line.match(/^>\s?(.*)$/);
    if (blockquoteMatch) {
      flushParagraph();
      flushList();
      blockquoteLines.push(formatInline(blockquoteMatch[1]));
      continue;
    }

    flushList();
    flushBlockquote();
    paragraph.push(formatInline(line));
  }

  flushCodeBlock();
  closeOpenBlocks();

  return blocks.join('\n');
}

function formatInline(text: string): string {
  const escaped = escapeHtml(text);

  return escaped
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/_([^_]+)_/g, '<em>$1</em>');
}
