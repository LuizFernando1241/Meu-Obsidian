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

const resolveStatus = (block: Block, existingStatus?: TaskIndexStatus): TaskIndexStatus => {
  if (block.checked) {
    return 'DONE';
  }
  if (existingStatus && existingStatus !== 'DONE') {
    return existingStatus;
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

const resolvePriority = (block: Block, existingPriority?: TaskPriority): TaskPriority => {
  if (existingPriority) {
    return existingPriority;
  }
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

const resolveNextAction = (block: Block, existingNext?: boolean): boolean =>
  typeof existingNext === 'boolean' ? existingNext : Boolean(block.meta?.isNextAction);

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
  existingRows?: TaskIndexRow[],
): TaskIndexRow[] => {
  const content = Array.isArray(note.content) ? note.content : [];
  const space = context?.space ?? resolveSpace(note);
  const projectId = context?.projectId ?? resolveProjectId(note);
  const areaId = context?.areaId ?? resolveAreaId(note);
  const folderId = note.parentId ?? null;
  const createdAtFallback = note.createdAt ?? now;
  const existingById = new Map(
    (existingRows ?? []).map((row) => [row.taskId, row] as const),
  );

  return content
    .map((block, index) => ({ block, index }))
    .filter(({ block }) => isChecklist(block))
    .map(({ block, index }) => {
      const itemId = block.taskId ?? block.id;
      const taskId = buildTaskId(note.id, block.id, itemId);
      const existing = existingById.get(taskId);
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
        status: resolveStatus(block, existing?.status),
        priority: resolvePriority(block, existing?.priority),
        scheduledDay: normalizeDay(block.snoozedUntil ?? undefined),
        dueDay: normalizeDay(block.due ?? undefined),
        completedAt:
          typeof block.doneAt === 'number' && Number.isFinite(block.doneAt)
            ? block.doneAt
            : undefined,
        isNextAction: resolveNextAction(block, existing?.isNextAction),
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

  await db.transaction('rw', db.tasks_index, async () => {
    const existing = await db.tasks_index.where('noteId').equals(note.id).toArray();
    const mergedRows = isDeleted
      ? []
      : buildTaskIndexRows(note, now, DEFAULT_USER_ID, { projectId }, existing);
    const diff = diffTaskIndexRows(existing, mergedRows, now);

    if (diff.toDeleteTaskIds.length > 0) {
      await db.tasks_index.bulkDelete(diff.toDeleteTaskIds);
    }
    if (diff.toUpsert.length > 0) {
      await db.tasks_index.bulkPut(diff.toUpsert);
    }
  });
};

type TaskIndexPatch = Partial<Pick<TaskIndexRow, 'status' | 'priority' | 'isNextAction'>>;

const applyTaskPatch = (row: TaskIndexRow, patch: TaskIndexPatch, now: number) => {
  const next = { ...row, ...patch, updatedAt: now };
  const { updatedAt, sourceHash, ...hashBase } = next;
  return { ...next, sourceHash: buildTaskSourceHash(hashBase) };
};

const findTaskRow = async (noteId: string, blockId: string) =>
  db.tasks_index
    .where('noteId')
    .equals(noteId)
    .filter((row) => row.blockId === blockId)
    .first();

const updateTaskIndexRow = async (
  noteId: string,
  blockId: string,
  patch: TaskIndexPatch,
): Promise<void> => {
  const now = Date.now();
  await db.transaction('rw', db.tasks_index, async () => {
    const row = await findTaskRow(noteId, blockId);
    if (!row) {
      throw new Error('Tarefa nao encontrada.');
    }
    const updates: TaskIndexRow[] = [];
    if (patch.isNextAction && row.projectId) {
      const sameProject = await db.tasks_index.where('projectId').equals(row.projectId).toArray();
      sameProject.forEach((other) => {
        if (other.taskId !== row.taskId && other.isNextAction) {
          updates.push(applyTaskPatch(other, { isNextAction: false }, now));
        }
      });
    }
    updates.push(applyTaskPatch(row, patch, now));
    if (updates.length === 1) {
      await db.tasks_index.put(updates[0]);
    } else {
      await db.tasks_index.bulkPut(updates);
    }
  });
};

export const setTaskStatus = async (
  noteId: string,
  blockId: string,
  status: 'open' | 'doing' | 'waiting',
): Promise<void> => {
  const nextStatus: TaskIndexStatus =
    status === 'doing' ? 'DOING' : status === 'waiting' ? 'WAITING' : 'TODO';
  await updateTaskIndexRow(noteId, blockId, { status: nextStatus });
};

export const setTaskPriority = async (
  noteId: string,
  blockId: string,
  priority: 'P1' | 'P2' | 'P3' | null,
): Promise<void> => {
  const nextPriority: TaskPriority = priority ?? 'P4';
  await updateTaskIndexRow(noteId, blockId, { priority: nextPriority });
};

export const setTaskNextAction = async (
  noteId: string,
  blockId: string,
  isNextAction: boolean,
): Promise<void> => updateTaskIndexRow(noteId, blockId, { isNextAction });

export const removeTasksIndexForNoteId = async (noteId: string): Promise<void> => {
  await db.tasks_index.where('noteId').equals(noteId).delete();
};
