import { create } from 'zustand';

import type { IndexedTask } from '../tasks/taskIndex';

type TaskSelectionState = {
  selectedTask: IndexedTask | null;
  setSelectedTask: (task: IndexedTask | null) => void;
  clearSelection: () => void;
};

export const useTaskSelection = create<TaskSelectionState>((set) => ({
  selectedTask: null,
  setSelectedTask: (task) => set({ selectedTask: task }),
  clearSelection: () => set({ selectedTask: null }),
}));
