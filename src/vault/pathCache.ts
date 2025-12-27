import type { Node } from '../data/types';
import { getPath } from './path';

export type PathInfo = {
  nodeId: string;
  pathIds: string[];
  pathText: string;
};

const normalizeSegment = (value: string) =>
  value.replace(/\s+/g, ' ').trim();

export const buildPathCache = (nodes: Node[]) => {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const cache = new Map<string, PathInfo>();

  nodes.forEach((node) => {
    const pathNodes = getPath(node.id, nodesById);
    const pathIds = pathNodes.map((entry) => entry.id);
    const pathText = pathNodes
      .map((entry) => normalizeSegment(entry.title || 'Sem titulo'))
      .join('/');
    cache.set(node.id, {
      nodeId: node.id,
      pathIds,
      pathText,
    });
  });

  return cache;
};
