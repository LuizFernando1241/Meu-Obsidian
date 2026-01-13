import { v4 as uuidv4 } from 'uuid';

import { extractLinkTargets } from '../app/wikilinks';
import { getNextRecurringDue } from '../tasks/date';
import { emitIndexerEvent } from '../tasks/indexerRuntime';
import { filterActiveNodes } from './deleted';
import { db } from './db';
import { normalizeProps } from './propsNormalize';
import { getEffectiveSchema } from './schemaResolve';
import { buildDefaultSchema } from './schemaDefaults';
import { enqueueItemWrite } from './writeQueue';
import { cloneBlocksWithNewIds } from '../editor/markdownToBlocks';
import { sortNodes } from '../vault/sortNodes';
import { sortViews } from './sortViews';
import type {
  Block,
  FolderNode,
  LegacyItemType,
  Node,
  NodeType,
  NoteNode,
  NoteSnapshot,
  PropertySchema,
  SavedView,
} from './types';

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

export const emitLocalChange = () => {
  notifyLocalChange();
};

export const getGlobalSchema = async (): Promise<PropertySchema | undefined> =>
  db.schemas.get('global') as Promise<PropertySchema | undefined>;

const normalizeSchema = (schema: PropertySchema, now = Date.now()): PropertySchema => {
  const trimmedName =
    typeof schema.name === 'string' && schema.name.trim()
      ? schema.name.trim()
      : schema.id === 'global'
        ? 'Global'
        : 'Schema';
  return {
    ...schema,
    id: schema.id === 'global' ? 'global' : schema.id,
    name: trimmedName,
    version: typeof schema.version === 'number' && schema.version > 0 ? schema.version : 1,
    updatedAt:
      typeof schema.updatedAt === 'number' && Number.isFinite(schema.updatedAt)
        ? schema.updatedAt
        : now,
  };
};

export const listSchemas = async (): Promise<PropertySchema[]> =>
  db.schemas.orderBy('updatedAt').reverse().toArray();

export const getSchemaById = async (id: string): Promise<PropertySchema | undefined> =>
  db.schemas.get(id) as Promise<PropertySchema | undefined>;

export const upsertSchema = async (schema: PropertySchema): Promise<PropertySchema> => {
  const now = Date.now();
  const next = normalizeSchema(schema, now);
  await db.schemas.put(next);
  void emitIndexerEventsForSchema(next.id).catch(() => undefined);
  notifyLocalChange();
  return next;
};

export const deleteSchema = async (id: string): Promise<void> => {
  if (id === 'global') {
    throw new Error('Schema global nao pode ser removido.');
  }
  await db.schemas.delete(id);
  void emitIndexerEventsForSchema(id).catch(() => undefined);
  notifyLocalChange();
};

export const upsertGlobalSchema = async (schema: PropertySchema): Promise<PropertySchema> =>
  upsertSchema({ ...schema, id: 'global', name: schema.name ?? 'Global' });

export const ensureDefaultSchema = async (): Promise<PropertySchema> => {
  const existing = await getGlobalSchema();
  if (existing) {
    if (!existing.name || !existing.name.trim()) {
      return upsertSchema({ ...existing, name: 'Global', updatedAt: Date.now() });
    }
    return existing;
  }
  const schema = buildDefaultSchema(Date.now());
  return upsertSchema(schema);
};

const makeParagraph = (text: string): Block => ({
  id: uuidv4(),
  type: 'paragraph',
  text,
});

const ensureContent = (content?: Block[]) => {
  if (Array.isArray(content) && content.length > 0) {
    return content;
  }
  return [makeParagraph('')];
};

const getFolderTemplateBlocks = async (parentId?: string): Promise<Block[] | undefined> => {
  if (!parentId) {
    return undefined;
  }
  const parent = await db.items.get(parentId);
  if (!parent || parent.nodeType !== 'folder') {
    return undefined;
  }
  const props =
    parent.props && typeof parent.props === 'object'
      ? (parent.props as Record<string, unknown>)
      : {};
  const templateBlocks = props.templateBlocks;
  if (!Array.isArray(templateBlocks) || templateBlocks.length === 0) {
    return undefined;
  }
  return cloneBlocksWithNewIds(templateBlocks as Block[]);
};

const defaultTitleByType: Record<NodeType, string> = {
  note: 'Nova nota',
  folder: 'Nova pasta',
};

