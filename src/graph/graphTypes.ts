import type { ItemType } from '../data/types';

export type GraphNode = {
  id: string;
  label: string;
  type: ItemType;
  favorite?: boolean;
};

export type GraphLink = {
  source: string;
  target: string;
};

export type GraphData = {
  nodes: GraphNode[];
  links: GraphLink[];
};
