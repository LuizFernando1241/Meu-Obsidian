import type { Node } from '../data/types';
import type { GraphData, GraphLink, GraphNode } from './graphTypes';

const makeNode = (item: Node): GraphNode => ({
  id: item.id,
  label: item.title || 'Sem tヴtulo',
  type: item.nodeType,
  favorite: item.favorite,
});

const makeLinks = (itemsById: Map<string, Node>, items: Node[]) => {
  const linksMap = new Map<string, GraphLink>();
  items.forEach((item) => {
    const targets = item.linksTo ?? [];
    targets.forEach((targetId) => {
      if (!targetId || targetId === item.id) {
        return;
      }
      if (!itemsById.has(targetId)) {
        return;
      }
      const key = `${item.id}->${targetId}`;
      if (!linksMap.has(key)) {
        linksMap.set(key, { source: item.id, target: targetId });
      }
    });
  });
  return Array.from(linksMap.values());
};

export const buildGlobalGraph = (items: Node[]): GraphData => {
  const noteItems = items.filter((item) => item.nodeType === 'note');
  const itemsById = new Map(noteItems.map((item) => [item.id, item]));
  const nodes = noteItems.map(makeNode);
  const links = makeLinks(itemsById, noteItems);
  return { nodes, links };
};

export const buildLocalGraph = (
  itemsById: Map<string, Node>,
  centerId: string,
  depth = 1,
): GraphData => {
  const center = itemsById.get(centerId);
  if (!center || center.nodeType !== 'note') {
    return { nodes: [], links: [] };
  }

  const included = new Set<string>([centerId]);
  const frontier = new Set<string>([centerId]);

  for (let step = 0; step < depth; step += 1) {
    const nextFrontier = new Set<string>();
    frontier.forEach((currentId) => {
      const current = itemsById.get(currentId);
      if (!current) {
        return;
      }
      const outgoing = current.linksTo ?? [];
      outgoing.forEach((targetId) => {
        if (itemsById.has(targetId)) {
          if (!included.has(targetId)) {
            included.add(targetId);
            nextFrontier.add(targetId);
          }
        }
      });
      itemsById.forEach((item) => {
        if (item.linksTo?.includes(currentId)) {
          if (!included.has(item.id)) {
            included.add(item.id);
            nextFrontier.add(item.id);
          }
        }
      });
    });
    frontier.clear();
    nextFrontier.forEach((id) => frontier.add(id));
  }

  const nodes = Array.from(included)
    .map((id) => itemsById.get(id))
    .filter((item): item is Node => Boolean(item))
    .filter((item) => item.nodeType === 'note')
    .map(makeNode);

  const scopedItems = Array.from(included)
    .map((id) => itemsById.get(id))
    .filter((item): item is Node => Boolean(item))
    .filter((item) => item.nodeType === 'note');

  const links = makeLinks(itemsById, scopedItems).filter(
    (link) => included.has(link.source) && included.has(link.target),
  );

  return { nodes, links };
};