const normalizeOrder = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const getNextOrderValue = async (parentId?: string): Promise<number> => {
  const rawItems = parentId
    ? await db.items.where('parentId').equals(parentId).toArray()
    : await db.items.filter((item) => !item.parentId).toArray();
  const items = filterActiveNodes(rawItems as Node[]);
  const maxOrder = items.reduce((max, item) => {
    const order = normalizeOrder(item.order);
    return order !== undefined && order > max ? order : max;
  }, -1);
  return maxOrder + 1;
};

const getNextViewOrderValue = async (): Promise<number> => {
  const views = await db.views.toArray();
  const maxOrder = views.reduce((max, view) => {
    const order = normalizeOrder(view.order);
    return order !== undefined && order > max ? order : max;
  }, -1);
  return maxOrder + 1;
};

type CreateNoteInput = {
  title?: string;
  parentId?: string;
  content?: Block[];
  tags?: string[];
  favorite?: boolean;
  linksTo?: string[];
  props?: Record<string, unknown>;
  legacyType?: LegacyItemType;
};

type CreateFolderInput = {
  title?: string;
  parentId?: string;
  tags?: string[];
  favorite?: boolean;
  linksTo?: string[];
  props?: Record<string, unknown>;
  legacyType?: LegacyItemType;
};

export const createNote = async (partial: CreateNoteInput): Promise<NoteNode> => {
  const now = Date.now();
  const order = await getNextOrderValue(partial.parentId);
  const schema = partial.parentId
    ? await getEffectiveSchema(partial.parentId)
    : await ensureDefaultSchema();
  const normalizedProps = normalizeProps(partial.props ?? {}, schema, {
    applyDefaults: true,
  }).props;
  const templateBlocks = await getFolderTemplateBlocks(partial.parentId);
  const resolvedContent =
    Array.isArray(partial.content) && partial.content.length > 0
      ? partial.content
      : templateBlocks;
  const note: NoteNode = {
    id: uuidv4(),
    nodeType: 'note',
    title: partial.title ?? defaultTitleByType.note,
    parentId: partial.parentId,
    order,
    content: ensureContent(resolvedContent),
    tags: partial.tags ?? [],
    favorite: partial.favorite ?? false,
    linksTo: partial.linksTo ?? [],
    rev: 1,
    createdAt: now,
    updatedAt: now,
    props: Object.keys(normalizedProps).length > 0 ? normalizedProps : undefined,
    legacyType: partial.legacyType,
  };

  await db.items.put(note);
  emitIndexerEvent({ type: 'NOTE_SAVED', noteId: note.id });
  notifyLocalChange();
  return note;
};

export const createFolder = async (partial: CreateFolderInput): Promise<FolderNode> => {
  const now = Date.now();
  const order = await getNextOrderValue(partial.parentId);
  const schema = await ensureDefaultSchema();
  const normalizedProps = normalizeProps(partial.props ?? {}, schema, {
    applyDefaults: true,
  }).props;
  const folder: FolderNode = {
    id: uuidv4(),
    nodeType: 'folder',
    title: partial.title ?? defaultTitleByType.folder,
    parentId: partial.parentId,
    order,
    tags: partial.tags ?? [],
    favorite: partial.favorite ?? false,
    linksTo: partial.linksTo ?? [],
    rev: 1,
    createdAt: now,
    updatedAt: now,
    props: Object.keys(normalizedProps).length > 0 ? normalizedProps : undefined,
    legacyType: partial.legacyType,
  };

  await db.items.put(folder);
  notifyLocalChange();
  return folder;
};

type ContentPatch = {
  title?: string;
  content?: Block[];
  linksTo?: string[];
};

type PropsPatch = {
  tags?: string[];
  favorite?: boolean;
  parentId?: string;
  props?: Record<string, unknown>;
  linksTo?: string[];
};

type ChecklistBlock = Block & { type: 'checklist' };

const hasOwn = <T extends object>(obj: T, key: keyof T) =>
  Object.prototype.hasOwnProperty.call(obj, key);

const mergeChecklistMeta = (
  current: ChecklistBlock['meta'] | undefined,
  patch?: Partial<NonNullable<ChecklistBlock['meta']>>,
) => {
  const next: ChecklistBlock['meta'] = { ...(current ?? {}) };
  Object.entries(patch ?? {}).forEach(([key, value]) => {
    if (
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '')
    ) {
      delete (next as Record<string, unknown>)[key];
      return;
    }
    (next as Record<string, unknown>)[key] = value;
  });
  return Object.keys(next).length > 0 ? next : undefined;
};

