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

export const itemToDoc = (item: Node): SearchDoc => {
  const contentText =
    item.nodeType === 'note'
      ? item.content
          .filter((block) => block.type !== 'divider')
          .map((block) => block.text ?? '')
          .filter(Boolean)
          .join(' ')
      : '';

  return {
    id: item.id,
    title: item.title,
    type: item.nodeType,
    tagsText: (item.tags ?? []).join(' '),
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
