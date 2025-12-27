import { create } from 'zustand';

import { ensureSeedData } from '../data/seed';
import { createItem, wipeAll as wipeAllItems } from '../data/repo';
import type { ItemType } from '../data/types';

type DataState = {
  isReady: boolean;
  isSeeding: boolean;
  lastError?: string;
  init: () => Promise<void>;
  createQuick: (type: ItemType) => Promise<string>;
  wipeAll: () => Promise<void>;
};

const quickTitles: Record<ItemType, string> = {
  note: 'Nova nota',
  task: 'Nova tarefa',
  project: 'Novo projeto',
  area: 'Nova area',
};

export const useDataStore = create<DataState>((set, get) => ({
  isReady: false,
  isSeeding: false,
  lastError: undefined,
  init: async () => {
    const { isReady, isSeeding } = get();
    if (isReady || isSeeding) {
      return;
    }

    set({ isSeeding: true, lastError: undefined });
    try {
      await ensureSeedData();
      set({ isReady: true, isSeeding: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ lastError: message, isSeeding: false });
    }
  },
  createQuick: async (type) => {
    const item = await createItem({
      type,
      title: quickTitles[type],
    });
    return item.id;
  },
  wipeAll: async () => {
    await wipeAllItems();
  },
}));