const cloneBlockForSnapshot = (block: Block): Block => ({
  ...block,
  tags: Array.isArray(block.tags) ? [...block.tags] : block.tags ?? null,
  meta: block.meta ? { ...block.meta } : undefined,
});

const clonePropsForSnapshot = (props?: Record<string, unknown>) => {
  if (!props || typeof props !== 'object') {
    return undefined;
  }
  try {
    return JSON.parse(JSON.stringify(props)) as Record<string, unknown>;
  } catch {
    return { ...props };
  }
};

const saveSnapshot = async (note: NoteNode) => {
  const snapshot: NoteSnapshot = {
    id: uuidv4(),
    nodeId: note.id,
    title: note.title ?? 'Sem titulo',
    content: (note.content ?? []).map(cloneBlockForSnapshot),
    props: clonePropsForSnapshot(note.props),
    updatedAt: note.updatedAt ?? Date.now(),
    createdAt: Date.now(),
  };
  await db.snapshots.put(snapshot);
  const all = await db.snapshots.where('nodeId').equals(note.id).toArray();
  if (all.length <= 5) {
    return;
  }
  const sorted = all.sort((a, b) => b.createdAt - a.createdAt);
  const toDelete = sorted.slice(5).map((entry) => entry.id);
  if (toDelete.length > 0) {
    await db.snapshots.bulkDelete(toDelete);
  }
};

