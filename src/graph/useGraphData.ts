import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '../data/db';
import type { Node } from '../data/types';
import { filterActiveNodes } from '../data/deleted';
import { buildGlobalGraph, buildLocalGraph } from './buildGraph';
import type { GraphData } from './graphTypes';

const buildItemsKey = (items: Node[] | undefined) => {
  if (!items || items.length === 0) {
    return 'empty';
  }
  let maxUpdatedAt = 0;
  for (const item of items) {
    if (item.updatedAt > maxUpdatedAt) {
      maxUpdatedAt = item.updatedAt;
    }
  }
  return `${items.length}-${maxUpdatedAt}`;
};

export const useGlobalGraphData = () => {
  const items = useLiveQuery(() => db.items.toArray(), []);
  const activeItems = React.useMemo(() => filterActiveNodes(items ?? []), [items]);
  const itemsKey = React.useMemo(() => buildItemsKey(activeItems), [activeItems]);

  const data = React.useMemo<GraphData>(() => {
    return buildGlobalGraph(activeItems);
  }, [itemsKey]);

  return { data, ready: Boolean(items) };
};

export const useLocalGraphData = (centerId: string, depth = 1) => {
  const items = useLiveQuery(() => db.items.toArray(), []);
  const activeItems = React.useMemo(() => filterActiveNodes(items ?? []), [items]);
  const itemsKey = React.useMemo(() => buildItemsKey(activeItems), [activeItems]);

  const data = React.useMemo<GraphData>(() => {
    const list = activeItems;
    const itemsById = new Map(list.map((item) => [item.id, item]));
    return buildLocalGraph(itemsById, centerId, depth);
  }, [centerId, depth, itemsKey]);

  return { data, ready: Boolean(items) };
};
