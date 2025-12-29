import type { Item, PropertySchema, SavedView, Tombstone } from '../data/types';
import type { Vault } from './vault';

const compareNumber = (left: number, right: number) => {
  if (left === right) {
    return 0;
  }
  return left > right ? 1 : -1;
};

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

  const pushNeeded = localWonItem || localWonTombstone || localWonView || localWonSchema;

  return {
    merged: {
      schema: 1,
      lastWriteAt: Date.now(),
      items: mergedItems,
      tombstones: mergedTombstones,
      views: mergedViews,
      schemas: mergedSchemas,
    },
    pushNeeded,
  };
};
