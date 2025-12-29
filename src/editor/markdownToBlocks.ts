import { v4 as uuidv4 } from 'uuid';

import type { Block, BlockType } from '../data/types';

const ensureType = (type: BlockType): BlockType => type;

const makeBlock = (type: BlockType, text: string): Block => ({
  id: uuidv4(),
  type: ensureType(type),
  text,
});

const makeChecklist = (text: string, checked: boolean): Block => ({
  id: uuidv4(),
  type: 'checklist',
  text,
  checked,
  createdAt: Date.now(),
});

const makeCodeBlock = (text: string, language?: string): Block => ({
  id: uuidv4(),
  type: 'code',
  text,
  language,
});

const normalizeText = (value: string) => value.replace(/\s+/g, ' ').trim();

export const parseMarkdownToBlocks = (input: string): Block[] => {
  if (!input || !input.trim()) {
    return [];
  }

  const lines = input.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let inCode = false;
  let codeLines: string[] = [];
  let codeLanguage: string | undefined;

  const flushParagraph = () => {
    if (paragraph.length === 0) {
      return;
    }
    const text = normalizeText(paragraph.join(' '));
    if (text) {
      blocks.push(makeBlock('paragraph', text));
    }
    paragraph = [];
  };

  const flushCode = () => {
    const text = codeLines.join('\n');
    blocks.push(makeCodeBlock(text, codeLanguage));
    codeLines = [];
    codeLanguage = undefined;
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (inCode) {
      if (trimmed.startsWith('```')) {
        flushCode();
        inCode = false;
        continue;
      }
      codeLines.push(rawLine);
      continue;
    }

    if (trimmed.startsWith('```')) {
      flushParagraph();
      inCode = true;
      const language = trimmed.slice(3).trim();
      codeLanguage = language ? language : undefined;
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      flushParagraph();
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      const type = level <= 1 ? 'h1' : level === 2 ? 'h2' : 'h3';
      blocks.push(makeBlock(type, text));
      continue;
    }

    const checklistMatch = trimmed.match(/^[-*]\s+\[( |x|X)\]\s+(.*)$/);
    if (checklistMatch) {
      flushParagraph();
      const checked = checklistMatch[1].toLowerCase() === 'x';
      blocks.push(makeChecklist(checklistMatch[2].trim(), checked));
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*]\s+(.*)$/);
    if (bulletMatch) {
      flushParagraph();
      blocks.push(makeBlock('bullet', bulletMatch[1].trim()));
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (orderedMatch) {
      flushParagraph();
      blocks.push(makeBlock('numbered', orderedMatch[1].trim()));
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  if (inCode) {
    flushCode();
  }

  return blocks;
};

export const blocksToMarkdown = (blocks: Block[]): string => {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return '';
  }

  const lines: string[] = [];
  blocks.forEach((block) => {
    const text = block.text ?? '';
    switch (block.type) {
      case 'h1':
        lines.push(`# ${text}`);
        break;
      case 'h2':
        lines.push(`## ${text}`);
        break;
      case 'h3':
        lines.push(`### ${text}`);
        break;
      case 'checklist':
        lines.push(`${block.checked ? '- [x] ' : '- [ ] '}${text}`);
        break;
      case 'bullet':
        lines.push(`- ${text}`);
        break;
      case 'numbered':
        lines.push(`1. ${text}`);
        break;
      case 'code': {
        const lang = block.language ? ` ${block.language}` : '';
        lines.push(`\`\`\`${lang}`);
        lines.push(text);
        lines.push('```');
        break;
      }
      case 'divider':
        lines.push('---');
        break;
      case 'callout':
      case 'paragraph':
      default:
        lines.push(text);
        break;
    }
    lines.push('');
  });

  return lines.join('\n').trim();
};

export const cloneBlocksWithNewIds = (blocks: Block[]): Block[] =>
  blocks.map((block) => ({
    ...block,
    id: uuidv4(),
  }));
