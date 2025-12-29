import type { Item, PropertySchema, SavedView, Tombstone } from '../data/types';

export type Vault = {
  schema: 1;
  lastWriteAt: number;
  items: Item[];
  tombstones: Tombstone[];
  views: SavedView[];
  schemas?: PropertySchema[];
};

export const defaultVault = (): Vault => ({
  schema: 1,
  lastWriteAt: Date.now(),
  items: [],
  tombstones: [],
  views: [],
  schemas: [],
});

export const parseVault = (text: string): Vault => {
  if (!text || !text.trim()) {
    return defaultVault();
  }

  try {
    const parsed = JSON.parse(text) as Partial<Vault>;
    const items = Array.isArray(parsed.items) ? (parsed.items as Item[]) : [];
    const tombstones = Array.isArray(parsed.tombstones)
      ? (parsed.tombstones as Tombstone[])
      : [];
    const views = Array.isArray(parsed.views) ? (parsed.views as SavedView[]) : [];
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
    };
  } catch {
    return defaultVault();
  }
};

export const serializeVault = (vault: Vault): string =>
  JSON.stringify(vault, null, 2);
