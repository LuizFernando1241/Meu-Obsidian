import { v4 as uuidv4 } from 'uuid';

import { BUILD_TIME, GIT_SHA } from '../app/buildInfo';
import { getLastSyncAt } from '../sync/syncState';
import { db } from './db';
import { ensureDefaultSchema } from './repo';
import type {
  Block,
  BlockType,
  LegacyItemType,
  LegacyTaskFields,
  Node,
  NodeType,
  PropertyDef,
  PropertySchema,
  PropertyType,
  Recurrence,
  SavedView,
  SavedViewQuery,
  SavedViewSort,
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
  views?: SavedView[];
  schemas?: PropertySchema[];
  schema?: PropertySchema;
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
  views?: SavedView[];
  schemas?: PropertySchema[];
  schema?: PropertySchema;
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

const normalizeStringArray = (value: unknown): string[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const filtered = value.filter(
    (entry): entry is string =>
      typeof entry === 'string' && entry.trim().length > 0,
  );
  return filtered.length > 0 ? filtered : undefined;
};

const normalizeViewQuery = (value: unknown): SavedViewQuery => {
  if (!isRecord(value)) {
    return {};
  }
  const type = value.type;
  const due = value.due;
  const normalizedDue =
    isRecord(due) &&
    (typeof due.from === 'string' ||
      typeof due.to === 'string' ||
      typeof due.missing === 'boolean')
      ? {
          from: typeof due.from === 'string' ? due.from : undefined,
          to: typeof due.to === 'string' ? due.to : undefined,
          missing: typeof due.missing === 'boolean' ? due.missing : undefined,
        }
      : undefined;

  const updatedSinceDays =
    typeof value.updatedSinceDays === 'number' && Number.isFinite(value.updatedSinceDays)
      ? Math.max(0, Math.floor(value.updatedSinceDays))
      : undefined;

  return {
    text: typeof value.text === 'string' ? value.text : undefined,
    type: type === 'note' || type === 'folder' || type === 'any' ? type : undefined,
    rootId: typeof value.rootId === 'string' ? value.rootId : undefined,
    pathPrefix: typeof value.pathPrefix === 'string' ? value.pathPrefix : undefined,
    tags: normalizeStringArray(value.tags),
    status: normalizeStringArray(value.status),
    priority: normalizeStringArray(value.priority),
    favoritesOnly:
      typeof value.favoritesOnly === 'boolean' ? value.favoritesOnly : undefined,
    due: normalizedDue,
    updatedSinceDays,
  };
};

const normalizeViewSort = (value: unknown): SavedViewSort | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const by = value.by;
  const dir = value.dir;
  const validBy =
    by === 'updatedAt' ||
    by === 'title' ||
    by === 'type' ||
    by === 'path' ||
    by === 'status' ||
    by === 'due' ||
    by === 'priority';
  const validDir = dir === 'asc' || dir === 'desc';
  if (!validBy || !validDir) {
    return undefined;
  }
  return { by, dir };
};

type ViewTableColumn =
  | 'title'
  | 'type'
  | 'path'
  | 'status'
  | 'priority'
  | 'due'
  | 'updatedAt';

const VIEW_TABLE_COLUMNS = new Set<ViewTableColumn>([
  'title',
  'type',
  'path',
  'status',
  'priority',
  'due',
  'updatedAt',
]);

const isViewTableColumn = (value: string): value is ViewTableColumn =>
  VIEW_TABLE_COLUMNS.has(value as ViewTableColumn);

const normalizeViewTable = (value: unknown): SavedView['table'] | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const rawColumns = Array.isArray(value.columns)
    ? value.columns.filter((entry) => typeof entry === 'string')
    : [];
  const columns = rawColumns.filter(isViewTableColumn);
  const compact = typeof value.compact === 'boolean' ? value.compact : undefined;
  if (columns.length === 0 && compact === undefined) {
    return undefined;
  }
  return {
    columns: columns.length > 0 ? columns : undefined,
    compact,
  };
};

