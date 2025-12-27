import type { Node } from '../data/types';

export const buildParentMap = (nodes: Node[]) =>
  new Map(nodes.map((node) => [node.id, node.parentId]));

export const getPath = (nodeId: string, nodesById: Map<string, Node>) => {
  const path: Node[] = [];
  const visited = new Set<string>();
  let currentId: string | undefined = nodeId;

  while (currentId) {
    if (visited.has(currentId)) {
      break;
    }
    visited.add(currentId);
    const node = nodesById.get(currentId);
    if (!node) {
      break;
    }
    path.push(node);
    currentId = node.parentId;
  }

  return path.reverse();
};

export const formatPath = (pathNodes: Node[]) =>
  pathNodes.map((node) => node.title || 'Sem titulo').join(' / ');
