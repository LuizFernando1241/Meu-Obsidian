import { db } from '../data/db';
import type { Item, PropertySchema, SavedView, Tombstone } from '../data/types';
import type { Vault } from './vault';

export const readLocalSnapshot = async (): Promise<{
  items: Item[];
  tombstones: Tombstone[];
  views: SavedView[];
  schemas: PropertySchema[];
}> => {
  const items = await db.items.toArray();
  const tombstones = await db.tombstones.toArray();
  const views = await db.views.toArray();
  const schemas = await db.schemas.toArray();
  return { items, tombstones, views, schemas };
};

export const applyMergedToLocal = async (merged: Vault): Promise<void> => {
  const tombstoneIds = new Set(merged.tombstones.map((entry) => entry.id));
  const items = merged.items.filter((item) => !tombstoneIds.has(item.id));
  const tombstones = merged.tombstones;
  const views = merged.views ?? [];
  const schemas = merged.schemas ?? [];

  await db.transaction('rw', db.items, db.tombstones, db.views, db.schemas, async () => {
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
  });
};
