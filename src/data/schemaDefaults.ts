import type { PropertyDef, PropertySchema } from './types';

const DEFAULT_PROPERTIES: PropertyDef[] = [
  {
    key: 'status',
    name: 'Status',
    type: 'select',
    options: ['idea', 'active', 'waiting', 'done'],
    defaultValue: 'active',
    indexed: true,
  },
  {
    key: 'priority',
    name: 'Prioridade',
    type: 'select',
    options: ['low', 'medium', 'high'],
    defaultValue: 'medium',
    indexed: true,
  },
  {
    key: 'due',
    name: 'Prazo',
    type: 'date',
  },
  {
    key: 'reviewAfter',
    name: 'Revisar em',
    type: 'date',
  },
  {
    key: 'context',
    name: 'Contexto',
    type: 'text',
    indexed: true,
  },
];

const cloneProperties = (properties: PropertyDef[]) =>
  properties.map((property) => ({
    ...property,
    options: property.options ? [...property.options] : undefined,
  }));

export const buildDefaultSchema = (updatedAt = Date.now()): PropertySchema => ({
  id: 'global',
  name: 'Global',
  version: 1,
  properties: cloneProperties(DEFAULT_PROPERTIES),
  updatedAt,
});
