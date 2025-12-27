import { useLiveQuery } from 'dexie-react-hooks';

import {
  getItemsByIds,
  getItem,
  listBacklinks,
  listByType,
  listFavorites,
  listNoDueDateTasks,
  listOpenTasks,
  listOverdueTasks,
  listOutgoingLinks,
  listRecent,
  listTasksByProject,
  listTodayTasks,
} from './repo';
import type { Item, ItemType } from './types';

export const useItem = (id: string): Item | undefined =>
  useLiveQuery(() => (id ? getItem(id) : undefined), [id]);

export const useBacklinks = (targetId: string): Item[] =>
  useLiveQuery(() => (targetId ? listBacklinks(targetId) : []), [targetId]) ?? [];

export const useOutgoingLinks = (itemId: string): Item[] => {
  const item = useItem(itemId);
  const linksKey = item?.linksTo?.join('|') ?? '';
  return (
    useLiveQuery(() => (item ? listOutgoingLinks(item) : []), [item?.id, linksKey]) ?? []
  );
};

export const useItemsByType = (type: ItemType): Item[] =>
  useLiveQuery(() => listByType(type), [type]) ?? [];

export const useTasksByProject = (projectId: string): Item[] =>
  useLiveQuery(() => (projectId ? listTasksByProject(projectId) : []), [projectId]) ?? [];

export const useItemsByIds = (ids: string[]): Item[] => {
  const key = ids.join('|');
  return useLiveQuery(() => (ids.length ? getItemsByIds(ids) : []), [key]) ?? [];
};

export const useFavorites = (): Item[] => useLiveQuery(() => listFavorites(), []) ?? [];

export const useRecent = (limit: number): Item[] =>
  useLiveQuery(() => listRecent(limit), [limit]) ?? [];

export const useTodayTasks = (): Item[] => {
  const dayKey = new Date().toDateString();
  return useLiveQuery(() => listTodayTasks(Date.now()), [dayKey]) ?? [];
};

export const useOverdueTasks = (): Item[] => {
  const dayKey = new Date().toDateString();
  return useLiveQuery(() => listOverdueTasks(Date.now()), [dayKey]) ?? [];
};

export const useOpenTasksNoDueDate = (): Item[] =>
  useLiveQuery(() => listNoDueDateTasks(), []) ?? [];

export const useProjects = (limit = 5): Item[] =>
  useLiveQuery(async () => {
    const projects = await listByType('project');
    return projects.slice(0, limit);
  }, [limit]) ?? [];

export const useRecentItems = (limit = 10): Item[] =>
  useLiveQuery(() => listRecent(limit), [limit]) ?? [];

export const useFavoriteItems = (): Item[] => useLiveQuery(() => listFavorites(), []) ?? [];

export const useOpenTasks = (): Item[] => useLiveQuery(() => listOpenTasks(), []) ?? [];
