import type { SavedView } from './types';

const normalizeOrder = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export const compareViews = (left: SavedView, right: SavedView) => {
  const leftOrder = normalizeOrder(left.order);
  const rightOrder = normalizeOrder(right.order);

  if (leftOrder !== undefined && rightOrder !== undefined && leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  if (leftOrder !== undefined && rightOrder === undefined) {
    return -1;
  }
  if (leftOrder === undefined && rightOrder !== undefined) {
    return 1;
  }

  const leftUpdated = typeof left.updatedAt === 'number' ? left.updatedAt : 0;
  const rightUpdated = typeof right.updatedAt === 'number' ? right.updatedAt : 0;
  if (leftUpdated !== rightUpdated) {
    return rightUpdated - leftUpdated;
  }

  const leftName = left.name?.trim().toLowerCase() ?? '';
  const rightName = right.name?.trim().toLowerCase() ?? '';
  if (leftName === rightName) {
    return left.id.localeCompare(right.id);
  }
  return leftName.localeCompare(rightName);
};

export const sortViews = (views: SavedView[]) => views.sort(compareViews);
