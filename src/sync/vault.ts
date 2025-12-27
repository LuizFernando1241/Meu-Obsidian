import type { Item, Tombstone } from '../data/types';

export type Vault = {
  schema: 1;
  lastWriteAt: number;
  items: Item[];
  tombstones: Tombstone[];
};

export const defaultVault = (): Vault => ({
  schema: 1,
  lastWriteAt: Date.now(),
  items: [],
  tombstones: [],
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
    const lastWriteAt =
      typeof parsed.lastWriteAt === 'number' ? parsed.lastWriteAt : Date.now();

    return {
      schema: 1,
      lastWriteAt,
      items,
      tombstones,
    };
  } catch {
    return defaultVault();
  }
};

export const serializeVault = (vault: Vault): string =>
  JSON.stringify(vault, null, 2);
