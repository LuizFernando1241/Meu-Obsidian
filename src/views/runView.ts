import type { Node, SavedView } from '../data/types';
import { filterActiveNodes } from '../data/deleted';
import { buildPathCache } from '../vault/pathCache';

const getPropValue = (node: Node, key: string) => {
  const props = node.props;
  if (!props || typeof props !== 'object') {
    return '';
  }
  const raw = (props as Record<string, unknown>)[key];
  return typeof raw === 'string' ? raw : '';
};

const normalizeText = (value: string) => value.toLowerCase().trim();

const getNodeText = (node: Node) => {
  const title = node.title ?? '';
  if (node.nodeType !== 'note') {
    return title;
  }
  const content = node.content
    .map((block) => block.text ?? '')
    .filter(Boolean)
    .join(' ');
  return `${title} ${content}`.trim();
};

const buildParentMap = (nodes: Node[]) =>
  new Map(nodes.map((node) => [node.id, node.parentId]));

const isDescendantOf = (
  nodeId: string,
  rootId: string,
  parentById: Map<string, string | undefined>,
) => {
  let current = parentById.get(nodeId);
  while (current) {
    if (current === rootId) {
      return true;
    }
    current = parentById.get(current);
  }
  return false;
};

const priorityOrder: Record<string, number> = {
  low: 1,
  medium: 2,
  high: 3,
};

const statusOrder: Record<string, number> = {
  idea: 1,
  active: 2,
  waiting: 3,
  done: 4,
};

const typeOrder: Record<string, number> = {
  folder: 1,
  note: 2,
};

const compareStrings = (left: string, right: string) =>
  left.localeCompare(right, undefined, { sensitivity: 'base' });

export function runView(nodes: Node[], view: SavedView): Node[] {
  const query = view.query ?? {};
  const activeNodes = filterActiveNodes(nodes);
  let result = [...activeNodes];
  const needsPathCache = Boolean(query.pathPrefix || view.sort?.by === 'path');
  const pathCache = needsPathCache ? buildPathCache(activeNodes) : undefined;

  if (query.type && query.type !== 'any') {
    result = result.filter((node) => node.nodeType === query.type);
  }

  if (query.tags && query.tags.length > 0) {
    const tags = query.tags.map((tag) => tag.toLowerCase());
    result = result.filter((node) =>
      tags.every((tag) => (node.tags ?? []).map((t) => t.toLowerCase()).includes(tag)),
    );
  }

  if (query.status && query.status.length > 0) {
    result = result.filter((node) => query.status?.includes(getPropValue(node, 'status')));
  }

  if (query.priority && query.priority.length > 0) {
    result = result.filter((node) => query.priority?.includes(getPropValue(node, 'priority')));
  }

  if (query.favoritesOnly) {
    result = result.filter((node) => node.favorite);
  }

  if (query.rootId) {
    const parentById = buildParentMap(activeNodes);
    result = result.filter((node) => isDescendantOf(node.id, query.rootId as string, parentById));
  }

  if (query.pathPrefix) {
    const needle = normalizeText(query.pathPrefix);
    result = result.filter((node) => {
      const pathText = pathCache?.get(node.id)?.pathText ?? '';
      return normalizeText(pathText).includes(needle);
    });
  }

  if (query.due) {
    const dueFrom = query.due.from ?? '';
    const dueTo = query.due.to ?? '';
    const allowMissing = Boolean(query.due.missing);
    result = result.filter((node) => {
      const due = getPropValue(node, 'due');
      if (!due) {
        return allowMissing;
      }
      if (dueFrom && due < dueFrom) {
        return false;
      }
      if (dueTo && due > dueTo) {
        return false;
      }
      return true;
    });
  }

  if (typeof query.updatedSinceDays === 'number' && query.updatedSinceDays > 0) {
    const threshold = Date.now() - query.updatedSinceDays * 24 * 60 * 60 * 1000;
    result = result.filter((node) => node.updatedAt >= threshold);
  }

  if (query.text && query.text.trim()) {
    const needle = normalizeText(query.text);
    result = result.filter((node) => normalizeText(getNodeText(node)).includes(needle));
  }

  if (view.sort?.by) {
    const { by, dir } = view.sort;
    result.sort((left, right) => {
      if (by === 'title') {
        const cmp = compareStrings(left.title ?? '', right.title ?? '');
        return dir === 'desc' ? -cmp : cmp;
      }

      if (by === 'updatedAt') {
        const cmp = (left.updatedAt ?? 0) - (right.updatedAt ?? 0);
        return dir === 'desc' ? -cmp : cmp;
      }

      if (by === 'due') {
        const leftDue = getPropValue(left, 'due');
        const rightDue = getPropValue(right, 'due');
        if (!leftDue && rightDue) {
          return 1;
        }
        if (leftDue && !rightDue) {
          return -1;
        }
        if (leftDue && rightDue) {
          const cmp = compareStrings(leftDue, rightDue);
          return dir === 'desc' ? -cmp : cmp;
        }
        return (right.updatedAt ?? 0) - (left.updatedAt ?? 0);
      }

      if (by === 'priority') {
        const leftPriority = priorityOrder[getPropValue(left, 'priority')] ?? 0;
        const rightPriority = priorityOrder[getPropValue(right, 'priority')] ?? 0;
        if (!leftPriority && rightPriority) {
          return 1;
        }
        if (leftPriority && !rightPriority) {
          return -1;
        }
        const cmp = leftPriority - rightPriority;
        return dir === 'desc' ? -cmp : cmp;
      }

      if (by === 'status') {
        const leftStatus = statusOrder[getPropValue(left, 'status')] ?? 0;
        const rightStatus = statusOrder[getPropValue(right, 'status')] ?? 0;
        if (!leftStatus && rightStatus) {
          return 1;
        }
        if (leftStatus && !rightStatus) {
          return -1;
        }
        const cmp = leftStatus - rightStatus;
        return dir === 'desc' ? -cmp : cmp;
      }

      if (by === 'type') {
        const leftType = typeOrder[left.nodeType] ?? 0;
        const rightType = typeOrder[right.nodeType] ?? 0;
        if (leftType !== rightType) {
          const cmp = leftType - rightType;
          return dir === 'desc' ? -cmp : cmp;
        }
        const cmp = compareStrings(left.title ?? '', right.title ?? '');
        return dir === 'desc' ? -cmp : cmp;
      }

      if (by === 'path') {
        const leftPath = pathCache?.get(left.id)?.pathText ?? '';
        const rightPath = pathCache?.get(right.id)?.pathText ?? '';
        const cmp = compareStrings(leftPath, rightPath);
        return dir === 'desc' ? -cmp : cmp;
      }

      return 0;
    });
  }

  return result;
}
