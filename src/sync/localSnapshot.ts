import { db } from '../data/db';
import type { Item, Tombstone } from '../data/types';
import type { Vault } from './vault';

export const readLocalSnapshot = async (): Promise<{
  items: Item[];
  tombstones: Tombstone[];
}> => {
  const items = await db.items.toArray();
  const tombstones = await db.tombstones.toArray();
  return { items, tombstones };
};

export const applyMergedToLocal = async (merged: Vault): Promise<void> => {
  const tombstoneIds = new Set(merged.tombstones.map((entry) => entry.id));
  const items = merged.items.filter((item) => !tombstoneIds.has(item.id));
  const tombstones = merged.tombstones;

  await db.transaction('rw', db.items, db.tombstones, async () => {
    if (tombstones.length > 0) {
      await db.tombstones.bulkPut(tombstones);
    }

    if (tombstoneIds.size > 0) {
      await db.items.bulkDelete(Array.from(tombstoneIds));
    }

    if (items.length > 0) {
      await db.items.bulkPut(items);
    }
  });
};