export const updateItemContent = async (id: string, patch: ContentPatch): Promise<Node> => {
  const next = await enqueueItemWrite(id, async () =>
    db.transaction('rw', db.items, db.snapshots, async () => {
      const current = await db.items.get(id);
      if (!current) {
        throw new Error('Item nao encontrado');
      }
      if (current.nodeType !== 'note') {
        throw new Error('Item nao editavel');
      }

      await saveSnapshot(current as NoteNode);

      const update: Partial<NoteNode> = {
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

      const nextItem: NoteNode = { ...current, ...update };
      await db.items.put(nextItem);
      return nextItem as Node;
    }),
  );
  if (next.nodeType === 'note') {
    emitIndexerEvent({ type: 'NOTE_SAVED', noteId: next.id });
  }
  notifyLocalChange();
  return next as Node;
};

export const updateItemProps = async (id: string, patch: PropsPatch): Promise<Node> => {
  const schema = patch.props ? await getEffectiveSchema(id) : undefined;
  const normalizedProps = patch.props
    ? normalizeProps(patch.props, schema, { applyDefaults: false }).props
    : undefined;
  const nextProps =
    normalizedProps && Object.keys(normalizedProps).length > 0 ? normalizedProps : undefined;
  const next = await enqueueItemWrite(id, async () =>
    db.transaction('rw', db.items, db.snapshots, async () => {
      const current = await db.items.get(id);
      if (!current) {
        throw new Error('Item nao encontrado');
      }

      if (current.nodeType === 'note' && hasOwn(patch, 'props')) {
        await saveSnapshot(current as NoteNode);
      }

      const update: Partial<Node> = {
        rev: (current.rev ?? 1) + 1,
        updatedAt: Date.now(),
      };

      if (hasOwn(patch, 'tags') && patch.tags !== undefined) {
        update.tags = patch.tags;
      }
      if (hasOwn(patch, 'favorite') && patch.favorite !== undefined) {
        update.favorite = patch.favorite;
      }
      if (hasOwn(patch, 'parentId')) {
        update.parentId = patch.parentId;
      }
      if (hasOwn(patch, 'props') && patch.props !== undefined) {
        update.props = nextProps;
      }
      if (hasOwn(patch, 'linksTo') && patch.linksTo !== undefined) {
        update.linksTo = patch.linksTo;
      }

      await db.items.update(id, update);
      const nextItem = await db.items.get(id);
      if (!nextItem) {
        throw new Error('Item nao encontrado');
      }
      return nextItem as Node;
    }),
  );
  if (next.nodeType === 'note') {
    emitIndexerEvent({ type: 'PROPS_CHANGED', noteId: next.id });
  } else if (next.nodeType === 'folder' && hasOwn(patch, 'props')) {
    void emitIndexerEventsForFolder(next.id).catch(() => undefined);
  }
  notifyLocalChange();
  return next as Node;
};

export const renameNode = async (id: string, title: string): Promise<Node> => {
  const next = await enqueueItemWrite(id, async () =>
    db.transaction('rw', db.items, async () => {
      const current = await db.items.get(id);
      if (!current) {
        throw new Error('Item nao encontrado');
      }

      await db.items.update(id, {
        title,
        rev: (current.rev ?? 1) + 1,
        updatedAt: Date.now(),
      });

      const nextItem = await db.items.get(id);
      if (!nextItem) {
        throw new Error('Item nao encontrado');
      }
      return nextItem as Node;
    }),
  );
  notifyLocalChange();
  return next as Node;
};

export const moveNode = async (id: string, parentId?: string): Promise<Node> => {
  let fromParentId: string | null | undefined;
  const next = await enqueueItemWrite(id, async () =>
    db.transaction('rw', db.items, async () => {
      const current = await db.items.get(id);
      if (!current) {
        throw new Error('Item nao encontrado');
      }
      fromParentId = current.parentId ?? null;
      const order = await getNextOrderValue(parentId);
      await db.items.update(id, {
        parentId,
        order,
        rev: (current.rev ?? 1) + 1,
        updatedAt: Date.now(),
      });
      const nextItem = await db.items.get(id);
      if (!nextItem) {
        throw new Error('Item nao encontrado');
      }
      return nextItem as Node;
    }),
  );
  if (next.nodeType === 'note') {
    emitIndexerEvent({
      type: 'NOTE_MOVED',
      noteId: next.id,
      fromFolderId: fromParentId ?? null,
      toFolderId: next.parentId ?? null,
    });
  } else if (next.nodeType === 'folder') {
    void emitIndexerEventsForFolder(next.id).catch(() => undefined);
  }
  notifyLocalChange();
  return next as Node;
};

export const reorderNodesInParent = async (
  parentId: string | undefined,
  orderedIds: string[],
): Promise<void> => {
  if (orderedIds.length === 0) {
    return;
  }
  const now = Date.now();
  await db.transaction('rw', db.items, async () => {
    const currentItems = await db.items.bulkGet(orderedIds);
    const updates: Node[] = [];
    orderedIds.forEach((_id, index) => {
      const current = currentItems[index];
      if (!current) {
        return;
      }
      const currentOrder = normalizeOrder(current.order);
      const sameParent = (current.parentId ?? undefined) === (parentId ?? undefined);
      if (currentOrder === index && sameParent) {
        return;
      }
      updates.push({
        ...(current as Node),
        parentId,
        order: index,
        rev: (current.rev ?? 1) + 1,
        updatedAt: now,
      });
    });
    if (updates.length > 0) {
      await db.items.bulkPut(updates);
    }
  });
  notifyLocalChange();
};

export const updateChecklistBlock = async (
  noteId: string,
  blockId: string,
  patch: Partial<ChecklistBlock>,
): Promise<void> => {
  let updatedItemId: string | null = null;
  await enqueueItemWrite(noteId, async () =>
    db.transaction('rw', db.items, async () => {
      const current = await db.items.get(noteId);
      if (!current) {
        throw new Error('Item nao encontrado');
      }
      if (current.nodeType !== 'note') {
        throw new Error('Item nao editavel');
      }

      const content = Array.isArray(current.content) ? current.content : [];
      const index = content.findIndex((block) => block.id === blockId);
      if (index === -1) {
        throw new Error('Checklist nao encontrada');
      }
      const target = content[index];
      if (target.type !== 'checklist') {
        throw new Error('Bloco nao e checklist');
      }

      const nextContent = [...content];
      nextContent[index] = { ...target, ...patch, type: 'checklist' };

      const nextItem: NoteNode = {
        ...current,
        content: nextContent,
        rev: (current.rev ?? 1) + 1,
        updatedAt: Date.now(),
      };
      updatedItemId = nextItem.id;
      await db.items.put(nextItem);
    }),
  );
  if (updatedItemId) {
    emitIndexerEvent({ type: 'NOTE_SAVED', noteId: updatedItemId });
  }
  notifyLocalChange();
};

export const appendNoteBlock = async (
  noteId: string,
  block: Block,
): Promise<Node> => {
  const current = await db.items.get(noteId);
  if (!current) {
    throw new Error('Item nao encontrado');
  }
  if (current.nodeType !== 'note') {
    throw new Error('Item nao editavel');
  }
  const content = Array.isArray(current.content) ? current.content : [];
  const nextContent = [...content, block];
  const linksTo = await recomputeLinksToFromBlocks(nextContent);
  return updateItemContent(noteId, { content: nextContent, linksTo });
};

export const updateChecklistMeta = async (
  noteId: string,
  blockId: string,
  patch: Partial<ChecklistBlock['meta']>,
): Promise<void> => {
  let updatedItemId: string | null = null;
  await enqueueItemWrite(noteId, async () =>
    db.transaction('rw', db.items, async () => {
      const current = await db.items.get(noteId);
      if (!current) {
        throw new Error('Item nao encontrado');
      }
      if (current.nodeType !== 'note') {
        throw new Error('Item nao editavel');
      }

      const content = Array.isArray(current.content) ? current.content : [];
      const index = content.findIndex((block) => block.id === blockId);
      if (index === -1) {
        throw new Error('Checklist nao encontrada');
      }
      const target = content[index];
      if (target.type !== 'checklist') {
        throw new Error('Bloco nao e checklist');
      }

      const nextContent = [...content];
      nextContent[index] = {
        ...target,
        meta: mergeChecklistMeta(target.meta, patch),
        type: 'checklist',
      };

      const nextItem: NoteNode = {
        ...current,
        content: nextContent,
        rev: (current.rev ?? 1) + 1,
        updatedAt: Date.now(),
      };
      updatedItemId = nextItem.id;
      await db.items.put(nextItem);
    }),
  );
  if (updatedItemId) {
    emitIndexerEvent({ type: 'NOTE_SAVED', noteId: updatedItemId });
  }
  notifyLocalChange();
};

export const toggleChecklist = async (
  noteId: string,
  blockId: string,
  checked: boolean,
): Promise<void> => {
  let updatedItemId: string | null = null;
  await enqueueItemWrite(noteId, async () =>
    db.transaction('rw', db.items, async () => {
      const current = await db.items.get(noteId);
      if (!current) {
        throw new Error('Item nao encontrado');
      }
      if (current.nodeType !== 'note') {
        throw new Error('Item nao editavel');
      }

      const content = Array.isArray(current.content) ? current.content : [];
      const index = content.findIndex((block) => block.id === blockId);
      if (index === -1) {
        throw new Error('Checklist nao encontrada');
      }
      const target = content[index];
      if (target.type !== 'checklist') {
        throw new Error('Bloco nao e checklist');
      }

      const wasChecked = target.checked ?? false;
      const nextContent = [...content];
      nextContent[index] = {
        ...target,
        type: 'checklist',
        checked,
        doneAt: checked ? Date.now() : null,
      };

      const recurrence = target.meta?.recurrence;
      if (checked && !wasChecked && recurrence) {
        const nextDue = getNextRecurringDue(target.due ?? null, recurrence);
        const nextMeta = mergeChecklistMeta(target.meta, { status: 'open' });
        const nextBlock: ChecklistBlock = {
          id: uuidv4(),
          type: 'checklist',
          text: target.text ?? '',
          checked: false,
          due: nextDue,
          doneAt: null,
          createdAt: Date.now(),
          meta: nextMeta,
        };
        nextContent.splice(index + 1, 0, nextBlock);
      }

      const nextItem: NoteNode = {
        ...current,
        content: nextContent,
        rev: (current.rev ?? 1) + 1,
        updatedAt: Date.now(),
      };
      updatedItemId = nextItem.id;
      await db.items.put(nextItem);
    }),
  );
  if (updatedItemId) {
    emitIndexerEvent({ type: 'NOTE_SAVED', noteId: updatedItemId });
  }
  notifyLocalChange();
};

export const setChecklistDue = async (
  noteId: string,
  blockId: string,
  due: string | null,
): Promise<void> => updateChecklistBlock(noteId, blockId, { due });

export const setChecklistSnooze = async (
  noteId: string,
  blockId: string,
  snoozedUntil: string | null,
): Promise<void> => {
  let updatedItemId: string | null = null;
  await enqueueItemWrite(noteId, async () =>
    db.transaction('rw', db.items, async () => {
      const current = await db.items.get(noteId);
      if (!current) {
        throw new Error('Item nao encontrado');
      }
      if (current.nodeType !== 'note') {
        throw new Error('Item nao editavel');
      }

      const content = Array.isArray(current.content) ? current.content : [];
      const index = content.findIndex((block) => block.id === blockId);
      if (index === -1) {
        throw new Error('Checklist nao encontrada');
      }
      const target = content[index];
      if (target.type !== 'checklist') {
        throw new Error('Bloco nao e checklist');
      }

      const nextContent = [...content];
      const nextBlock: ChecklistBlock = {
        ...target,
        type: 'checklist',
        snoozedUntil: snoozedUntil ?? null,
      };
      if (!target.originalDue && snoozedUntil && target.due) {
        nextBlock.originalDue = target.due;
      }
      nextContent[index] = nextBlock;

      const nextItem: NoteNode = {
        ...current,
        content: nextContent,
        rev: (current.rev ?? 1) + 1,
        updatedAt: Date.now(),
      };
      updatedItemId = nextItem.id;
      await db.items.put(nextItem);
    }),
  );
  if (updatedItemId) {
    emitIndexerEvent({ type: 'NOTE_SAVED', noteId: updatedItemId });
  }
  notifyLocalChange();
};

export const clearChecklistSnooze = async (
  noteId: string,
  blockId: string,
): Promise<void> => setChecklistSnooze(noteId, blockId, null);

export const getItem = async (id: string) => db.items.get(id) as Promise<Node | undefined>;

export const getItemsByIds = async (ids: string[]) => {
  if (ids.length === 0) {
    return [];
  }
  const items = await db.items.bulkGet(ids);
  return filterActiveNodes(items.filter((entry): entry is Node => Boolean(entry)));
};

export const deleteNode = async (id: string) => {
  await softDeleteNode(id);
};

export const softDeleteNode = async (id: string) => {
  let updatedItemId: string | null = null;
  await enqueueItemWrite(id, async () =>
    db.transaction('rw', db.items, db.snapshots, async () => {
      const current = await db.items.get(id);
      if (!current) {
        return;
      }
      if (current.nodeType === 'note') {
        await saveSnapshot(current as NoteNode);
      }
      const props =
        current.props && typeof current.props === 'object' ? { ...current.props } : {};
      props.deletedAt = Date.now();
      await db.items.update(id, {
        props,
        rev: (current.rev ?? 1) + 1,
        updatedAt: Date.now(),
      });
      const nextItem = await db.items.get(id);
      if (nextItem && nextItem.nodeType === 'note') {
        updatedItemId = nextItem.id;
      }
    }),
  );
  if (updatedItemId) {
    emitIndexerEvent({ type: 'NOTE_DELETED', noteId: updatedItemId });
  }
  notifyLocalChange();
};

export const restoreNode = async (id: string) => {
  let updatedItemId: string | null = null;
  await enqueueItemWrite(id, async () =>
    db.transaction('rw', db.items, async () => {
      const current = await db.items.get(id);
      if (!current) {
        return;
      }
      const props =
        current.props && typeof current.props === 'object' ? { ...current.props } : {};
      delete props.deletedAt;
      await db.items.update(id, {
        props,
        rev: (current.rev ?? 1) + 1,
        updatedAt: Date.now(),
      });
      const nextItem = await db.items.get(id);
      if (nextItem && nextItem.nodeType === 'note') {
        updatedItemId = nextItem.id;
      }
    }),
  );
  if (updatedItemId) {
    emitIndexerEvent({ type: 'NOTE_RESTORED', noteId: updatedItemId });
  }
  notifyLocalChange();
};

export const deleteNodePermanently = async (id: string) => {
  await enqueueItemWrite(id, async () =>
    db.transaction(
      'rw',
      [db.items, db.tombstones, db.snapshots, db.tasks_index],
      async () => {
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
      await db.snapshots.where('nodeId').equals(id).delete();
      if (current.nodeType === 'note') {
        await db.tasks_index.where('noteId').equals(id).delete();
      }
      },
    ),
  );
  notifyLocalChange();
};

export const listSnapshots = async (nodeId: string): Promise<NoteSnapshot[]> => {
  const snapshots = await db.snapshots.where('nodeId').equals(nodeId).toArray();
  return snapshots.sort((a, b) => b.createdAt - a.createdAt);
};

export const restoreSnapshot = async (snapshotId: string): Promise<Node | undefined> => {
  const snapshot = await db.snapshots.get(snapshotId);
  if (!snapshot) {
    return undefined;
  }
  const nodeId = snapshot.nodeId;
  const next = await enqueueItemWrite(nodeId, async () =>
    db.transaction('rw', db.items, db.snapshots, async () => {
      const current = await db.items.get(nodeId);
      if (!current) {
        throw new Error('Item nao encontrado');
      }
      if (current.nodeType !== 'note') {
        throw new Error('Item nao editavel');
      }
      await saveSnapshot(current as NoteNode);
      const linksTo = await recomputeLinksToFromBlocks(snapshot.content ?? []);
      const nextItem: NoteNode = {
        ...current,
        title: snapshot.title,
        content: snapshot.content ?? [],
        props: snapshot.props ?? {},
        linksTo,
        rev: (current.rev ?? 1) + 1,
        updatedAt: Date.now(),
      };
      await db.items.put(nextItem);
      return nextItem as Node;
    }),
  );
  if (next?.nodeType === 'note') {
    emitIndexerEvent({ type: 'NOTE_SAVED', noteId: next.id });
  }
  notifyLocalChange();
  return next;
};

export const listItems = async (params?: ListParams) => {
  let query = db.items.orderBy('updatedAt').reverse();
  if (params?.limit) {
    query = query.limit(params.limit);
  }
  const items = await query.toArray();
  return filterActiveNodes(items as Node[]);
};

const sortByUpdatedDesc = (items: Node[]) => items.sort((a, b) => b.updatedAt - a.updatedAt);

export const listByNodeType = async (nodeType: NodeType) => {
  const items = await db.items.where('nodeType').equals(nodeType).toArray();
  return sortByUpdatedDesc(filterActiveNodes(items as Node[]));
};

export const listChildren = async (parentId?: string) => {
  if (!parentId) {
    const items = await db.items.filter((item) => !item.parentId).toArray();
    return sortNodes(filterActiveNodes(items as Node[]));
  }
  const items = await db.items.where('parentId').equals(parentId).toArray();
  return sortNodes(filterActiveNodes(items as Node[]));
};

export const listFavorites = async () => {
  const items = await db.items.toArray();
  return sortByUpdatedDesc(
    filterActiveNodes(items as Node[]).filter((item) => item.favorite),
  );
};

export const listRecent = async (limit: number) => listItems({ limit });

export const listByTag = async (tag: string) => {
  const items = await db.items.where('tags').equals(tag).toArray();
  return sortByUpdatedDesc(filterActiveNodes(items as Node[]));
};

export const listBacklinks = async (targetId: string): Promise<Node[]> => {
  if (!targetId) {
    return [];
  }
  const items = await db.items.where('linksTo').equals(targetId).toArray();
  return sortByUpdatedDesc(filterActiveNodes(items as Node[]));
};

export const listOutgoingLinks = async (item: Node): Promise<Node[]> => {
  const ids = item.linksTo ?? [];
  if (ids.length === 0) {
    return [];
  }
  const items = await db.items.bulkGet(ids);
  return sortByUpdatedDesc(
    filterActiveNodes(items.filter((entry): entry is Node => Boolean(entry))),
  );
};

export const countBacklinks = async (targetId: string): Promise<number> => {
  if (!targetId) {
    return 0;
  }
  return db.items.where('linksTo').equals(targetId).count();
};

export const searchByTitlePrefix = async (query: string, limit = 10) => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    const notes = await db.items.where('nodeType').equals('note').toArray();
    return filterActiveNodes(notes as Node[])
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }
  const notes = await db.items.where('nodeType').equals('note').toArray();
  return filterActiveNodes(notes as Node[])
    .filter((item) => item.title.toLowerCase().startsWith(normalized))
    .slice(0, limit);
};

