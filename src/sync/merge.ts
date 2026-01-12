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

const compareNumber = (left: number, right: number) => {
  if (left === right) {
    return 0;
  }
  return left > right ? 1 : -1;
};

const compareUpdatedAt = (left?: number, right?: number) =>
  compareNumber(left ?? 0, right ?? 0);

const chooseTombstone = (
  local?: Tombstone,
  remote?: Tombstone,
): { tombstone?: Tombstone; localWon: boolean } => {
  if (!local && !remote) {
    return { tombstone: undefined, localWon: false };
  }
  if (local && !remote) {
    return { tombstone: local, localWon: true };
  }
  if (!local && remote) {
    return { tombstone: remote, localWon: false };
  }

  const revCompare = compareNumber(local!.rev, remote!.rev);
  if (revCompare > 0) {
    return { tombstone: local, localWon: true };
  }
  if (revCompare < 0) {
    return { tombstone: remote, localWon: false };
  }

  const deletedCompare = compareNumber(local!.deletedAt, remote!.deletedAt);
  if (deletedCompare > 0) {
    return { tombstone: local, localWon: true };
  }
  if (deletedCompare < 0) {
    return { tombstone: remote, localWon: false };
  }

  return { tombstone: remote, localWon: false };
};

const chooseItem = (
  local?: Item,
  remote?: Item,
): { item?: Item; localWon: boolean } => {
  if (!local && !remote) {
    return { item: undefined, localWon: false };
  }
  if (local && !remote) {
    return { item: local, localWon: true };
  }
  if (!local && remote) {
    return { item: remote, localWon: false };
  }

  const revCompare = compareNumber(local!.rev ?? 0, remote!.rev ?? 0);
  if (revCompare > 0) {
    return { item: local, localWon: true };
  }
  if (revCompare < 0) {
    return { item: remote, localWon: false };
  }

  const updatedCompare = compareNumber(local!.updatedAt ?? 0, remote!.updatedAt ?? 0);
  if (updatedCompare > 0) {
    return { item: local, localWon: true };
  }
  if (updatedCompare < 0) {
    return { item: remote, localWon: false };
  }

  return { item: remote, localWon: false };
};

const chooseView = (
  local?: SavedView,
  remote?: SavedView,
): { view?: SavedView; localWon: boolean } => {
  if (!local && !remote) {
    return { view: undefined, localWon: false };
  }
  if (local && !remote) {
    return { view: local, localWon: true };
  }
  if (!local && remote) {
    return { view: remote, localWon: false };
  }

  const updatedCompare = compareNumber(local!.updatedAt ?? 0, remote!.updatedAt ?? 0);
  if (updatedCompare > 0) {
    return { view: local, localWon: true };
  }
  if (updatedCompare < 0) {
    return { view: remote, localWon: false };
  }

  const createdCompare = compareNumber(local!.createdAt ?? 0, remote!.createdAt ?? 0);
  if (createdCompare > 0) {
    return { view: local, localWon: true };
  }
  if (createdCompare < 0) {
    return { view: remote, localWon: false };
  }

  return { view: remote, localWon: false };
};

const chooseSchema = (
  local?: PropertySchema,
  remote?: PropertySchema,
): { schema?: PropertySchema; localWon: boolean } => {
  if (!local && !remote) {
    return { schema: undefined, localWon: false };
  }
  if (local && !remote) {
    return { schema: local, localWon: true };
  }
  if (!local && remote) {
    return { schema: remote, localWon: false };
  }

  const updatedCompare = compareNumber(local!.updatedAt ?? 0, remote!.updatedAt ?? 0);
  if (updatedCompare > 0) {
    return { schema: local, localWon: true };
  }
  if (updatedCompare < 0) {
    return { schema: remote, localWon: false };
  }

  const versionCompare = compareNumber(local!.version ?? 0, remote!.version ?? 0);
  if (versionCompare > 0) {
    return { schema: local, localWon: true };
  }
  if (versionCompare < 0) {
    return { schema: remote, localWon: false };
  }

  return { schema: remote, localWon: false };
};

const chooseByUpdatedAt = <T extends { updatedAt?: number }>(
  local?: T,
  remote?: T,
): { value?: T; localWon: boolean } => {
  if (!local && !remote) {
    return { value: undefined, localWon: false };
  }
  if (local && !remote) {
    return { value: local, localWon: true };
  }
  if (!local && remote) {
    return { value: remote, localWon: false };
  }

  const updatedCompare = compareUpdatedAt(local!.updatedAt, remote!.updatedAt);
  if (updatedCompare > 0) {
    return { value: local, localWon: true };
  }
  if (updatedCompare < 0) {
    return { value: remote, localWon: false };
  }

  return { value: remote, localWon: false };
};

