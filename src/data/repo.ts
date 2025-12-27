import { v4 as uuidv4 } from 'uuid';

import { extractLinkTargets } from '../app/wikilinks';
import { db } from './db';
import { enqueueItemWrite } from './writeQueue';
import type {
  Block,
  FolderNode,
  LegacyItemType,
  Node,
  NodeType,
  NoteNode,
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

const defaultTitleByType: Record<NodeType, string> = {
  note: 'Nova nota',
  folder: 'Nova pasta',
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
  const note: NoteNode = {
    id: uuidv4(),
    nodeType: 'note',
    title: partial.title ?? defaultTitleByType.note,
    parentId: partial.parentId,
    content: ensureContent(partial.content),
    tags: partial.tags ?? [],
    favorite: partial.favorite ?? false,
    linksTo: partial.linksTo ?? [],
    rev: 1,
    createdAt: now,
    updatedAt: now,
    props: partial.props,
    legacyType: partial.legacyType,
  };

  await db.items.put(note);
  notifyLocalChange();
  return note;
};

export const createFolder = async (partial: CreateFolderInput): Promise<FolderNode> => {
  const now = Date.now();
  const folder: FolderNode = {
    id: uuidv4(),
    nodeType: 'folder',
    title: partial.title ?? defaultTitleByType.folder,
    parentId: partial.parentId,
    tags: partial.tags ?? [],
    favorite: partial.favorite ?? false,
    linksTo: partial.linksTo ?? [],
    rev: 1,
    createdAt: now,
    updatedAt: now,
    props: partial.props,
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

export const updateItemContent = async (id: string, patch: ContentPatch): Promise<Node> => {
  const next = await enqueueItemWrite(id, async () =>
    db.transaction('rw', db.items, async () => {
      const current = await db.items.get(id);
      if (!current) {
        throw new Error('Item nao encontrado');
      }
      if (current.nodeType !== 'note') {
        throw new Error('Item nao editavel');
      }

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
  notifyLocalChange();
  return next as Node;
};

export const updateItemProps = async (id: string, patch: PropsPatch): Promise<Node> => {
  const next = await enqueueItemWrite(id, async () =>
    db.transaction('rw', db.items, async () => {
      const current = await db.items.get(id);
      if (!current) {
        throw new Error('Item nao encontrado');
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
        update.props = patch.props;
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

export const moveNode = async (id: string, parentId?: string): Promise<Node> =>
  updateItemProps(id, { parentId });

export const updateChecklistBlock = async (
  noteId: string,
  blockId: string,
  patch: Partial<ChecklistBlock>,
): Promise<void> => {
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
      await db.items.put(nextItem);
    }),
  );
  notifyLocalChange();
};

export const toggleChecklist = async (
  noteId: string,
  blockId: string,
  checked: boolean,
): Promise<void> =>
  updateChecklistBlock(noteId, blockId, {
    checked,
    doneAt: checked ? Date.now() : null,
  });

export const setChecklistDue = async (
  noteId: string,
  blockId: string,
  due: string | null,
): Promise<void> => updateChecklistBlock(noteId, blockId, { due });

export const getItem = async (id: string) => db.items.get(id) as Promise<Node | undefined>;

export const getItemsByIds = async (ids: string[]) => {
  if (ids.length === 0) {
    return [];
  }
  const items = await db.items.bulkGet(ids);
  return items.filter((entry): entry is Node => Boolean(entry));
};

export const deleteNode = async (id: string) => {
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

const sortByUpdatedDesc = (items: Node[]) => items.sort((a, b) => b.updatedAt - a.updatedAt);

export const listByNodeType = async (nodeType: NodeType) => {
  const items = await db.items.where('nodeType').equals(nodeType).toArray();
  return sortByUpdatedDesc(items);
};

export const listChildren = async (parentId?: string) => {
  if (!parentId) {
    return db.items.filter((item) => !item.parentId).toArray();
  }
  return db.items.where('parentId').equals(parentId).toArray();
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

export const listBacklinks = async (targetId: string): Promise<Node[]> => {
  if (!targetId) {
    return [];
  }
  const items = await db.items.where('linksTo').equals(targetId).toArray();
  return sortByUpdatedDesc(items);
};

export const listOutgoingLinks = async (item: Node): Promise<Node[]> => {
  const ids = item.linksTo ?? [];
  if (ids.length === 0) {
    return [];
  }
  const items = await db.items.bulkGet(ids);
  return sortByUpdatedDesc(items.filter((entry): entry is Node => Boolean(entry)));
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
    return notes.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
  }
  const notes = await db.items.where('nodeType').equals('note').toArray();
  return notes
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
  const matches = notes.filter((item) => item.title.toLowerCase() === normalizedLower);
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
  return notes.filter((item) => item.title.trim().toLowerCase() === normalizedLower);
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

export const wipeAll = async () => {
  await db.transaction('rw', db.items, db.tombstones, async () => {
    await db.items.clear();
    await db.tombstones.clear();
  });
  notifyLocalChange();
};
