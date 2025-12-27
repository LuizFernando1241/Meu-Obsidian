import { endOfDay, startOfDay } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

import { extractLinkTargets } from '../app/wikilinks';
import { computeNextDueDateMs } from '../tasks/recurrence';
import { db } from './db';
import { enqueueItemWrite } from './writeQueue';
import type { Block, Item, ItemType } from './types';

type ListParams = {
  limit?: number;
};

let onLocalChange: (() => void) | null = null;

export const setLocalChangeHandler = (handler: (() => void) | null) => {
  onLocalChange = handler;
};

const notifyLocalChange = () => {
  if (!onLocalChange) {
    return;
  }
  try {
    onLocalChange();
  } catch {
    // ignore handler errors
  }
};

const makeParagraph = (text: string): Block => ({
  id: uuidv4(),
  type: 'paragraph',
  text,
});

const defaultTitleByType: Record<ItemType, string> = {
  note: 'Nova nota',
  task: 'Nova tarefa',
  project: 'Novo projeto',
  area: 'Nova area',
};

export const createItem = async (partial: Partial<Item> & Pick<Item, 'type'>): Promise<Item> => {
  const now = Date.now();
  const item: Item = {
    id: uuidv4(),
    type: partial.type,
    title: partial.title ?? defaultTitleByType[partial.type],
    content: partial.content ?? [makeParagraph('')],
    tags: partial.tags ?? [],
    favorite: partial.favorite ?? false,
    linksTo: partial.linksTo ?? [],
    rev: partial.rev ?? 1,
    createdAt: now,
    updatedAt: now,
    status: partial.status,
    dueDate: partial.dueDate,
    doneAt: partial.doneAt,
    recurrence: partial.recurrence,
    projectId: partial.projectId,
    originItemId: partial.originItemId,
    originBlockId: partial.originBlockId,
    originType: partial.originType,
    nextActionId: partial.nextActionId,
  };

  if (item.type === 'task' && !item.status) {
    item.status = 'todo';
  }

  await db.items.put(item);
  notifyLocalChange();
  return item;
};

type ContentPatch = {
  title?: string;
  content?: Block[];
  linksTo?: string[];
};

type PropsPatch = {
  tags?: string[];
  favorite?: boolean;
  status?: Item['status'];
  dueDate?: number;
  doneAt?: number;
  recurrence?: Item['recurrence'];
  projectId?: string;
  originItemId?: string;
  originBlockId?: string;
  originType?: Item['originType'];
  nextActionId?: string;
};

const hasOwn = <T extends object>(obj: T, key: keyof T) =>
  Object.prototype.hasOwnProperty.call(obj, key);

export const updateItemContent = async (id: string, patch: ContentPatch): Promise<Item> => {
  const next = await enqueueItemWrite(id, async () =>
    db.transaction('rw', db.items, async () => {
      const current = await db.items.get(id);
      if (!current) {
        throw new Error('Item nao encontrado');
      }

      const update: Partial<Item> = {
        rev: (current.rev ?? 1) + 1,
        updatedAt: Date.now(),
      };

      if (hasOwn(patch, 'title') && patch.title !== undefined) {
        update.title = patch.title;
      }
      if (hasOwn(patch, 'content') && patch.content !== undefined) {
        update.content = patch.content;
      }
      if (hasOwn(patch, 'linksTo') && patch.linksTo !== undefined) {
        update.linksTo = patch.linksTo;
      }

      await db.items.update(id, update);
      const nextItem = await db.items.get(id);
      if (!nextItem) {
        throw new Error('Item nao encontrado');
      }
      return nextItem;
    }),
  );
  notifyLocalChange();
  return next;
};

export const updateItemProps = async (id: string, patch: PropsPatch): Promise<Item> => {
  const next = await enqueueItemWrite(id, async () =>
    db.transaction('rw', db.items, async () => {
      const current = await db.items.get(id);
      if (!current) {
        throw new Error('Item nao encontrado');
      }

      const update: Partial<Item> = {
        rev: (current.rev ?? 1) + 1,
        updatedAt: Date.now(),
      };

      if (hasOwn(patch, 'tags') && patch.tags !== undefined) {
        update.tags = patch.tags;
      }
      if (hasOwn(patch, 'favorite') && patch.favorite !== undefined) {
        update.favorite = patch.favorite;
      }
      if (hasOwn(patch, 'status') && patch.status !== undefined) {
        update.status = patch.status;
      }
      if (hasOwn(patch, 'dueDate')) {
        update.dueDate = patch.dueDate;
      }
      if (hasOwn(patch, 'doneAt')) {
        update.doneAt = patch.doneAt;
      }
      if (hasOwn(patch, 'recurrence')) {
        update.recurrence = patch.recurrence;
      }
      if (hasOwn(patch, 'projectId')) {
        update.projectId = patch.projectId;
      }
      if (hasOwn(patch, 'originItemId')) {
        update.originItemId = patch.originItemId;
      }
      if (hasOwn(patch, 'originBlockId')) {
        update.originBlockId = patch.originBlockId;
      }
      if (hasOwn(patch, 'originType')) {
        update.originType = patch.originType;
      }
      if (hasOwn(patch, 'nextActionId')) {
        update.nextActionId = patch.nextActionId;
      }

      await db.items.update(id, update);
      const nextItem = await db.items.get(id);
      if (!nextItem) {
        throw new Error('Item nao encontrado');
      }
      return nextItem;
    }),
  );
  notifyLocalChange();
  return next;
};

