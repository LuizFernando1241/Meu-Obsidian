import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';

import { db } from '../data/db';
import type { Item } from '../data/types';
import { buildGlobalGraph, buildLocalGraph } from './buildGraph';
import type { GraphData } from './graphTypes';

const buildItemsKey = (items: Item[] | undefined) => {
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
  const itemsKey = React.useMemo(() => buildItemsKey(items), [items]);

  const data = React.useMemo<GraphData>(() => {
    return buildGlobalGraph(items ?? []);
  }, [itemsKey]);

  return { data, ready: Boolean(items) };
};

export const useLocalGraphData = (centerId: string, depth = 1) => {
  const items = useLiveQuery(() => db.items.toArray(), []);
  const itemsKey = React.useMemo(() => buildItemsKey(items), [items]);

  const data = React.useMemo<GraphData>(() => {
    const list = items ?? [];
    const itemsById = new Map(list.map((item) => [item.id, item]));
    return buildLocalGraph(itemsById, centerId, depth);
  }, [centerId, depth, itemsKey]);

  return { data, ready: Boolean(items) };
};
