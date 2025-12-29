import type { Node, NodeType } from '../data/types';
import { compareNodes } from './sortNodes';

export type TreeNode = {
  id: string;
  nodeType: NodeType;
  title: string;
  parentId?: string;
  order?: number;
  children?: TreeNode[];
};

const isValidParent = (
  nodeId: string,
  parentId: string | undefined,
  nodesById: Map<string, Node>,
) => {
  if (!parentId || parentId === nodeId) {
    return false;
  }
  const parent = nodesById.get(parentId);
  if (!parent || parent.nodeType !== 'folder') {
    return false;
  }

  const visited = new Set<string>([nodeId]);
  let current: string | undefined = parentId;
  while (current) {
    if (visited.has(current)) {
      return false;
    }
    visited.add(current);
    const next = nodesById.get(current);
    if (!next) {
      return false;
    }
    current = next.parentId;
  }

  return true;
};

const sortTree = (nodes: TreeNode[]) => {
  nodes.sort(compareNodes);
  nodes.forEach((node) => {
    if (node.nodeType === 'folder' && node.children && node.children.length > 0) {
      sortTree(node.children);
    }
  });
};

export const buildTree = (nodes: Node[]) => {
  const byId = new Map<string, TreeNode>();
  const nodesById = new Map<string, Node>();

  nodes.forEach((node) => {
    nodesById.set(node.id, node);
    byId.set(node.id, {
      id: node.id,
      nodeType: node.nodeType,
      title: node.title?.trim() || 'Sem titulo',
      parentId: node.parentId,
      order: node.order,
    });
  });

  const roots: TreeNode[] = [];

  nodes.forEach((node) => {
    const treeNode = byId.get(node.id);
    if (!treeNode) {
      return;
    }
    const validParent =
      node.parentId && isValidParent(node.id, node.parentId, nodesById)
        ? node.parentId
        : undefined;

    if (!validParent) {
      roots.push(treeNode);
      return;
    }

    const parentNode = byId.get(validParent);
    if (!parentNode) {
      roots.push(treeNode);
      return;
    }
    if (!parentNode.children) {
      parentNode.children = [];
    }
    parentNode.children.push(treeNode);
  });

  sortTree(roots);
  return { roots, byId };
};