export const getByTitleExact = async (title: string): Promise<Node | undefined> => {
  const normalized = title.trim();
  if (!normalized) {
    return undefined;
  }

  const notes = await db.items.where('nodeType').equals('note').toArray();
  const normalizedLower = normalized.toLowerCase();
  const matches = filterActiveNodes(notes as Node[]).filter(
    (item) => item.title.toLowerCase() === normalizedLower,
  );
  if (matches.length === 0) {
    return undefined;
  }
  return matches.sort((a, b) => b.updatedAt - a.updatedAt)[0];
};

export const findByTitleAll = async (title: string): Promise<Node[]> => {
  const normalized = title.trim();
  if (!normalized) {
    return [];
  }

  const notes = await db.items.where('nodeType').equals('note').toArray();
  const normalizedLower = normalized.toLowerCase();
  return filterActiveNodes(notes as Node[]).filter(
    (item) => item.title.trim().toLowerCase() === normalizedLower,
  );
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
  const uniqueTitles = Array.from(new Set(titles.map((entry) => entry.trim()).filter(Boolean)));
  for (const title of uniqueTitles) {
    const resolvedTitle = await resolveTitleToId(title);
    if (resolvedTitle.status === 'ok') {
      resolved.add(resolvedTitle.id);
    }
  }

  return Array.from(resolved);
};