const normalizeViewKanban = (value: unknown): SavedView['kanban'] | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const rawColumns = Array.isArray(value.columns)
    ? value.columns.filter((entry) => typeof entry === 'string')
    : [];
  const columns = rawColumns.map((entry) => entry.trim()).filter(Boolean);
  const includeEmptyStatus =
    typeof value.includeEmptyStatus === 'boolean' ? value.includeEmptyStatus : undefined;
  if (columns.length === 0 && includeEmptyStatus === undefined) {
    return undefined;
  }
  return {
    columns: columns.length > 0 ? columns : [],
    includeEmptyStatus,
  };
};

const normalizeViewCalendar = (value: unknown): SavedView['calendar'] | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const dateField = value.dateField === 'due' ? 'due' : undefined;
  const rawWeekStartsOn = value.weekStartsOn;
  const weekStartsOn = rawWeekStartsOn === 0 || rawWeekStartsOn === 1 ? rawWeekStartsOn : undefined;
  const showUndated = typeof value.showUndated === 'boolean' ? value.showUndated : undefined;
  if (!dateField && weekStartsOn === undefined && showUndated === undefined) {
    return undefined;
  }
  return {
    dateField,
    weekStartsOn,
    showUndated,
  };
};

const normalizeView = (value: unknown, index: number): SavedView | null => {
  if (!isRecord(value)) {
    return null;
  }
  const id =
    typeof value.id === 'string' && value.id.trim() ? value.id : uuidv4();
  const name =
    typeof value.name === 'string' && value.name.trim()
      ? value.name.trim()
      : `Visao ${index + 1}`;
  const query = normalizeViewQuery(value.query);
  const sort = normalizeViewSort(value.sort);
  const displayMode =
    value.displayMode === 'list' ||
    value.displayMode === 'table' ||
    value.displayMode === 'kanban' ||
    value.displayMode === 'calendar'
      ? value.displayMode
      : undefined;
  const table = normalizeViewTable(value.table);
  const kanban = normalizeViewKanban(value.kanban);
  const calendar = normalizeViewCalendar(value.calendar);
  const order =
    typeof value.order === 'number' && Number.isFinite(value.order)
      ? value.order
      : undefined;
  const createdAt =
    typeof value.createdAt === 'number' && Number.isFinite(value.createdAt)
      ? value.createdAt
      : Date.now();
  const updatedAt =
    typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
      ? value.updatedAt
      : createdAt;

  return {
    id,
    name,
    query,
    sort,
    displayMode,
    table,
    kanban,
    calendar,
    order,
    createdAt,
    updatedAt,
  };
};

const allowedPropertyTypes: PropertyType[] = [
  'text',
  'number',
  'checkbox',
  'date',
  'select',
  'multi_select',
];

const normalizePropertyDef = (value: unknown, index: number): PropertyDef | null => {
  if (!isRecord(value)) {
    return null;
  }
  const key = typeof value.key === 'string' && value.key.trim() ? value.key.trim() : '';
  if (!key) {
    return null;
  }
  const name =
    typeof value.name === 'string' && value.name.trim()
      ? value.name.trim()
      : `Property ${index + 1}`;
  const type = value.type;
  const normalizedType = allowedPropertyTypes.includes(type as PropertyType)
    ? (type as PropertyType)
    : 'text';
  const options = normalizeStringArray(value.options);
  const indexed = typeof value.indexed === 'boolean' ? value.indexed : undefined;
  return {
    key,
    name,
    type: normalizedType,
    options,
    defaultValue: value.defaultValue,
    indexed,
  };
};

const normalizeSchemaRecord = (value: unknown, index: number): PropertySchema | null => {
  if (!isRecord(value)) {
    return null;
  }
  const rawId = typeof value.id === 'string' ? value.id.trim() : '';
  if (!rawId) {
    return null;
  }
  const name =
    typeof value.name === 'string' && value.name.trim()
      ? value.name.trim()
      : rawId === 'global'
        ? 'Global'
        : `Schema ${index + 1}`;
  const version =
    typeof value.version === 'number' && Number.isFinite(value.version)
      ? Math.max(1, Math.floor(value.version))
      : 1;
  const updatedAt =
    typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt)
      ? value.updatedAt
      : Date.now();
  const rawProperties = Array.isArray(value.properties) ? value.properties : [];
  const properties = rawProperties
    .map((prop, propIndex) => normalizePropertyDef(prop, propIndex))
    .filter((prop): prop is PropertyDef => Boolean(prop));
  return {
    id: rawId,
    name,
    version,
    properties,
    updatedAt,
  };
};