const inboxTimestamp = (item?: InboxItemRow) =>
  item ? item.processedAt ?? item.createdAt ?? 0 : 0;

const chooseInboxItem = (
  local?: InboxItemRow,
  remote?: InboxItemRow,
): { item?: InboxItemRow; localWon: boolean } => {
  if (!local && !remote) {
    return { item: undefined, localWon: false };
  }
  if (local && !remote) {
    return { item: local, localWon: true };
  }
  if (!local && remote) {
    return { item: remote, localWon: false };
  }

  const updatedCompare = compareNumber(inboxTimestamp(local), inboxTimestamp(remote));
  if (updatedCompare > 0) {
    return { item: local, localWon: true };
  }
  if (updatedCompare < 0) {
    return { item: remote, localWon: false };
  }

  return { item: remote, localWon: false };
};

const SYNC_EXCLUDED_META_KEYS = new Set(['taskIndexBuildCheckpoint']);

const filterSyncedMeta = (rows: AppMetaRow[]) =>
  rows.filter((row) => !SYNC_EXCLUDED_META_KEYS.has(row.key));

export const mergeVaults = (
  local: Vault,
  remote: Vault,
): { merged: Vault; pushNeeded: boolean } => {
  const localTombsById = new Map(local.tombstones.map((t) => [t.id, t]));
  const remoteTombsById = new Map(remote.tombstones.map((t) => [t.id, t]));
  const localItemsById = new Map(local.items.map((item) => [item.id, item]));
  const remoteItemsById = new Map(remote.items.map((item) => [item.id, item]));

  const tombstoneIds = new Set<string>([
    ...localTombsById.keys(),
    ...remoteTombsById.keys(),
  ]);
  const mergedTombstones: Tombstone[] = [];

  let localWonTombstone = false;
  tombstoneIds.forEach((id) => {
    const { tombstone, localWon } = chooseTombstone(
      localTombsById.get(id),
      remoteTombsById.get(id),
    );
    if (tombstone) {
      mergedTombstones.push(tombstone);
      if (localWon) {
        localWonTombstone = true;
      }
    }
  });

  const mergedTombById = new Map(mergedTombstones.map((t) => [t.id, t]));
  const itemIds = new Set<string>([
    ...localItemsById.keys(),
    ...remoteItemsById.keys(),
  ]);
  const mergedItems: Item[] = [];
  let localWonItem = false;

  itemIds.forEach((id) => {
    if (mergedTombById.has(id)) {
      return;
    }

    const { item, localWon } = chooseItem(
      localItemsById.get(id),
      remoteItemsById.get(id),
    );
    if (item) {
      mergedItems.push(item);
      if (localWon) {
        localWonItem = true;
      }
    }
  });

  const localViewsById = new Map(local.views.map((view) => [view.id, view]));
  const remoteViewsById = new Map(remote.views.map((view) => [view.id, view]));
  const viewIds = new Set<string>([
    ...localViewsById.keys(),
    ...remoteViewsById.keys(),
  ]);
  const mergedViews: SavedView[] = [];
  let localWonView = false;

  viewIds.forEach((id) => {
    const { view, localWon } = chooseView(
      localViewsById.get(id),
      remoteViewsById.get(id),
    );
    if (view) {
      mergedViews.push(view);
      if (localWon) {
        localWonView = true;
      }
    }
  });

  const localSchemasById = new Map((local.schemas ?? []).map((schema) => [schema.id, schema]));
  const remoteSchemasById = new Map((remote.schemas ?? []).map((schema) => [schema.id, schema]));
  const schemaIds = new Set<string>([
    ...localSchemasById.keys(),
    ...remoteSchemasById.keys(),
  ]);
  const mergedSchemas: PropertySchema[] = [];
  let localWonSchema = false;

  schemaIds.forEach((id) => {
    const { schema, localWon } = chooseSchema(
      localSchemasById.get(id),
      remoteSchemasById.get(id),
    );
    if (schema) {
      mergedSchemas.push(schema);
      if (localWon) {
        localWonSchema = true;
      }
    }
  });

  const localTasksById = new Map(
    (local.tasks_index ?? []).map((task) => [task.taskId, task]),
  );
  const remoteTasksById = new Map(
    (remote.tasks_index ?? []).map((task) => [task.taskId, task]),
  );
  const taskIds = new Set<string>([
    ...localTasksById.keys(),
    ...remoteTasksById.keys(),
  ]);
  const mergedTasks: TaskIndexRow[] = [];
  let localWonTask = false;

  taskIds.forEach((id) => {
    const { value, localWon } = chooseByUpdatedAt(
      localTasksById.get(id),
      remoteTasksById.get(id),
    );
    if (value) {
      mergedTasks.push(value);
      if (localWon) {
        localWonTask = true;
      }
    }
  });

  const localUserStateByKey = new Map(
    (local.user_state ?? []).map((row) => [`${row.userId}::${row.space}`, row]),
  );
  const remoteUserStateByKey = new Map(
    (remote.user_state ?? []).map((row) => [`${row.userId}::${row.space}`, row]),
  );
  const userStateKeys = new Set<string>([
    ...localUserStateByKey.keys(),
    ...remoteUserStateByKey.keys(),
  ]);
  const mergedUserState: UserStateRow[] = [];
  let localWonUserState = false;

  userStateKeys.forEach((key) => {
    const { value, localWon } = chooseByUpdatedAt(
      localUserStateByKey.get(key),
      remoteUserStateByKey.get(key),
    );
    if (value) {
      mergedUserState.push(value);
      if (localWon) {
        localWonUserState = true;
      }
    }
  });

  const localInboxById = new Map(
    (local.inbox_items ?? []).map((item) => [item.id, item]),
  );
  const remoteInboxById = new Map(
    (remote.inbox_items ?? []).map((item) => [item.id, item]),
  );
  const inboxIds = new Set<string>([
    ...localInboxById.keys(),
    ...remoteInboxById.keys(),
  ]);
  const mergedInbox: InboxItemRow[] = [];
  let localWonInbox = false;

  inboxIds.forEach((id) => {
    const { item, localWon } = chooseInboxItem(
      localInboxById.get(id),
      remoteInboxById.get(id),
    );
    if (item) {
      mergedInbox.push(item);
      if (localWon) {
        localWonInbox = true;
      }
    }
  });

  const localMetaByKey = new Map(
    filterSyncedMeta(local.app_meta ?? []).map((meta) => [meta.key, meta]),
  );
  const remoteMetaByKey = new Map(
    filterSyncedMeta(remote.app_meta ?? []).map((meta) => [meta.key, meta]),
  );
  const metaKeys = new Set<string>([
    ...localMetaByKey.keys(),
    ...remoteMetaByKey.keys(),
  ]);
  const mergedMeta: AppMetaRow[] = [];
  let localWonMeta = false;

  metaKeys.forEach((key) => {
    const { value, localWon } = chooseByUpdatedAt(
      localMetaByKey.get(key),
      remoteMetaByKey.get(key),
    );
    if (value) {
      mergedMeta.push(value);
      if (localWon) {
        localWonMeta = true;
      }
    }
  });

  const localJobsById = new Map(
    (local.index_jobs ?? []).map((job) => [job.id, job]),
  );
  const remoteJobsById = new Map(
    (remote.index_jobs ?? []).map((job) => [job.id, job]),
  );
  const jobIds = new Set<string>([
    ...localJobsById.keys(),
    ...remoteJobsById.keys(),
  ]);
  const mergedJobs: IndexJobRow[] = [];
  let localWonJob = false;

  jobIds.forEach((id) => {
    const { value, localWon } = chooseByUpdatedAt(
      localJobsById.get(id),
      remoteJobsById.get(id),
    );
    if (value) {
      mergedJobs.push(value);
      if (localWon) {
        localWonJob = true;
      }
    }
  });

  const pushNeeded =
    localWonItem ||
    localWonTombstone ||
    localWonView ||
    localWonSchema ||
    localWonTask ||
    localWonUserState ||
    localWonInbox ||
    localWonMeta ||
    localWonJob;

  return {
    merged: {
      schema: 1,
      lastWriteAt: Date.now(),
      items: mergedItems,
      tombstones: mergedTombstones,
      views: mergedViews,
      schemas: mergedSchemas,
      tasks_index: mergedTasks,
      user_state: mergedUserState,
      inbox_items: mergedInbox,
      app_meta: mergedMeta,
      index_jobs: mergedJobs,
    },
    pushNeeded,
  };
};
