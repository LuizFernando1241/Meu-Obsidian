import type { NodeType } from '../data/types';

type SortableNode = {
  id: string;
  nodeType: NodeType;
  title?: string;
  order?: number;
};

const normalizeTitle = (value: string | undefined) => value?.trim() || 'Sem titulo';

const getOrder = (value: SortableNode) =>
  typeof value.order === 'number' && Number.isFinite(value.order) ? value.order : undefined;

export const compareNodes = (left: SortableNode, right: SortableNode) => {
  const leftOrder = getOrder(left);
  const rightOrder = getOrder(right);
  if (leftOrder !== undefined && rightOrder !== undefined && leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  if (left.nodeType !== right.nodeType) {
    return left.nodeType === 'folder' ? -1 : 1;
  }
  const leftTitle = normalizeTitle(left.title).toLowerCase();
  const rightTitle = normalizeTitle(right.title).toLowerCase();
  if (leftTitle === rightTitle) {
    return left.id.localeCompare(right.id);
  }
  return leftTitle.localeCompare(rightTitle);
};

export const sortNodes = <T extends SortableNode>(nodes: T[]) => nodes.sort(compareNodes);
