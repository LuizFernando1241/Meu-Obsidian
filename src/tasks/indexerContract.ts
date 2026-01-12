import type {
  Block,
  NoteNode,
  Space,
  TaskIndexRow,
  TaskIndexStatus,
  TaskPriority,
} from '../data/types';

export type IndexerBlockType = Block['type'];

export type ChecklistItem = {
  itemId: string;
  text: string;
  checked: boolean;
  dueDay?: string;
  snoozeUntilDay?: string;
  priority?: TaskPriority;
  status?: TaskIndexStatus;
};

export type NoteDoc = {
  noteId: string;
  folderId?: string | null;
  title: string;
  updatedAt: number;
  createdAt: number;
  tags: string[];
  props: Record<string, unknown>;
  blocks: Block[];
  path?: string;
};

export type ExtractedTask = {
  taskId: string;
  noteId: string;
  folderId: string | null;
  blockId: string;
  itemId: string;
  title: string;
  status: TaskIndexStatus;
  priority: TaskPriority;
  scheduledDay?: string;
  dueDay?: string;
  isNextAction: boolean;
  orderKey: number;
  estimateMin?: number;
  space: Space;
  projectId?: string;
  areaId?: string;
  createdAt: number;
};

export type TaskDiff = {
  toUpsert: TaskIndexRow[];
  toDeleteTaskIds: string[];
};

export type IndexerEvent =
  | { type: 'NOTE_SAVED'; noteId: string }
  | { type: 'NOTE_MOVED'; noteId: string; fromFolderId: string | null; toFolderId: string | null }
  | { type: 'NOTE_DELETED'; noteId: string }
  | { type: 'NOTE_RESTORED'; noteId: string }
  | { type: 'TAGS_CHANGED'; noteId: string }
  | { type: 'PROPS_CHANGED'; noteId: string }
  | { type: 'VAULT_REINDEX_REQUESTED' };

export type IndexerEventHandler = (event: IndexerEvent) => void;

export type IndexerEventBus = {
  emit: (event: IndexerEvent) => void;
  subscribe: (handler: IndexerEventHandler) => () => void;
};

export const createIndexerEventBus = (): IndexerEventBus => {
  const handlers = new Set<IndexerEventHandler>();
  return {
    emit: (event) => {
      handlers.forEach((handler) => handler(event));
    },
    subscribe: (handler) => {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
};

export type IndexerScheduler = {
  enqueue: (event: IndexerEvent) => void;
  flush: (noteId?: string) => Promise<void>;
  shutdown: () => void;
};

export type IndexerSchedulerOptions = {
  debounceMs?: number;
  onEvent: (event: IndexerEvent) => Promise<void>;
};

export const createIndexerScheduler = (
  options: IndexerSchedulerOptions,
): IndexerScheduler => {
  const debounceMs = options.debounceMs ?? 350;
  const pending = new Map<string, IndexerEvent>();
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  let chain: Promise<void> = Promise.resolve();

  const runEvent = (event: IndexerEvent) => {
    chain = chain.then(() => options.onEvent(event)).catch(() => undefined);
    return chain;
  };

  const flushNote = (noteId: string) => {
    const event = pending.get(noteId);
    if (!event) {
      return chain;
    }
    pending.delete(noteId);
    return runEvent(event);
  };

  const scheduleNote = (noteId: string) => {
    const currentTimer = timers.get(noteId);
    if (currentTimer) {
      clearTimeout(currentTimer);
    }
    const nextTimer = setTimeout(() => {
      timers.delete(noteId);
      void flushNote(noteId);
    }, debounceMs);
    timers.set(noteId, nextTimer);
  };

  return {
    enqueue: (event) => {
      if (event.type === 'VAULT_REINDEX_REQUESTED') {
        void runEvent(event);
        return;
      }
      pending.set(event.noteId, event);
      scheduleNote(event.noteId);
    },
    flush: async (noteId?: string) => {
      if (noteId) {
        const timer = timers.get(noteId);
        if (timer) {
          clearTimeout(timer);
          timers.delete(noteId);
        }
        await flushNote(noteId);
        return;
      }
      const noteIds = Array.from(pending.keys());
      noteIds.forEach((id) => {
        const timer = timers.get(id);
        if (timer) {
          clearTimeout(timer);
        }
        timers.delete(id);
      });
      for (const id of noteIds) {
        await flushNote(id);
      }
    },
    shutdown: () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
      pending.clear();
    },
  };
};

export const toNoteDoc = (note: NoteNode): NoteDoc => ({
  noteId: note.id,
  folderId: note.parentId ?? null,
  title: note.title ?? '',
  updatedAt: note.updatedAt ?? Date.now(),
  createdAt: note.createdAt ?? Date.now(),
  tags: Array.isArray(note.tags) ? note.tags : [],
  props: (note.props && typeof note.props === 'object' ? note.props : {}) as Record<
    string,
    unknown
  >,
  blocks: Array.isArray(note.content) ? note.content : [],
});

export const buildTaskId = (noteId: string, blockId: string, itemId: string) =>
  `${noteId}:${blockId}:${itemId}`;

const hashString = (value: string) => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

export const buildTaskSourceHash = (
  row: Omit<TaskIndexRow, 'updatedAt' | 'sourceHash'>,
) => hashString(JSON.stringify(row));

export const diffTaskIndexRows = (
  existing: TaskIndexRow[],
  next: TaskIndexRow[],
  now = Date.now(),
): TaskDiff => {
  const existingById = new Map(existing.map((row) => [row.taskId, row]));
  const nextById = new Map(next.map((row) => [row.taskId, row]));
  const toDeleteTaskIds: string[] = [];
  const toUpsert: TaskIndexRow[] = [];

  existingById.forEach((_row, taskId) => {
    if (!nextById.has(taskId)) {
      toDeleteTaskIds.push(taskId);
    }
  });

  next.forEach((row) => {
    const current = existingById.get(row.taskId);
    if (current && current.sourceHash === row.sourceHash) {
      return;
    }
    const createdAt = current?.createdAt ?? row.createdAt;
    toUpsert.push({ ...row, createdAt, updatedAt: now });
  });

  return { toUpsert, toDeleteTaskIds };
};
