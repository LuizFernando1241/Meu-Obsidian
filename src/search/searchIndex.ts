import MiniSearch from 'minisearch';

import type { Node, NodeType } from '../data/types';

export type SearchDoc = {
  id: string;
  title: string;
  type: NodeType;
  tagsText: string;
  contentText: string;
  updatedAt: number;
};

const DEFAULT_INDEXED_KEYS = ['status', 'priority', 'due', 'reviewAfter', 'context'];

const buildPropsText = (props: Node['props'] | undefined, indexedKeys?: string[]) => {
  if (!props || typeof props !== 'object') {
    return '';
  }
  const entries = indexedKeys === undefined ? DEFAULT_INDEXED_KEYS : indexedKeys;
  const parts: string[] = [];
  entries.forEach((key) => {
    const raw = (props as Record<string, unknown>)[key];
    if (typeof raw === 'string' && raw.trim()) {
      const value = raw.trim();
      parts.push(`${key}:${value}`);
      parts.push(value);
      return;
    }
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      parts.push(`${key}:${raw}`);
      return;
    }
    if (typeof raw === 'boolean') {
      parts.push(`${key}:${raw ? 'true' : 'false'}`);
      return;
    }
    if (Array.isArray(raw)) {
      raw.forEach((entry) => {
        if (typeof entry === 'string' && entry.trim()) {
          const value = entry.trim();
          parts.push(`${key}:${value}`);
          parts.push(value);
        }
      });
    }
  });
  return parts.join(' ');
};

export const itemToDoc = (item: Node, indexedKeys?: string[]): SearchDoc => {
  const contentText =
    item.nodeType === 'note'
      ? item.content
          .filter((block) => block.type !== 'divider')
          .map((block) => block.text ?? '')
          .filter(Boolean)
          .join(' ')
      : '';
  const propsText = buildPropsText(item.props, indexedKeys);

  return {
    id: item.id,
    title: item.title,
    type: item.nodeType,
    tagsText: [item.tags?.join(' '), propsText].filter(Boolean).join(' '),
    contentText,
    updatedAt: item.updatedAt,
  };
};

export const buildIndex = (docs: SearchDoc[]): MiniSearch<SearchDoc> => {
  const index = new MiniSearch<SearchDoc>({
    fields: ['title', 'contentText', 'tagsText'],
    storeFields: ['id', 'title', 'type', 'updatedAt'],
    searchOptions: {
      prefix: true,
      fuzzy: 0.2,
      combineWith: 'AND',
    },
  });

  index.addAll(docs);
  return index;
};

export const runSearch = (index: MiniSearch<SearchDoc>, query: string, limit = 30) => {
  const normalized = query.trim();
  if (!normalized) {
    return [];
  }

  return index.search(normalized).slice(0, limit);
};