export const setProjectNextAction = async (
  projectId: string,
  taskId?: string,
): Promise<void> => {
  if (!projectId) {
    return;
  }
  await updateItemProps(projectId, { nextActionId: taskId });
};

export const completeTask = async (taskId: string): Promise<void> => {
  await enqueueItemWrite(taskId, async () =>
    db.transaction('rw', db.items, async () => {
      const task = await db.items.get(taskId);
      if (!task || task.type !== 'task') {
        return;
      }
      if (task.status === 'done') {
        return;
      }

      const now = Date.now();
      await db.items.update(taskId, {
        status: 'done',
        doneAt: now,
        rev: (task.rev ?? 1) + 1,
        updatedAt: now,
      });

      if (!task.recurrence) {
        return;
      }

      const nextDueDate = computeNextDueDateMs(task, now);
      const nextTask: Item = {
        id: uuidv4(),
        type: 'task',
        title: task.title,
        content: [makeParagraph('')],
        tags: Array.isArray(task.tags) ? [...task.tags] : [],
        favorite: false,
        linksTo: [],
        rev: 1,
        createdAt: now,
        updatedAt: now,
        status: 'todo',
        dueDate: nextDueDate,
        doneAt: undefined,
        recurrence: task.recurrence,
        projectId: task.projectId,
        originItemId: task.originItemId,
        originBlockId: task.originBlockId,
        originType: task.originType,
      };

      await db.items.put(nextTask);
    }),
  );
  notifyLocalChange();
};

export const getItem = async (id: string) => db.items.get(id);

export const getItemsByIds = async (ids: string[]) => {
  if (ids.length === 0) {
    return [];
  }
  const items = await db.items.bulkGet(ids);
  return items.filter((entry): entry is Item => Boolean(entry));
};

export const deleteItem = async (id: string) => {
  await enqueueItemWrite(id, async () =>
    db.transaction('rw', db.items, db.tombstones, async () => {
      const current = await db.items.get(id);
      if (!current) {
        return;
      }
      const tombstone = {
        id,
        deletedAt: Date.now(),
        rev: (current.rev ?? 1) + 1,
      };
      await db.tombstones.put(tombstone);
      await db.items.delete(id);
    }),
  );
  notifyLocalChange();
};

export const listItems = async (params?: ListParams) => {
  let query = db.items.orderBy('updatedAt').reverse();
  if (params?.limit) {
    query = query.limit(params.limit);
  }
  return query.toArray();
};

const sortByUpdatedDesc = (items: Item[]) => items.sort((a, b) => b.updatedAt - a.updatedAt);

export const listByType = async (type: ItemType) => {
  const items = await db.items.where('type').equals(type).toArray();
  return sortByUpdatedDesc(items);
};

const sortProjectTasks = (items: Item[]) =>
  items.sort((a, b) => {
    const statusA = a.status ?? 'todo';
    const statusB = b.status ?? 'todo';
    const rankA = statusA === 'done' ? 1 : 0;
    const rankB = statusB === 'done' ? 1 : 0;
    if (rankA !== rankB) {
      return rankA - rankB;
    }
    const dueA = typeof a.dueDate === 'number' ? a.dueDate : Number.POSITIVE_INFINITY;
    const dueB = typeof b.dueDate === 'number' ? b.dueDate : Number.POSITIVE_INFINITY;
    if (dueA !== dueB) {
      return dueA - dueB;
    }
    return b.updatedAt - a.updatedAt;
  });

export const listTasksByProject = async (projectId: string): Promise<Item[]> => {
  if (!projectId) {
    return [];
  }
  const items = await db.items.where('type').equals('task').toArray();
  const filtered = items.filter((item) => item.projectId === projectId);
  return sortProjectTasks(filtered);
};

export const listFavorites = async () => {
  const items = await db.items.toArray();
  return sortByUpdatedDesc(items.filter((item) => item.favorite));
};

export const listRecent = async (limit: number) => listItems({ limit });

export const listByTag = async (tag: string) => {
  const items = await db.items.where('tags').equals(tag).toArray();
  return sortByUpdatedDesc(items);
};

const sortByDueDateAsc = (items: Item[]) =>
  items.sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0));

export const listOpenTasks = async (): Promise<Item[]> => {
  const items = await db.items.where('type').equals('task').toArray();
  const openTasks = items.filter((item) => item.status !== 'done');
  return sortByUpdatedDesc(openTasks);
};