const collectDescendantNoteIdsFromMap = (
  folderId: string,
  byParent: Map<string, Node[]>,
): string[] => {
  const noteIds: string[] = [];
  const stack: string[] = [folderId];
  while (stack.length > 0) {
    const currentId = stack.pop();
    if (!currentId) {
      continue;
    }
    const children = byParent.get(currentId) ?? [];
    children.forEach((child) => {
      if (child.nodeType === 'note') {
        noteIds.push(child.id);
        return;
      }
      if (child.nodeType === 'folder') {
        stack.push(child.id);
      }
    });
  }
  return noteIds;
};

const collectDescendantNoteIds = async (folderId: string): Promise<string[]> => {
  const items = await db.items.toArray();
  const active = filterActiveNodes(items as Node[]);
  const byParent = new Map<string, Node[]>();
  active.forEach((item) => {
    const parentId = item.parentId ?? '';
    const list = byParent.get(parentId) ?? [];
    list.push(item);
    byParent.set(parentId, list);
  });

  return collectDescendantNoteIdsFromMap(folderId, byParent);
};

const emitIndexerEventsForFolder = async (folderId: string) => {
  const noteIds = await collectDescendantNoteIds(folderId);
  noteIds.forEach((noteId) => {
    emitIndexerEvent({ type: 'NOTE_SAVED', noteId });
  });
};

