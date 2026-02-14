/**
 * 段落级翻译工具函数
 * 用于处理 HTML 内容的段落分割和翻译
 */

export interface ParagraphSegment {
  type: 'paragraph';
  originalHTML: string;
  originalText: string;
  tagName: string;
}

export interface CodeSegment {
  type: 'code';
  codeBlockIndex: number;
}

export interface OtherHTMLSegment {
  type: 'other';
  html: string;
}

export type Segment = ParagraphSegment | CodeSegment | OtherHTMLSegment;

const HTML_ENTITIES: Record<string, string> = {
  '&nbsp;': ' ',
  '&lt;': '<',
  '&gt;': '>',
  '&amp;': '&',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
};

function decodeHTMLEntities(text: string): string {
  let result = text;
  for (const [entity, char] of Object.entries(HTML_ENTITIES)) {
    result = result.replace(new RegExp(entity, 'g'), char);
  }
  result = result.replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
  result = result.replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)));
  return result;
}

export function extractTextFromHTML(html: string): string {
  let text = html.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = decodeHTMLEntities(text);
  return text.trim();
}

const BLOCK_TAGS = ['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'td', 'th', 'dt', 'dd'];

export function splitHTMLToSegments(
  processedHTML: string,
  codeBlocksCount: number
): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;

  const codeBlockRegex = /__CODE_BLOCK_(\d+)__/g;
  const allMatches: Array<{ index: number; endIndex: number; blockIndex: number; type: 'code' }> = [];

  let codeMatch;
  while ((codeMatch = codeBlockRegex.exec(processedHTML)) !== null) {
    allMatches.push({
      index: codeMatch.index,
      endIndex: codeMatch.index + codeMatch[0].length,
      blockIndex: parseInt(codeMatch[1], 10),
      type: 'code',
    });
  }

  const blockTagRegex = new RegExp(
    `<(${BLOCK_TAGS.join('|')})([^>]*)>([\\s\\S]*?)<\\/\\1>`,
    'gi'
  );
  const blockMatches: Array<{ index: number; endIndex: number; html: string; tagName: string; type: 'block' }> = [];

  let blockMatch;
  while ((blockMatch = blockTagRegex.exec(processedHTML)) !== null) {
    blockMatches.push({
      index: blockMatch.index,
      endIndex: blockMatch.index + blockMatch[0].length,
      html: blockMatch[0],
      tagName: blockMatch[1].toLowerCase(),
      type: 'block',
    });
  }

  const allElements = [
    ...allMatches,
    ...blockMatches,
  ].sort((a, b) => a.index - b.index);

  for (const elem of allElements) {
    if (elem.index > lastIndex) {
      const between = processedHTML.slice(lastIndex, elem.index).trim();
      if (between) {
        segments.push({
          type: 'other',
          html: between,
        });
      }
    }

    if (elem.type === 'code') {
      segments.push({
        type: 'code',
        codeBlockIndex: elem.blockIndex,
      });
    } else if (elem.type === 'block') {
      const text = extractTextFromHTML(elem.html);
      if (text) {
        segments.push({
          type: 'paragraph',
          originalHTML: elem.html,
          originalText: text,
          tagName: elem.tagName,
        });
      }
    }

    lastIndex = elem.endIndex;
  }

  if (lastIndex < processedHTML.length) {
    const remaining = processedHTML.slice(lastIndex).trim();
    if (remaining) {
      segments.push({
        type: 'other',
        html: remaining,
      });
    }
  }

  return segments;
}

export function wrapTranslationInTag(
  translatedText: string,
  tagName: string
): string {
  const validTags = BLOCK_TAGS;
  const safeTag = validTags.includes(tagName) ? tagName : 'p';
  return `<${safeTag} class="translated-text">${translatedText}</${safeTag}>`;
}

export function isTranslatableSegment(segment: Segment): segment is ParagraphSegment {
  return segment.type === 'paragraph';
}

export function groupSegmentsForBatchTranslation(
  segments: Segment[],
  maxBatchSize: number = 2000
): Array<{ segments: ParagraphSegment[]; text: string }> {
  const groups: Array<{ segments: ParagraphSegment[]; text: string }> = [];
  let currentGroup: ParagraphSegment[] = [];
  let currentText = '';

  for (const segment of segments) {
    if (segment.type === 'paragraph') {
      if (currentText.length + segment.originalText.length > maxBatchSize && currentGroup.length > 0) {
        groups.push({ segments: currentGroup, text: currentText });
        currentGroup = [];
        currentText = '';
      }
      currentGroup.push(segment);
      currentText += (currentText ? '\n\n' : '') + segment.originalText;
    }
  }

  if (currentGroup.length > 0) {
    groups.push({ segments: currentGroup, text: currentText });
  }

  return groups;
}

export function splitBatchTranslationResult(
  translatedText: string,
  originalSegments: ParagraphSegment[]
): string[] {
  const results: string[] = [];
  const lines = translatedText.split('\n\n');

  for (let i = 0; i < originalSegments.length; i++) {
    if (i < lines.length) {
      results.push(lines[i].trim());
    } else {
      results.push('');
    }
  }

  return results;
}
