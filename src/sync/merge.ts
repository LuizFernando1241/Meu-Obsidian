import type { Item, Tombstone } from '../data/types';
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

  const pushNeeded = localWonItem || localWonTombstone;

  return {
    merged: {
      schema: 1,
      lastWriteAt: Date.now(),
      items: mergedItems,
      tombstones: mergedTombstones,
    },
    pushNeeded,
  };
};