const emitIndexerEventsForSchema = async (schemaId: string) => {
  const items = await db.items.toArray();
  const active = filterActiveNodes(items as Node[]);
  const byParent = new Map<string, Node[]>();
  active.forEach((item) => {
    const parentId = item.parentId ?? '';
    const list = byParent.get(parentId) ?? [];
    list.push(item);
    byParent.set(parentId, list);
  });

  const folders = active.filter((item) => {
    if (item.nodeType !== 'folder') {
      return false;
    }
    const props = item.props as Record<string, unknown> | undefined;
    return typeof props?.schemaId === 'string' && props.schemaId === schemaId;
  });

  if (folders.length === 0) {
    return;
  }

  const noteIds = new Set<string>();
  folders.forEach((folder) => {
    collectDescendantNoteIdsFromMap(folder.id, byParent).forEach((noteId) =>
      noteIds.add(noteId),
    );
  });

  noteIds.forEach((noteId) => {
    emitIndexerEvent({ type: 'PROPS_CHANGED', noteId });
  });
};

export const wipeAll = async () => {
  await db.transaction(
    'rw',
    [
      db.items,
      db.tombstones,
      db.snapshots,
      db.schemas,
      db.tasks_index,
      db.user_state,
      db.inbox_items,
      db.app_meta,
      db.index_jobs,
    ],
    async () => {
    await db.items.clear();
    await db.tombstones.clear();
    await db.snapshots.clear();
    await db.schemas.clear();
    await db.tasks_index.clear();
    await db.user_state.clear();
    await db.inbox_items.clear();
    await db.app_meta.clear();
    await db.index_jobs.clear();
  });
  notifyLocalChange();
};