const normalizeSchemasFromPayload = (payload: unknown): PropertySchema[] => {
  if (!isRecord(payload)) {
    return [];
  }
  const rawSchemas = Array.isArray(payload.schemas)
    ? payload.schemas
    : isRecord(payload.schema)
      ? [payload.schema]
      : [];
  return rawSchemas
    .map((schema, index) => normalizeSchemaRecord(schema, index))
    .filter((schema): schema is PropertySchema => Boolean(schema));
};

const extractViewsFromPayload = (payload: unknown): SavedView[] => {
  if (!isRecord(payload)) {
    return [];
  }
  const rawViews = Array.isArray(payload.views) ? payload.views : [];
  return rawViews
    .map((view, index) => normalizeView(view, index))
    .filter((view): view is SavedView => Boolean(view));
};

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

const mapLegacyPriority = (
  value?: number | null,
): 'P1' | 'P2' | 'P3' | undefined => {
  if (value === 1) {
    return 'P1';
  }
  if (value === 2) {
    return 'P2';
  }
  if (value === 3) {
    return 'P3';
  }
  return undefined;
};

const normalizeBlock = (block: Partial<Block>): Block => {
  const type = allowedBlockTypes.includes(block.type as BlockType)
    ? (block.type as BlockType)
    : 'paragraph';
  const rawMeta = block.meta;
  const legacyPriority = typeof block.priority === 'number' ? block.priority : null;
  const meta = (() => {
    if (rawMeta && typeof rawMeta === 'object') {
      const next = {
        priority:
          (rawMeta as { priority?: unknown }).priority === 'P1' ||
          (rawMeta as { priority?: unknown }).priority === 'P2' ||
          (rawMeta as { priority?: unknown }).priority === 'P3'
            ? (rawMeta as { priority?: 'P1' | 'P2' | 'P3' }).priority
            : mapLegacyPriority(legacyPriority),
        status:
          (rawMeta as { status?: unknown }).status === 'open' ||
          (rawMeta as { status?: unknown }).status === 'doing' ||
          (rawMeta as { status?: unknown }).status === 'waiting'
            ? (rawMeta as { status?: 'open' | 'doing' | 'waiting' }).status
            : undefined,
        recurrence:
          (rawMeta as { recurrence?: unknown }).recurrence === 'weekly' ||
          (rawMeta as { recurrence?: unknown }).recurrence === 'monthly'
            ? (rawMeta as { recurrence?: 'weekly' | 'monthly' }).recurrence
            : undefined,
      };
      if (!next.priority && !next.status && !next.recurrence) {
        return undefined;
      }
      return next;
    }
    if (legacyPriority) {
      const priority = mapLegacyPriority(legacyPriority);
      return priority ? { priority } : undefined;
    }
    return undefined;
  })();
  return {
    id: typeof block.id === 'string' && block.id ? block.id : uuidv4(),
    type,
    text: typeof block.text === 'string' ? block.text : '',
    checked: typeof block.checked === 'boolean' ? block.checked : undefined,
    due: typeof block.due === 'string' ? block.due : null,
    snoozedUntil:
      typeof (block as { snoozedUntil?: unknown }).snoozedUntil === 'string'
        ? (block as { snoozedUntil?: string }).snoozedUntil
        : null,
    originalDue:
      typeof (block as { originalDue?: unknown }).originalDue === 'string'
        ? (block as { originalDue?: string }).originalDue
        : null,
    doneAt: typeof block.doneAt === 'number' ? block.doneAt : null,
    priority: typeof block.priority === 'number' ? block.priority : null,
    tags: Array.isArray(block.tags) ? block.tags.filter(Boolean) : null,
    createdAt: typeof block.createdAt === 'number' ? block.createdAt : undefined,
    language: typeof block.language === 'string' ? block.language : undefined,
    taskId: typeof block.taskId === 'string' && block.taskId ? block.taskId : undefined,
    collapsed:
      typeof (block as { collapsed?: unknown }).collapsed === 'boolean'
        ? (block as { collapsed?: boolean }).collapsed
        : undefined,
    meta,
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
    order:
      typeof (item as { order?: unknown }).order === 'number' &&
      Number.isFinite((item as { order?: unknown }).order)
        ? ((item as { order?: unknown }).order as number)
        : undefined,
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

export const buildVaultBackupPayload = async (): Promise<VaultBackup> => {
  const nodes = await db.items.toArray();
  const views = await db.views.toArray();
  const schemas = await db.schemas.toArray();
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: Date.now(),
    nodes,
    views,
    schemas,
    app: {
      gitSha: GIT_SHA,
      buildTime: BUILD_TIME,
    },
    sync: readSyncMeta(),
  };
};

export const exportVaultJson = async (): Promise<ExportVaultResult> => {
  const payload = await buildVaultBackupPayload();
  const filename = buildExportFilename();
  downloadJson(payload, filename);
  return { filename, nodeCount: payload.nodes.length };
};

export type ImportVaultResult =
  | { mode: 'replace'; imported: number }
  | { mode: 'merge'; imported: number; added: number; updated: number };

export const importVaultPayload = async (
  payload: unknown,
  mode: 'replace' | 'merge',
): Promise<ImportVaultResult> => {
  const extracted = extractNodesFromPayload(payload);
  if (!extracted.ok) {
    throw new Error(extracted.error);
  }
  const views = extractViewsFromPayload(payload);
  const schemas = normalizeSchemasFromPayload(payload);

  const items = extracted.nodes.map((item) => normalizeNode(item));
  if (mode === 'replace') {
    await db.transaction('rw', db.items, db.tombstones, db.views, db.schemas, async () => {
      await db.items.clear();
      await db.tombstones.clear();
      await db.views.clear();
      await db.schemas.clear();
      if (items.length > 0) {
        await db.items.bulkAdd(items);
      }
      if (views.length > 0) {
        await db.views.bulkAdd(views);
      }
      if (schemas.length > 0) {
        await db.schemas.bulkPut(schemas);
      }
    });
    if (schemas.length === 0 || !schemas.some((schema) => schema.id === 'global')) {
      await ensureDefaultSchema();
    }
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

  const viewIds = views.map((view) => view.id);
  const existingViews = viewIds.length > 0 ? await db.views.bulkGet(viewIds) : [];
  const viewsToAdd: SavedView[] = [];
  const viewsToPut: SavedView[] = [];

  views.forEach((view, index) => {
    const current = existingViews[index];
    if (!current) {
      viewsToAdd.push(view);
      return;
    }
    if ((view.updatedAt ?? 0) > (current.updatedAt ?? 0)) {
      viewsToPut.push(view);
    }
  });

  const schemaIds = schemas.map((schema) => schema.id);
  const existingSchemas = schemaIds.length > 0 ? await db.schemas.bulkGet(schemaIds) : [];
  const schemasToAdd: PropertySchema[] = [];
  const schemasToPut: PropertySchema[] = [];

  schemas.forEach((schema, index) => {
    const current = existingSchemas[index];
    if (!current) {
      schemasToAdd.push(schema);
      return;
    }
    if ((schema.updatedAt ?? 0) > (current.updatedAt ?? 0)) {
      schemasToPut.push(schema);
    }
  });

  await db.transaction('rw', db.items, db.views, db.schemas, async () => {
    if (toAdd.length > 0) {
      await db.items.bulkAdd(toAdd);
    }
    if (toPut.length > 0) {
      await db.items.bulkPut(toPut);
    }
    if (viewsToAdd.length > 0) {
      await db.views.bulkAdd(viewsToAdd);
    }
    if (viewsToPut.length > 0) {
      await db.views.bulkPut(viewsToPut);
    }
    if (schemasToAdd.length > 0) {
      await db.schemas.bulkAdd(schemasToAdd);
    }
    if (schemasToPut.length > 0) {
      await db.schemas.bulkPut(schemasToPut);
    }
  });
  await ensureDefaultSchema();

  return {
    mode: 'merge',
    imported: items.length,
    added: toAdd.length,
    updated: toPut.length,
  };
};

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
  return importVaultPayload(payload, mode);
};

export const resetLocalData = async () => {
  await db.delete();
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem('vault_expanded_folders');
    window.localStorage.removeItem('mf_sync_last_at');
    window.localStorage.removeItem('mf_sync_last_success_at');
    window.localStorage.removeItem('mf_sync_last_attempt_at');
    window.localStorage.removeItem('mf_auto_backup_enabled');
    window.localStorage.removeItem('mf_auto_backup_interval_hours');
    window.localStorage.removeItem('mf_auto_backup_retention');
    window.localStorage.removeItem('mf_auto_backup_last_at');
  }
  await db.open();
};

