import { db } from '../data/db';
import type {
  AppMetaRow,
  InboxItemRow,
  IndexJobRow,
  Item,
  PropertySchema,
  SavedView,
  TaskIndexRow,
  Tombstone,
  UserStateRow,
} from '../data/types';
import type { Vault } from './vault';

const SYNC_EXCLUDED_META_KEYS = new Set(['taskIndexBuildCheckpoint']);

const filterSyncedMeta = (rows: AppMetaRow[]) =>
  rows.filter((row) => !SYNC_EXCLUDED_META_KEYS.has(row.key));

export const readLocalSnapshot = async (): Promise<{
  items: Item[];
  tombstones: Tombstone[];
  views: SavedView[];
  schemas: PropertySchema[];
  tasks_index: TaskIndexRow[];
  user_state: UserStateRow[];
  inbox_items: InboxItemRow[];
  app_meta: AppMetaRow[];
  index_jobs: IndexJobRow[];
}> => {
  const items = await db.items.toArray();
  const tombstones = await db.tombstones.toArray();
  const views = await db.views.toArray();
  const schemas = await db.schemas.toArray();
  const tasks_index = await db.tasks_index.toArray();
  const user_state = await db.user_state.toArray();
  const inbox_items = await db.inbox_items.toArray();
  const app_meta = filterSyncedMeta(await db.app_meta.toArray());
  const index_jobs = await db.index_jobs.toArray();
  return {
    items,
    tombstones,
    views,
    schemas,
    tasks_index,
    user_state,
    inbox_items,
    app_meta,
    index_jobs,
  };
};

export const applyMergedToLocal = async (merged: Vault): Promise<void> => {
  const tombstoneIds = new Set(merged.tombstones.map((entry) => entry.id));
  const items = merged.items.filter((item) => !tombstoneIds.has(item.id));
  const tombstones = merged.tombstones;
  const views = merged.views ?? [];
  const schemas = merged.schemas ?? [];
  const tasks_index = merged.tasks_index ?? [];
  const user_state = merged.user_state ?? [];
  const inbox_items = merged.inbox_items ?? [];
  const app_meta = filterSyncedMeta(merged.app_meta ?? []);
  const index_jobs = merged.index_jobs ?? [];

  await db.transaction(
    'rw',
    [
      db.items,
      db.tombstones,
      db.views,
      db.schemas,
      db.tasks_index,
      db.user_state,
      db.inbox_items,
      db.app_meta,
      db.index_jobs,
    ],
    async () => {
    if (tombstones.length > 0) {
      await db.tombstones.bulkPut(tombstones);
    }

    if (tombstoneIds.size > 0) {
      await db.items.bulkDelete(Array.from(tombstoneIds));
    }

    if (items.length > 0) {
      await db.items.bulkPut(items);
    }

    if (views.length > 0) {
      await db.views.bulkPut(views);
    }

    if (schemas.length > 0) {
      await db.schemas.bulkPut(schemas);
    }
    if (tasks_index.length > 0) {
      await db.tasks_index.bulkPut(tasks_index);
    }
    if (user_state.length > 0) {
      await db.user_state.bulkPut(user_state);
    }
    if (inbox_items.length > 0) {
      await db.inbox_items.bulkPut(inbox_items);
    }
    if (app_meta.length > 0) {
      await db.app_meta.bulkPut(app_meta);
    }
    if (index_jobs.length > 0) {
      await db.index_jobs.bulkPut(index_jobs);
    }
  });
};
