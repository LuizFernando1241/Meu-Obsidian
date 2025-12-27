import { create } from 'zustand';

import { ensureSeedData } from '../data/seed';
import { createFolder, createNote, wipeAll as wipeAllItems } from '../data/repo';
import type { NodeType } from '../data/types';

type DataState = {
  isReady: boolean;
  isSeeding: boolean;
  lastError?: string;
  init: () => Promise<void>;
  createQuick: (type: NodeType) => Promise<string>;
  wipeAll: () => Promise<void>;
};

const quickTitles: Record<NodeType, string> = {
  note: 'Nova nota',
  folder: 'Nova pasta',
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
    if (type === 'folder') {
      const folder = await createFolder({ title: quickTitles[type] });
      return folder.id;
    }
    const note = await createNote({ title: quickTitles[type] });
    return note.id;
  },
  wipeAll: async () => {
    await wipeAllItems();
  },
}));
