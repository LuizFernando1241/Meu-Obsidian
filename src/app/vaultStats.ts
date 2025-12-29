import type { Node, PropertySchema, SavedView } from '../data/types';
import type { IndexedTask } from '../tasks/taskIndex';

export type VaultStats = {
  noteCount: number;
  folderCount: number;
  openTasks: number;
  approxBytes: number;
};

export const computeVaultStats = (
  nodes: Node[],
  tasks: IndexedTask[],
  views: SavedView[],
  schemas: PropertySchema[],
): VaultStats => {
  const noteCount = nodes.filter((node) => node.nodeType === 'note').length;
  const folderCount = nodes.filter((node) => node.nodeType === 'folder').length;
  const openTasks = tasks.filter((task) => !task.checked).length;
  let approxBytes = 0;
  try {
    approxBytes = JSON.stringify({ nodes, views, schemas }).length;
  } catch {
    approxBytes = 0;
  }
  return { noteCount, folderCount, openTasks, approxBytes };
};
