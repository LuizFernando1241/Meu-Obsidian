import { v4 as uuidv4 } from 'uuid';

import { db } from './db';
import type {
  Block,
  BlockType,
  LegacyItemType,
  LegacyTaskFields,
  Node,
  NodeType,
  Recurrence,
} from './types';

export type BackupMeta = {
  appName: string;
  schemaVersion: number;
  exportedAt: number;
  itemCount: number;
};

export type BackupPayload = {
  meta: BackupMeta;
  items: Node[];
};

const APP_NAME = 'Mecflux Personal OS';
const SCHEMA_VERSION = 3;

const allowedNodeTypes: NodeType[] = ['note', 'folder'];
const allowedLegacyTypes: LegacyItemType[] = ['note', 'task', 'project', 'area'];
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
    due: typeof block.due === 'string' ? block.due : null,
    doneAt: typeof block.doneAt === 'number' ? block.doneAt : null,
    priority: typeof block.priority === 'number' ? block.priority : null,
    tags: Array.isArray(block.tags) ? block.tags.filter(Boolean) : null,
    createdAt: typeof block.createdAt === 'number' ? block.createdAt : undefined,
    language: typeof block.language === 'string' ? block.language : undefined,
    taskId: typeof block.taskId === 'string' && block.taskId ? block.taskId : undefined,
  };
};

const getContentBlocks = (item: { content?: Block[] }) =>
  Array.isArray(item.content) ? item.content : [];

const normalizeRecurrence = (value: Recurrence | undefined): Recurrence | undefined => {
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

const resolveLegacyType = (item: Node & { type?: string }): LegacyItemType | undefined => {
  if (item.legacyType && allowedLegacyTypes.includes(item.legacyType)) {
    return item.legacyType;
  }
  if (item.type && allowedLegacyTypes.includes(item.type as LegacyItemType)) {
    return item.type as LegacyItemType;
  }
  return undefined;
};

const resolveNodeType = (item: Node & { type?: string }): NodeType => {
  if (item.nodeType && allowedNodeTypes.includes(item.nodeType)) {
    return item.nodeType;
  }
  const legacy = resolveLegacyType(item);
  if (legacy === 'project' || legacy === 'area') {
    return 'folder';
  }
  return 'note';
};

const normalizeNode = (item: Node & { type?: string }): Node => {
  const nodeType = resolveNodeType(item);
  const legacyType = resolveLegacyType(item);
  const tags = Array.isArray(item.tags) ? item.tags.filter(Boolean) : [];
  const linksTo = Array.isArray(item.linksTo) ? item.linksTo.filter(Boolean) : [];
  const favorite = typeof item.favorite === 'boolean' ? item.favorite : false;
  const props = item.props && typeof item.props === 'object' ? { ...item.props } : {};

  const createdAt =
    typeof item.createdAt === 'number' ? item.createdAt : Date.now();
  const updatedAt =
    typeof item.updatedAt === 'number' ? item.updatedAt : createdAt;

  const base = {
    id: item.id,
    nodeType,
    title: item.title ?? 'Sem titulo',
    parentId: typeof item.parentId === 'string' ? item.parentId : undefined,
    tags,
    favorite,
    linksTo,
    rev: typeof item.rev === 'number' && item.rev > 0 ? item.rev : 1,
    createdAt,
    updatedAt,
    props,
    legacyType,
  };

  if (legacyType === 'task') {
    const legacyTask: LegacyTaskFields = {
      status: (item as LegacyTaskFields).status,
      dueDate: (item as LegacyTaskFields).dueDate,
      doneAt: (item as LegacyTaskFields).doneAt,
      recurrence: normalizeRecurrence((item as LegacyTaskFields).recurrence),
      projectId: (item as LegacyTaskFields).projectId,
      originItemId: (item as LegacyTaskFields).originItemId,
      originBlockId: (item as LegacyTaskFields).originBlockId,
      originType: (item as LegacyTaskFields).originType,
    };
    props.legacyTask = legacyTask;
    if (!base.parentId && legacyTask.projectId) {
      base.parentId = legacyTask.projectId;
    }
  }

  if (legacyType === 'project') {
    props.legacyProject = {
      nextActionId: (item as { nextActionId?: string }).nextActionId,
    };
  }

  if (nodeType === 'folder') {
    const legacyContent = getContentBlocks(item as { content?: Block[] });
    if (legacyContent.length > 0) {
      props.legacyContent = legacyContent.map((block: Block) => normalizeBlock(block));
    }
    return base as Node;
  }

  const noteContent = getContentBlocks(item as { content?: Block[] });
  const content =
    noteContent.length > 0
      ? noteContent.map((block: Block) => normalizeBlock(block))
      : [makeParagraph()];

  if (legacyType === 'task') {
    const checklistText = base.title?.trim() || 'Tarefa';
    const first = content[0];
    const hasChecklist =
      first && first.type === 'checklist' && String(first.text ?? '').trim() === checklistText;
    if (!hasChecklist) {
      const checklistBlock: Block = {
        id: uuidv4(),
        type: 'checklist',
        text: checklistText,
        checked: (props.legacyTask as LegacyTaskFields | undefined)?.status === 'done',
      };
      content.unshift(checklistBlock);
    }
  }

  return {
    ...base,
    nodeType: 'note',
    content,
  } as Node;
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
    const nodeType = resolveNodeType(item as Node);
    if (!allowedNodeTypes.includes(nodeType)) {
      return { ok: false, error: 'Tipo de item invalido.' };
    }
    if (
      typeof (item as Node).id !== 'string' ||
      typeof (item as Node).title !== 'string' ||
      typeof (item as Node).createdAt !== 'number' ||
      typeof (item as Node).updatedAt !== 'number'
    ) {
      return { ok: false, error: 'Estrutura de item invalida.' };
    }
  }

  return { ok: true };
};

export const importReplaceAll = async (payload: BackupPayload) => {
  const items = payload.items.map((item) => normalizeNode(item));
  await db.transaction('rw', db.items, async () => {
    await db.items.clear();
    if (items.length > 0) {
      await db.items.bulkAdd(items);
    }
  });
  return { imported: items.length };
};

export const importMerge = async (payload: BackupPayload) => {
  const items = payload.items.map((item) => normalizeNode(item));
  const ids = items.map((item) => item.id);
  const existing = await db.items.bulkGet(ids);
  const toAdd: Node[] = [];
  const toPut: Node[] = [];

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