export const listTasksDueBetween = async (startMs: number, endMs: number): Promise<Item[]> => {
  const tasks = await listOpenTasks();
  const filtered = tasks.filter(
    (item) => typeof item.dueDate === 'number' && item.dueDate >= startMs && item.dueDate <= endMs,
  );
  return sortByDueDateAsc(filtered);
};

export const listOverdueTasks = async (nowMs: number): Promise<Item[]> => {
  const start = startOfDay(new Date(nowMs)).getTime();
  const tasks = await listOpenTasks();
  const filtered = tasks.filter(
    (item) => typeof item.dueDate === 'number' && item.dueDate < start,
  );
  return sortByDueDateAsc(filtered);
};

export const listTodayTasks = async (nowMs: number): Promise<Item[]> => {
  const start = startOfDay(new Date(nowMs)).getTime();
  const end = endOfDay(new Date(nowMs)).getTime();
  return listTasksDueBetween(start, end);
};

export const listNoDueDateTasks = async (): Promise<Item[]> => {
  const tasks = await listOpenTasks();
  return tasks.filter((item) => !item.dueDate);
};

export const listBacklinks = async (targetId: string): Promise<Item[]> => {
  if (!targetId) {
    return [];
  }
  const items = await db.items.where('linksTo').equals(targetId).toArray();
  return sortByUpdatedDesc(items);
};

export const listOutgoingLinks = async (item: Item): Promise<Item[]> => {
  const ids = item.linksTo ?? [];
  if (ids.length === 0) {
    return [];
  }
  const items = await db.items.bulkGet(ids);
  return sortByUpdatedDesc(items.filter((entry): entry is Item => Boolean(entry)));
};

export const countBacklinks = async (targetId: string): Promise<number> => {
  if (!targetId) {
    return 0;
  }
  return db.items.where('linksTo').equals(targetId).count();
};

export const searchByTitlePrefix = async (query: string, limit = 10) => {
  const normalized = query.trim();
  if (!normalized) {
    return db.items.orderBy('updatedAt').reverse().limit(limit).toArray();
  }
  return db.items.where('title').startsWithIgnoreCase(normalized).limit(limit).toArray();
};

export const getByTitleExact = async (title: string): Promise<Item | undefined> => {
  const normalized = title.trim();
  if (!normalized) {
    return undefined;
  }

  let matches: Item[] = [];
  try {
    matches = await db.items.where('title').equalsIgnoreCase(normalized).toArray();
  } catch (error) {
    const all = await db.items.where('title').equals(normalized).toArray();
    matches = all.length > 0 ? all : await db.items.toArray();
  }

  const normalizedLower = normalized.toLowerCase();
  const filtered = matches.filter((item) => item.title.toLowerCase() === normalizedLower);
  if (filtered.length === 0) {
    return undefined;
  }

  return filtered.sort((a, b) => b.updatedAt - a.updatedAt)[0];
};

export const findByTitleAll = async (title: string): Promise<Item[]> => {
  const normalized = title.trim();
  if (!normalized) {
    return [];
  }

  let matches: Item[] = [];
  try {
    matches = await db.items.where('title').equalsIgnoreCase(normalized).toArray();
  } catch (error) {
    const all = await db.items.toArray();
    matches = all.filter(
      (item) => item.title.trim().toLowerCase() === normalized.toLowerCase(),
    );
  }

  const normalizedLower = normalized.toLowerCase();
  return matches.filter((item) => item.title.trim().toLowerCase() === normalizedLower);
};

export const resolveTitleToId = async (
  title: string,
): Promise<
  | { status: 'ok'; id: string }
  | { status: 'ambiguous'; ids: string[] }
  | { status: 'not_found' }
> => {
  const matches = await findByTitleAll(title);
  if (matches.length === 0) {
    return { status: 'not_found' };
  }
  if (matches.length > 1) {
    return { status: 'ambiguous', ids: matches.map((item) => item.id) };
  }
  return { status: 'ok', id: matches[0].id };
};

export const recomputeLinksToFromBlocks = async (blocks: Block[]): Promise<string[]> => {
  const ids: string[] = [];
  const titles: string[] = [];

  for (const block of blocks) {
    const targets = extractLinkTargets(block.text ?? '');
    ids.push(...targets.ids);
    titles.push(...targets.titles);
  }

  const resolved = new Set<string>(ids.filter(Boolean));
  const uniqueTitles = Array.from(new Set(titles.map((title) => title.trim()).filter(Boolean)));
  for (const title of uniqueTitles) {
    const resolvedTitle = await resolveTitleToId(title);
    if (resolvedTitle.status === 'ok') {
      resolved.add(resolvedTitle.id);
    }
  }

  return Array.from(resolved);
};

export const wipeAll = async () => {
  await db.transaction('rw', db.items, db.tombstones, async () => {
    await db.items.clear();
    await db.tombstones.clear();
  });
  notifyLocalChange();
};


