import { db } from '../data/db';
import type { Node, NoteNode, PropertySchema } from '../data/types';
import { filterActiveNodes } from '../data/deleted';
import {
  buildTaskIndexRows,
  DEFAULT_TASK_USER_ID,
  resolveProjectIdFromCache,
} from './taskIndexStore';

export type RebuildCheckpoint = {
  processedCount: number;
  totalCount: number;
  lastProcessedNoteId?: string;
  mode?: 'rebuild' | 'repair';
};

type ProgressPayload = {
  processedCount: number;
  totalCount: number;
};

type RebuildOptions = {
  onProgress?: (payload: ProgressPayload) => void;
  mode?: 'rebuild' | 'repair';
};

const TASK_INDEX_JOB_ID = 'task_index_rebuild';
const META_NEEDS_BUILD = 'needsTaskIndexBuild';
const META_LAST_BUILD_AT = 'lastTaskIndexBuildAt';
const META_CHECKPOINT = 'taskIndexBuildCheckpoint';
const META_BUILD_MODE = 'taskIndexBuildMode';

const readMetaValue = async <T>(key: string): Promise<T | undefined> => {
  const row = await db.app_meta.get(key);
  return row?.value as T | undefined;
};

const writeMetaValue = async (key: string, value: unknown) => {
  await db.app_meta.put({
    key,
    value,
    updatedAt: Date.now(),
  });
};

const setJob = async (patch: {
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  progress: number;
  cursor?: unknown;
  error?: string;
}) => {
  await db.index_jobs.put({
    id: TASK_INDEX_JOB_ID,
    type: 'TASK_INDEX_REBUILD',
    status: patch.status,
    progress: patch.progress,
    cursor: patch.cursor,
    error: patch.error,
    updatedAt: Date.now(),
  });
};

const getNotesSorted = async (): Promise<{
  notes: NoteNode[];
  nodesById: Map<string, Node>;
  schemasById: Map<string, PropertySchema>;
}> => {
  const items = await db.items.toArray();
  const active = filterActiveNodes(items as Node[]);
  const notes = active.filter((node): node is NoteNode => node.nodeType === 'note');
  const schemas = await db.schemas.toArray();
  return {
    notes: [...notes].sort((a, b) => a.id.localeCompare(b.id)),
    nodesById: new Map(active.map((node) => [node.id, node])),
    schemasById: new Map(schemas.map((schema) => [schema.id, schema])),
  };
};

const resolveStartIndex = (notes: NoteNode[], checkpoint?: RebuildCheckpoint) => {
  if (!checkpoint) {
    return 0;
  }
  if (checkpoint.lastProcessedNoteId) {
    const idx = notes.findIndex((note) => note.id === checkpoint.lastProcessedNoteId);
    if (idx >= 0) {
      return idx + 1;
    }
  }
  if (checkpoint.processedCount > 0 && checkpoint.processedCount < notes.length) {
    return checkpoint.processedCount;
  }
  return 0;
};

export const maybeRebuildTaskIndex = async (
  options?: RebuildOptions,
): Promise<boolean> => {
  const meta = await db.app_meta.get(META_NEEDS_BUILD);
  if (!meta?.value) {
    return false;
  }
  await rebuildTaskIndexResumable(options);
  return true;
};

export const rebuildTaskIndexResumable = async (options?: RebuildOptions) => {
  const existingJob = await db.index_jobs.get(TASK_INDEX_JOB_ID);
  if (existingJob?.status === 'RUNNING') {
    return;
  }

  const buildMode =
    options?.mode ?? (await readMetaValue<'rebuild' | 'repair'>(META_BUILD_MODE)) ?? 'rebuild';
  const { notes, nodesById, schemasById } = await getNotesSorted();
  const totalCount = notes.length;
  const noteIds = new Set(notes.map((note) => note.id));
  const checkpoint = await readMetaValue<RebuildCheckpoint>(META_CHECKPOINT);
  const checkpointValid =
    checkpoint &&
    Number.isFinite(checkpoint.processedCount) &&
    checkpoint.processedCount >= 0 &&
    checkpoint.processedCount <= totalCount &&
    checkpoint.totalCount === totalCount;

  if (!checkpointValid) {
    await writeMetaValue(META_CHECKPOINT, {
      processedCount: 0,
      totalCount,
      mode: buildMode,
    } satisfies RebuildCheckpoint);
  }

  const startIndex = resolveStartIndex(
    notes,
    checkpointValid ? checkpoint : undefined,
  );
  const batchSize = 25;

  await setJob({
    status: 'RUNNING',
    progress: totalCount === 0 ? 1 : startIndex / totalCount,
    cursor: checkpointValid ? checkpoint : undefined,
  });

  if (startIndex === 0) {
    if (noteIds.size === 0) {
      await db.tasks_index.clear();
    } else {
      const orphanTaskIds: string[] = [];
      await db.tasks_index.toCollection().each((row) => {
        if (!noteIds.has(row.noteId)) {
          orphanTaskIds.push(row.taskId);
        }
      });
      if (orphanTaskIds.length > 0) {
        await db.tasks_index.bulkDelete(orphanTaskIds);
      }
    }
  }

  try {
    for (let i = startIndex; i < totalCount; i += batchSize) {
      const batch = notes.slice(i, i + batchSize);
      const now = Date.now();

      await db.transaction('rw', db.tasks_index, async () => {
        const batchNoteIds = batch.map((note) => note.id);
        const existing =
          batchNoteIds.length > 0
            ? await db.tasks_index.where('noteId').anyOf(batchNoteIds).toArray()
            : [];
        if (batchNoteIds.length > 0) {
          await db.tasks_index.where('noteId').anyOf(batchNoteIds).delete();
        }
        const rows = batch.flatMap((note) =>
          buildTaskIndexRows(note, now, DEFAULT_TASK_USER_ID, {
            projectId: resolveProjectIdFromCache(note, nodesById, schemasById),
          }, existing),
        );
        if (rows.length > 0) {
          await db.tasks_index.bulkPut(rows);
        }
      });

      const processedCount = Math.min(i + batchSize, totalCount);
      const nextCheckpoint: RebuildCheckpoint = {
        processedCount,
        totalCount,
        lastProcessedNoteId: batch[batch.length - 1]?.id,
        mode: buildMode,
      };

      await writeMetaValue(META_CHECKPOINT, nextCheckpoint);
      await setJob({
        status: 'RUNNING',
        progress: totalCount === 0 ? 1 : processedCount / totalCount,
        cursor: nextCheckpoint,
      });
      options?.onProgress?.({ processedCount, totalCount });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    await writeMetaValue(META_NEEDS_BUILD, false);
    await writeMetaValue(META_LAST_BUILD_AT, Date.now());
    await writeMetaValue(META_CHECKPOINT, null);
    await writeMetaValue(META_BUILD_MODE, 'rebuild');
    await setJob({ status: 'DONE', progress: 1, cursor: null });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await setJob({
      status: 'FAILED',
      progress: 0,
      cursor: checkpoint ?? null,
      error: message,
    });
    throw error;
  }
};
