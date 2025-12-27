import { v4 as uuidv4 } from 'uuid';

import { db } from './db';
import type { Block, BlockType, Item, ItemType, Recurrence } from './types';

export type BackupMeta = {
  appName: string;
  schemaVersion: number;
  exportedAt: number;
  itemCount: number;
};

export type BackupPayload = {
  meta: BackupMeta;
  items: Item[];
};

const APP_NAME = 'Mecflux Personal OS';
const SCHEMA_VERSION = 2;

const allowedTypes: ItemType[] = ['note', 'task', 'project', 'area'];
const allowedBlockTypes: BlockType[] = [
  'paragraph',
  'h1',
  'h2',
  'h3',
  'bullet',
  'numbered',
  'checklist',
  'callout',
  'code',
  'divider',
];

const makeParagraph = (): Block => ({
  id: uuidv4(),
  type: 'paragraph',
  text: '',
});

const normalizeBlock = (block: Partial<Block>): Block => {
  const type = allowedBlockTypes.includes(block.type as BlockType)
    ? (block.type as BlockType)
    : 'paragraph';
  return {
    id: typeof block.id === 'string' && block.id ? block.id : uuidv4(),
    type,
    text: typeof block.text === 'string' ? block.text : '',
    checked: typeof block.checked === 'boolean' ? block.checked : undefined,
    language: typeof block.language === 'string' ? block.language : undefined,
    taskId: typeof block.taskId === 'string' && block.taskId ? block.taskId : undefined,
  };
};

const normalizeRecurrence = (value: Item['recurrence']): Recurrence | undefined => {
  if (!value) {
    return undefined;
  }
  const freq = value.freq;
  if (freq !== 'daily' && freq !== 'weekly' && freq !== 'monthly') {
    return undefined;
  }
  const interval =
    typeof value.interval === 'number' && value.interval > 0
      ? Math.floor(value.interval)
      : 1;
  return { freq, interval };
};

const normalizeItem = (item: Item): Item => {
  const type = allowedTypes.includes(item.type) ? item.type : 'note';
  const content =
    Array.isArray(item.content) && item.content.length > 0
      ? item.content.map((block) => normalizeBlock(block))
      : [makeParagraph()];
  const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];
  const linksTo = Array.isArray(item.linksTo) ? item.linksTo.filter(Boolean) : [];
  const favorite = typeof item.favorite === 'boolean' ? item.favorite : false;

  const originType =
    item.originType && allowedTypes.includes(item.originType) ? item.originType : undefined;
  const normalized: Item = {
    id: item.id,
    type,
    title: item.title ?? 'Sem titulo',
    content,
    tags,
    favorite,
    linksTo,
    rev: typeof item.rev === 'number' && item.rev > 0 ? item.rev : 1,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    status: item.status,
    dueDate: item.dueDate,
    doneAt: item.doneAt,
    recurrence: normalizeRecurrence(item.recurrence),
    projectId: typeof item.projectId === 'string' ? item.projectId : undefined,
    originItemId: typeof item.originItemId === 'string' ? item.originItemId : undefined,
    originBlockId: typeof item.originBlockId === 'string' ? item.originBlockId : undefined,
    originType,
    nextActionId: typeof item.nextActionId === 'string' ? item.nextActionId : undefined,
  };

  if (type === 'task' && !normalized.status) {
    normalized.status = 'todo';
  }

  return normalized;
};

export const exportAll = async (): Promise<BackupPayload> => {
  const items = await db.items.toArray();
  const meta: BackupMeta = {
    appName: APP_NAME,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    itemCount: items.length,
  };
  return { meta, items };
};

export const downloadJson = (data: BackupPayload, filename: string) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const validateBackup = (payload: unknown) => {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, error: 'Arquivo invalido.' };
  }

  const maybe = payload as BackupPayload;
  if (!Array.isArray(maybe.items)) {
    return { ok: false, error: 'Backup sem lista de itens.' };
  }

  for (const item of maybe.items) {
    if (!item || typeof item !== 'object') {
      return { ok: false, error: 'Item invalido no backup.' };
    }
    if (
      typeof item.id !== 'string' ||
      typeof item.type !== 'string' ||
      typeof item.title !== 'string' ||
      typeof item.createdAt !== 'number' ||
      typeof item.updatedAt !== 'number' ||
      !Array.isArray(item.content)
    ) {
      return { ok: false, error: 'Estrutura de item invalida.' };
    }
  }

  return { ok: true };
};

export const importReplaceAll = async (payload: BackupPayload) => {
  const items = payload.items.map(normalizeItem);
  await db.transaction('rw', db.items, async () => {
    await db.items.clear();
    if (items.length > 0) {
      await db.items.bulkAdd(items);
    }
  });
  return { imported: items.length };
};

export const importMerge = async (payload: BackupPayload) => {
  const items = payload.items.map(normalizeItem);
  const ids = items.map((item) => item.id);
  const existing = await db.items.bulkGet(ids);
  const toAdd: Item[] = [];
  const toPut: Item[] = [];

  items.forEach((item, index) => {
    const current = existing[index];
    if (!current) {
      toAdd.push(item);
      return;
    }
    if (item.updatedAt > current.updatedAt) {
      toPut.push(item);
    }
  });

  await db.transaction('rw', db.items, async () => {
    if (toAdd.length > 0) {
      await db.items.bulkAdd(toAdd);
    }
    if (toPut.length > 0) {
      await db.items.bulkPut(toPut);
    }
  });

  return { added: toAdd.length, updated: toPut.length };
};