export const exportAll = async (): Promise<BackupPayload> => {
  const items = await db.items.toArray();
  const views = await db.views.toArray();
  const schemas = await db.schemas.toArray();
  const meta: BackupMeta = {
    appName: APP_NAME,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: Date.now(),
    itemCount: items.length,
  };
  return { meta, items, views, schemas };
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
  const views = extractViewsFromPayload(payload);
  const schemas = normalizeSchemasFromPayload(payload);
  await db.transaction('rw', db.items, db.tombstones, db.views, db.schemas, async () => {
    await db.items.clear();
    await db.tombstones.clear();
    await db.views.clear();
    await db.schemas.clear();
    if (items.length > 0) {
      await db.items.bulkAdd(items);
    }
    if (views.length > 0) {
      await db.views.bulkAdd(views);
    }
    if (schemas.length > 0) {
      await db.schemas.bulkPut(schemas);
    }
  });
  if (schemas.length === 0 || !schemas.some((schema) => schema.id === 'global')) {
    await ensureDefaultSchema();
  }
  return { imported: items.length };
};

export const importMerge = async (payload: BackupPayload) => {
  const items = payload.items.map((item) => normalizeNode(item));
  const views = extractViewsFromPayload(payload);
  const schemas = normalizeSchemasFromPayload(payload);
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

  const viewIds = views.map((view) => view.id);
  const existingViews = viewIds.length > 0 ? await db.views.bulkGet(viewIds) : [];
  const viewsToAdd: SavedView[] = [];
  const viewsToPut: SavedView[] = [];

  views.forEach((view, index) => {
    const current = existingViews[index];
    if (!current) {
      viewsToAdd.push(view);
      return;
    }
    if (view.updatedAt > current.updatedAt) {
      viewsToPut.push(view);
    }
  });

  const schemaIds = schemas.map((schema) => schema.id);
  const existingSchemas = schemaIds.length > 0 ? await db.schemas.bulkGet(schemaIds) : [];
  const schemasToAdd: PropertySchema[] = [];
  const schemasToPut: PropertySchema[] = [];

  schemas.forEach((schema, index) => {
    const current = existingSchemas[index];
    if (!current) {
      schemasToAdd.push(schema);
      return;
    }
    if (schema.updatedAt > (current.updatedAt ?? 0)) {
      schemasToPut.push(schema);
    }
  });

  await db.transaction('rw', db.items, db.views, db.schemas, async () => {
    if (toAdd.length > 0) {
      await db.items.bulkAdd(toAdd);
    }
    if (toPut.length > 0) {
      await db.items.bulkPut(toPut);
    }
    if (viewsToAdd.length > 0) {
      await db.views.bulkAdd(viewsToAdd);
    }
    if (viewsToPut.length > 0) {
      await db.views.bulkPut(viewsToPut);
    }
    if (schemasToAdd.length > 0) {
      await db.schemas.bulkAdd(schemasToAdd);
    }
    if (schemasToPut.length > 0) {
      await db.schemas.bulkPut(schemasToPut);
    }
  });
  await ensureDefaultSchema();

  return { added: toAdd.length, updated: toPut.length };
};
