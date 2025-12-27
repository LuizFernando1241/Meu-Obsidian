import type { Item } from './types';

export const matchesItemSearch = (item: Item, query: string) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const inTitle = item.title.toLowerCase().includes(normalized);
  if (inTitle) {
    return true;
  }

  return item.content.some((block) => {
    const text = block.text ?? '';
    return text.toLowerCase().includes(normalized);
  });
};
