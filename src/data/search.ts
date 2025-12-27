import type { Node } from './types';

export const matchesItemSearch = (item: Node, query: string) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const inTitle = item.title.toLowerCase().includes(normalized);
  if (inTitle) {
    return true;
  }

  if (item.nodeType !== 'note') {
    return false;
  }

  return item.content.some((block) => {
    const text = block.text ?? '';
    return text.toLowerCase().includes(normalized);
  });
};
