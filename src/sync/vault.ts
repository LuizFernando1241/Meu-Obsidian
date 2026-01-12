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

export type Vault = {
  schema: 1;
  lastWriteAt: number;
  items: Item[];
  tombstones: Tombstone[];
  views: SavedView[];
  schemas?: PropertySchema[];
  tasks_index?: TaskIndexRow[];
  user_state?: UserStateRow[];
  inbox_items?: InboxItemRow[];
  app_meta?: AppMetaRow[];
  index_jobs?: IndexJobRow[];
};

export const defaultVault = (): Vault => ({
  schema: 1,
  lastWriteAt: Date.now(),
  items: [],
  tombstones: [],
  views: [],
  schemas: [],
  tasks_index: [],
  user_state: [],
  inbox_items: [],
  app_meta: [],
  index_jobs: [],
});

export const parseVault = (text: string): Vault => {
  if (!text || !text.trim()) {
    return defaultVault();
  }

  try {
    const parsed = JSON.parse(text) as Partial<Vault> & {
      schemaDef?: PropertySchema;
      schemas?: PropertySchema[];
    };
    const items = Array.isArray(parsed.items) ? (parsed.items as Item[]) : [];
    const tombstones = Array.isArray(parsed.tombstones)
      ? (parsed.tombstones as Tombstone[])
      : [];
    const views = Array.isArray(parsed.views) ? (parsed.views as SavedView[]) : [];
    const tasks_index = Array.isArray(parsed.tasks_index)
      ? (parsed.tasks_index as TaskIndexRow[])
      : [];
    const user_state = Array.isArray(parsed.user_state)
      ? (parsed.user_state as UserStateRow[])
      : [];
    const inbox_items = Array.isArray(parsed.inbox_items)
      ? (parsed.inbox_items as InboxItemRow[])
      : [];
    const app_meta = Array.isArray(parsed.app_meta)
      ? (parsed.app_meta as AppMetaRow[])
      : [];
    const index_jobs = Array.isArray(parsed.index_jobs)
      ? (parsed.index_jobs as IndexJobRow[])
      : [];
    const schemaDef =
      parsed.schemaDef && typeof parsed.schemaDef === 'object'
        ? (parsed.schemaDef as PropertySchema)
        : undefined;
    const schemas =
      Array.isArray(parsed.schemas) && parsed.schemas.length > 0
        ? (parsed.schemas as PropertySchema[])
        : schemaDef
          ? [schemaDef]
          : [];
    const lastWriteAt =
      typeof parsed.lastWriteAt === 'number' ? parsed.lastWriteAt : Date.now();

    return {
      schema: 1,
      lastWriteAt,
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
  } catch {
    return defaultVault();
  }
};

export const serializeVault = (vault: Vault): string =>
  JSON.stringify(vault, null, 2);
