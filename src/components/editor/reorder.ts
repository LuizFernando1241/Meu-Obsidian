import type { Block } from '../../data/types';

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

export const arrayMove = <T>(arr: T[], from: number, to: number): T[] => {
  if (arr.length === 0) {
    return arr;
  }
  const startIndex = clamp(from, 0, arr.length - 1);
  const endIndex = clamp(to, 0, arr.length);
  if (startIndex === endIndex) {
    return arr;
  }

  const next = arr.slice();
  const [item] = next.splice(startIndex, 1);
  const insertIndex = startIndex < endIndex ? endIndex - 1 : endIndex;
  next.splice(insertIndex, 0, item);
  return next;
};

export const findIndexById = (blocks: Block[], id: string) =>
  blocks.findIndex((block) => block.id === id);