export const listViews = async (): Promise<SavedView[]> =>
  sortViews(await db.views.toArray());

export const getView = async (id: string): Promise<SavedView | undefined> =>
  db.views.get(id) as Promise<SavedView | undefined>;

export const upsertView = async (view: SavedView): Promise<SavedView> => {
  const now = Date.now();
  const existing = await db.views.get(view.id);
  const createdAt =
    typeof view.createdAt === 'number' && Number.isFinite(view.createdAt)
      ? view.createdAt
      : existing?.createdAt ?? now;
  const updatedAt =
    typeof view.updatedAt === 'number' && Number.isFinite(view.updatedAt)
      ? view.updatedAt
      : now;
  const order =
    normalizeOrder(view.order) ??
    normalizeOrder(existing?.order) ??
    (await getNextViewOrderValue());
  const next: SavedView = {
    ...view,
    createdAt,
    updatedAt,
    order,
  };

  await db.views.put(next);
  notifyLocalChange();
  return next;
};

export const reorderViews = async (orderedIds: string[]): Promise<void> => {
  if (orderedIds.length === 0) {
    return;
  }
  const now = Date.now();
  await db.transaction('rw', db.views, async () => {
    const currentViews = await db.views.bulkGet(orderedIds);
    const updates: SavedView[] = [];
    orderedIds.forEach((_id, index) => {
      const current = currentViews[index];
      if (!current) {
        return;
      }
      const currentOrder = normalizeOrder(current.order);
      if (currentOrder === index) {
        return;
      }
      updates.push({
        ...current,
        order: index,
        updatedAt: now,
      });
    });
    if (updates.length > 0) {
      await db.views.bulkPut(updates);
    }
  });
  notifyLocalChange();
};

export const deleteView = async (id: string): Promise<void> => {
  await db.views.delete(id);
  notifyLocalChange();
};
