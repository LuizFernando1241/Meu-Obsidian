import { create } from 'zustand';

import type { Space } from '../data/types';

type SpaceState = {
  space: Space;
  setSpace: (space: Space) => void;
};

const STORAGE_KEY = 'mf_space';

const readStoredSpace = (): Space => {
  if (typeof window === 'undefined') {
    return 'PERSONAL';
  }
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw === 'WORK' || raw === 'PERSONAL') {
    return raw;
  }
  return 'PERSONAL';
};

export const useSpaceStore = create<SpaceState>((set) => ({
  space: readStoredSpace(),
  setSpace: (space) => {
    set({ space });
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, space);
    }
  },
}));
