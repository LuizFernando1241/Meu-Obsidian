import { db } from '../data/db';
import type {
  Block,
  Node,
  NoteNode,
  PropertySchema,
  Space,
  TaskIndexRow,
  TaskIndexStatus,
  TaskPriority,
} from '../data/types';
import { isValidISODate } from '../views/calendarDate';
import { buildTaskId, buildTaskSourceHash, diffTaskIndexRows } from './indexerContract';

export const DEFAULT_TASK_USER_ID = 'local';
const DEFAULT_USER_ID = DEFAULT_TASK_USER_ID;
const DEFAULT_SPACE: Space = 'PERSONAL';
const DEFAULT_PRIORITY: TaskPriority = 'P4';

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const normalizeTitle = (value: string) => normalizeText(value.trim());

const resolveSpace = (note: NoteNode): Space => {
  const props =
    note.props && typeof note.props === 'object'
      ? (note.props as Record<string, unknown>)
      : {};
  const raw = typeof props.space === 'string' ? props.space : '';
  if (raw === 'WORK' || raw === 'PERSONAL') {
    return raw;
  }
  return DEFAULT_SPACE;
};

const resolveProjectId = (note: NoteNode) => {
  const props =
    note.props && typeof note.props === 'object'
      ? (note.props as Record<string, unknown>)
      : {};
  return typeof props.projectId === 'string' ? props.projectId : undefined;
};

const resolveAreaId = (note: NoteNode) => {
  const props =
    note.props && typeof note.props === 'object'
      ? (note.props as Record<string, unknown>)
      : {};
  return typeof props.areaId === 'string' ? props.areaId : undefined;
};

const getSchemaIdFromProps = (props?: Record<string, unknown>) => {
  const raw = typeof props?.schemaId === 'string' ? props.schemaId.trim() : '';
  return raw ? raw : undefined;
};

const isProjectSchema = (schemaId?: string, schemaName?: string) => {
  const haystack = `${schemaId ?? ''} ${schemaName ?? ''}`.toLowerCase();
  return haystack.includes('project') || haystack.includes('projeto');
};

export const resolveProjectIdFromCache = (
  note: NoteNode,
  nodesById: Map<string, Node>,
  schemasById: Map<string, PropertySchema>,
) => {
  const explicit = resolveProjectId(note);
  if (explicit) {
    return explicit;
  }
  let currentId = note.parentId;
  while (currentId) {
    const node = nodesById.get(currentId);
    if (!node) {
      break;
    }
    if (node.nodeType === 'folder') {
      const schemaId = getSchemaIdFromProps(node.props as Record<string, unknown> | undefined);
      if (schemaId) {
        const schema = schemasById.get(schemaId);
        if (isProjectSchema(schemaId, schema?.name)) {
          return node.id;
        }
      }
    }
    currentId = node.parentId;
  }
  return undefined;
};

const resolveProjectIdFromDb = async (note: NoteNode) => {
  const explicit = resolveProjectId(note);
  if (explicit) {
    return explicit;
  }
  let currentId = note.parentId;
  while (currentId) {
    const node = (await db.items.get(currentId)) as Node | undefined;
    if (!node) {
      break;
    }
    if (node.nodeType === 'folder') {
      const schemaId = getSchemaIdFromProps(node.props as Record<string, unknown> | undefined);
      if (schemaId) {
        const schema = (await db.schemas.get(schemaId)) as PropertySchema | undefined;
        if (isProjectSchema(schemaId, schema?.name)) {
          return node.id;
        }
      }
    }
    currentId = node.parentId;
  }
  return undefined;
};

export type TaskIndexContext = {
  space?: Space;
  projectId?: string;
  areaId?: string;
};

const resolveTitle = (block: Block) => {
  const text = (block.text ?? '').trim();
  return text || 'Checklist';
};

