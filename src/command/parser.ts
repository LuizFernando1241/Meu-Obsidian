import { addDays, isValid, parseISO, startOfDay } from 'date-fns';

import type { ItemType } from '../data/types';

export type ParsedInput = {
  cleanTitle: string;
  tags: string[];
  inferredType?: ItemType;
  dueDate?: number;
};

const normalizeTags = (rawTags: string[]) => {
  const set = new Set<string>();
  rawTags.forEach((tag) => {
    const normalized = tag.trim().toLowerCase();
    if (normalized) {
      set.add(normalized);
    }
  });
  return Array.from(set);
};

const detectType = (text: string): ItemType | undefined => {
  const lower = text.toLowerCase();
  if (/@tasks?\b/.test(lower)) {
    return 'task';
  }
  if (/@notes?\b/.test(lower)) {
    return 'note';
  }
  if (/@projects?\b/.test(lower)) {
    return 'project';
  }
  if (/@areas?\b/.test(lower)) {
    return 'area';
  }
  return undefined;
};

const detectDueDate = (text: string): number | undefined => {
  const lower = text.toLowerCase();
  const now = new Date();

  if (/\bhoje\b/.test(lower)) {
    return startOfDay(now).getTime();
  }

  if (/\bamanh[aã]\b/.test(lower)) {
    return startOfDay(addDays(now, 1)).getTime();
  }

  const match = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (!match) {
    return undefined;
  }

  const parsed = parseISO(match[1]);
  if (!isValid(parsed)) {
    return undefined;
  }

  return startOfDay(parsed).getTime();
};

const stripTokens = (raw: string) => {
  let cleaned = raw;
  cleaned = cleaned.replace(/#[^\s#@]+/g, ' ');
  cleaned = cleaned.replace(/@[^\s#@]+/g, ' ');
  cleaned = cleaned.replace(/\bhoje\b/gi, ' ');
  cleaned = cleaned.replace(/\bamanh[aã]\b/gi, ' ');
  cleaned = cleaned.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ');
  return cleaned.replace(/\s+/g, ' ').trim();
};

export const parseInput = (raw: string): ParsedInput => {
  const tagsMatches = Array.from(raw.matchAll(/#([^\s#@]+)/g)).map((match) => match[1]);
  const tags = normalizeTags(tagsMatches);
  const inferredType = detectType(raw);
  const dueDate = detectDueDate(raw);
  const cleanTitle = stripTokens(raw) || 'Sem título';

  return {
    cleanTitle,
    tags,
    inferredType,
    dueDate,
  };
};

export const stripInputTokens = (raw: string) => stripTokens(raw);
