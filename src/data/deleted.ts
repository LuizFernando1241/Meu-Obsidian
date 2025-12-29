import type { Node } from './types';

export const getDeletedAt = (node?: { props?: Record<string, unknown> } | null) => {
  const props = node?.props;
  if (!props || typeof props !== 'object') {
    return undefined;
  }
  const value = (props as Record<string, unknown>).deletedAt;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

export const isSoftDeleted = (node?: { props?: Record<string, unknown> } | null) =>
  typeof getDeletedAt(node) === 'number';

export const filterActiveNodes = <T extends Node>(nodes: T[]) =>
  nodes.filter((node) => !isSoftDeleted(node));