const resolveStatus = (block: Block): TaskIndexStatus => {
  if (block.checked) {
    return 'DONE';
  }
  const status = block.meta?.status;
  if (status === 'doing') {
    return 'DOING';
  }
  if (status === 'waiting') {
    return 'WAITING';
  }
  return 'TODO';
};

const resolvePriority = (block: Block): TaskPriority => {
  const priority = block.meta?.priority;
  if (priority === 'P1' || priority === 'P2' || priority === 'P3') {
    return priority;
  }
  if (block.priority === 1) {
    return 'P1';
  }
  if (block.priority === 2) {
    return 'P2';
  }
  if (block.priority === 3) {
    return 'P3';
  }
  return DEFAULT_PRIORITY;
};

const normalizeDay = (value?: string | null) => {
  if (!value || typeof value !== 'string') {
    return undefined;
  }
  return isValidISODate(value) ? value : undefined;
};

const isChecklist = (block: Block) => block.type === 'checklist';

export const buildTaskIndexRows = (
  note: NoteNode,
  now = Date.now(),
  userId = DEFAULT_USER_ID,
  context?: TaskIndexContext,
): TaskIndexRow[] => {
  const content = Array.isArray(note.content) ? note.content : [];
  const space = context?.space ?? resolveSpace(note);
  const projectId = context?.projectId ?? resolveProjectId(note);
  const areaId = context?.areaId ?? resolveAreaId(note);
  const folderId = note.parentId ?? null;
  const createdAtFallback = note.createdAt ?? now;

  return content
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => isChecklist(block))
    .map(({ block, index }) => {
      const itemId = block.taskId ?? block.id;
      const taskId = buildTaskId(note.id, block.id, itemId);
      const title = resolveTitle(block);
      const baseRow: Omit<TaskIndexRow, 'updatedAt' | 'sourceHash'> = {
        taskId,
        userId,
        space,
        noteId: note.id,
        folderId,
        blockId: block.id,
        itemId,
        title,
        titleNorm: normalizeTitle(title),
        status: resolveStatus(block),
        priority: resolvePriority(block),
        scheduledDay: normalizeDay(block.snoozedUntil ?? undefined),
        dueDay: normalizeDay(block.due ?? undefined),
        completedAt:
          typeof block.doneAt === 'number' && Number.isFinite(block.doneAt)
            ? block.doneAt
            : undefined,
        isNextAction: Boolean(block.meta?.isNextAction),
        orderKey: index,
        estimateMin: undefined,
        projectId,
        areaId,
        createdAt:
          typeof block.createdAt === 'number' && Number.isFinite(block.createdAt)
            ? block.createdAt
            : createdAtFallback,
      };
      return {
        ...baseRow,
        updatedAt: now,
        sourceHash: buildTaskSourceHash(baseRow),
      };
    });
};

export const syncTasksIndexForNote = async (
  note: NoteNode,
  now = Date.now(),
): Promise<void> => {
  const props =
    note.props && typeof note.props === 'object'
      ? (note.props as Record<string, unknown>)
      : {};
  const isDeleted = typeof props.deletedAt === 'number' && Number.isFinite(props.deletedAt);
  const projectId = isDeleted ? undefined : await resolveProjectIdFromDb(note);
  const rows = isDeleted ? [] : buildTaskIndexRows(note, now, DEFAULT_USER_ID, { projectId });

  await db.transaction('rw', db.tasks_index, async () => {
    const existing = await db.tasks_index.where('noteId').equals(note.id).toArray();
    const diff = diffTaskIndexRows(existing, rows, now);

    if (diff.toDeleteTaskIds.length > 0) {
      await db.tasks_index.bulkDelete(diff.toDeleteTaskIds);
    }
    if (diff.toUpsert.length > 0) {
      await db.tasks_index.bulkPut(diff.toUpsert);
    }
  });
};

export const removeTasksIndexForNoteId = async (noteId: string): Promise<void> => {
  await db.tasks_index.where('noteId').equals(noteId).delete();
};
