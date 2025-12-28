import { v4 as uuidv4 } from 'uuid';

import { BUILD_TIME, GIT_SHA } from '../app/buildInfo';
import { getLastSyncAt } from '../sync/syncState';
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

export type VaultSyncMeta = {
  remoteGistId?: string;
  filename?: string;
  lastSyncAt?: number;
};

export type VaultAppMeta = {
  gitSha: string;
  buildTime: string;
};

export type VaultBackup = {
  schemaVersion: number;
  exportedAt: number;
  nodes: Node[];
  app: VaultAppMeta;
  sync?: VaultSyncMeta;
};

export type BackupValidationResult =
  | { ok: true; nodeCount: number }
  | { ok: false; error: string };

const APP_NAME = 'Mecflux Personal OS';
const SCHEMA_VERSION = 3;
const BACKUP_SCHEMA_VERSION = 1;
const SYNC_SETTINGS_KEY = 'mf_sync_settings';

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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const readSyncMeta = (): VaultSyncMeta | undefined => {
  if (typeof window === 'undefined') {
    return undefined;
  }

  let gistId: string | undefined;
  let filename: string | undefined;

  const raw = window.localStorage.getItem(SYNC_SETTINGS_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<{ gistId: string; filename: string }>;
      gistId = typeof parsed.gistId === 'string' ? parsed.gistId.trim() : undefined;
      filename = typeof parsed.filename === 'string' ? parsed.filename.trim() : undefined;
    } catch {
      gistId = undefined;
      filename = undefined;
    }
  }

  const lastSyncAt = getLastSyncAt();
  if (!gistId && !filename && !lastSyncAt) {
    return undefined;
  }

  return {
    remoteGistId: gistId || undefined,
    filename: filename || undefined,
    lastSyncAt,
  };
};

const formatDatePart = (value: number) => String(value).padStart(2, '0');

const buildExportFilename = (date = new Date()) => {
  const year = date.getFullYear();
  const month = formatDatePart(date.getMonth() + 1);
  const day = formatDatePart(date.getDate());
  const hours = formatDatePart(date.getHours());
  const minutes = formatDatePart(date.getMinutes());
  return `vault-backup-${year}${month}${day}-${hours}${minutes}.json`;
};

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

const validateNodeBasics = (nodes: unknown[], strictNodeType: boolean) => {
  for (let index = 0; index < nodes.length; index += 1) {
    const item = nodes[index];
    const label = `Item ${index + 1}`;
    if (!isRecord(item)) {
      return `${label} invalido.`;
    }

    if (typeof item.id !== 'string' || !item.id.trim()) {
      return `${label}: id invalido.`;
    }
    if (strictNodeType) {
      const nodeType = item.nodeType;
      if (nodeType !== 'note' && nodeType !== 'folder') {
        return `${label}: nodeType invalido.`;
      }
    }
    if (typeof item.title !== 'string') {
      return `${label}: titulo invalido.`;
    }
    if (typeof item.rev !== 'number' || !Number.isFinite(item.rev)) {
      return `${label}: rev invalido.`;
    }
    if (typeof item.updatedAt !== 'number' || !Number.isFinite(item.updatedAt)) {
      return `${label}: updatedAt invalido.`;
    }
  }
  return null;
};

const extractNodesFromPayload = (
  payload: unknown,
): { ok: true; nodes: Node[]; strictNodeType: boolean } | { ok: false; error: string } => {
  if (!isRecord(payload)) {
    return { ok: false, error: 'Arquivo invalido.' };
  }

  const rawNodes = Array.isArray(payload.nodes)
    ? payload.nodes
    : Array.isArray(payload.items)
      ? payload.items
      : null;
  if (!rawNodes) {
    return { ok: false, error: 'Backup sem lista de nodes.' };
  }

  const strictNodeType = Array.isArray(payload.nodes);
  const validationError = validateNodeBasics(rawNodes, strictNodeType);
  if (validationError) {
    return { ok: false, error: validationError };
  }

  return { ok: true, nodes: rawNodes as Node[], strictNodeType };
};

export const validateVaultBackup = (payload: unknown): BackupValidationResult => {
  const extracted = extractNodesFromPayload(payload);
  if (!extracted.ok) {
    return { ok: false, error: extracted.error };
  }
  return { ok: true, nodeCount: extracted.nodes.length };
};

export type ExportVaultResult = {
  filename: string;
  nodeCount: number;
};

export const exportVaultJson = async (): Promise<ExportVaultResult> => {
  const nodes = await db.items.toArray();
  const payload: VaultBackup = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: Date.now(),
    nodes,
    app: {
      gitSha: GIT_SHA,
      buildTime: BUILD_TIME,
    },
    sync: readSyncMeta(),
  };
  const filename = buildExportFilename();
  downloadJson(payload, filename);
  return { filename, nodeCount: nodes.length };
};

export type ImportVaultResult =
  | { mode: 'replace'; imported: number }
  | { mode: 'merge'; imported: number; added: number; updated: number };

export const importVaultJson = async (
  file: File,
  mode: 'replace' | 'merge',
): Promise<ImportVaultResult> => {
  let payload: unknown;
  try {
    const text = await file.text();
    payload = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Falha ao ler arquivo: ${message}`);
  }

  const extracted = extractNodesFromPayload(payload);
  if (!extracted.ok) {
    throw new Error(extracted.error);
  }

  const items = extracted.nodes.map((item) => normalizeNode(item));
  if (mode === 'replace') {
    await db.transaction('rw', db.items, db.tombstones, async () => {
      await db.items.clear();
      await db.tombstones.clear();
      if (items.length > 0) {
        await db.items.bulkAdd(items);
      }
    });
    return { mode: 'replace', imported: items.length };
  }

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
    if ((item.updatedAt ?? 0) > (current.updatedAt ?? 0)) {
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

  return { mode: 'merge', imported: items.length, added: toAdd.length, updated: toPut.length };
};

export const resetLocalData = async () => {
  await db.delete();
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('vault_expanded_folders');
    window.localStorage.removeItem('mf_sync_last_at');
    window.localStorage.removeItem('mf_sync_last_success_at');
  }
  await db.open();
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

export const downloadJson = (data: unknown, filename: string) => {
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

export const validateBackup = (payload: unknown) => validateVaultBackup(payload);

export const importReplaceAll = async (payload: BackupPayload) => {
  const items = payload.items.map((item) => normalizeNode(item));
  await db.transaction('rw', db.items, db.tombstones, async () => {
    await db.items.clear();
    await db.tombstones.clear();
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
