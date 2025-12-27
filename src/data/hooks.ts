import { useLiveQuery } from 'dexie-react-hooks';

import {
  getItemsByIds,
  getItem,
  listBacklinks,
  listFavorites,
  listByNodeType,
  listChildren,
  listOutgoingLinks,
  listRecent,
} from './repo';
import type { Node, NodeType } from './types';

export const useItem = (id: string): Node | undefined =>
  useLiveQuery(() => (id ? getItem(id) : undefined), [id]);

export const useBacklinks = (targetId: string): Node[] =>
  useLiveQuery(() => (targetId ? listBacklinks(targetId) : []), [targetId]) ?? [];

export const useOutgoingLinks = (itemId: string): Node[] => {
  const item = useItem(itemId);
  const linksKey = item?.linksTo?.join('|') ?? '';
  return (
    useLiveQuery(() => (item ? listOutgoingLinks(item) : []), [item?.id, linksKey]) ?? []
  );
};

export const useNodesByType = (nodeType: NodeType): Node[] =>
  useLiveQuery(() => listByNodeType(nodeType), [nodeType]) ?? [];

export const useChildren = (parentId?: string): Node[] =>
  useLiveQuery(() => listChildren(parentId), [parentId ?? 'root']) ?? [];

export const useItemsByIds = (ids: string[]): Node[] => {
  const key = ids.join('|');
  return useLiveQuery(() => (ids.length ? getItemsByIds(ids) : []), [key]) ?? [];
};

export const useFavorites = (): Node[] => useLiveQuery(() => listFavorites(), []) ?? [];

export const useRecent = (limit: number): Node[] =>
  useLiveQuery(() => listRecent(limit), [limit]) ?? [];

export const useRecentItems = (limit = 10): Node[] =>
  useLiveQuery(() => listRecent(limit), [limit]) ?? [];

export const useFavoriteItems = (): Node[] => useLiveQuery(() => listFavorites(), []) ?? [];
