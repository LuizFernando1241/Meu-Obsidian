import { db } from './db';
import { buildDefaultSchema } from './schemaDefaults';
import type { Node, PropertySchema } from './types';

const getSchemaIdFromProps = (props: Record<string, unknown> | undefined) => {
  const raw = typeof props?.schemaId === 'string' ? props.schemaId.trim() : '';
  return raw ? raw : undefined;
};

export const resolveSchemaIdForNode = (
  nodeId: string,
  nodesById: Map<string, Node>,
): string => {
  let currentId: string | undefined = nodeId;

  while (currentId) {
    const node = nodesById.get(currentId);
    if (!node) {
      break;
    }
    if (node.nodeType === 'folder') {
      const schemaId = getSchemaIdFromProps(node.props as Record<string, unknown> | undefined);
      if (schemaId) {
        return schemaId;
      }
    }
    currentId = node.parentId;
  }

  return 'global';
};

const resolveSchemaIdFromDb = async (nodeId: string): Promise<string> => {
  let currentId: string | undefined = nodeId;

  while (currentId) {
    const node = (await db.items.get(currentId)) as Node | undefined;
    if (!node) {
      break;
    }
    if (node.nodeType === 'folder') {
      const schemaId = getSchemaIdFromProps(node.props as Record<string, unknown> | undefined);
      if (schemaId) {
        return schemaId;
      }
    }
    currentId = node.parentId;
  }

  return 'global';
};

export const getEffectiveSchema = async (nodeId: string): Promise<PropertySchema> => {
  const schemaId = await resolveSchemaIdFromDb(nodeId);
  const schema = schemaId ? await db.schemas.get(schemaId) : undefined;
  const globalSchema = await db.schemas.get('global');
  return (schema as PropertySchema | undefined) ?? (globalSchema as PropertySchema | undefined) ?? buildDefaultSchema(Date.now());
};
