import { v4 as uuidv4 } from 'uuid';

import type { Block, BlockType, Node } from '../data/types';

export type ConflictEntry = {
  nodeId: string;
  local: Node;
  remote: Node;
};

const normalizeTags = (tags: string[] | null | undefined) =>
  (Array.isArray(tags) ? tags : [])
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));

const stableStringify = (value: unknown): string => {
  if (value === undefined) {
    return 'null';
  }
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    const entries = keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
};

const normalizeBlock = (block: Block) => ({
  id: block.id ?? '',
  type: block.type ?? 'paragraph',
  text: block.text ?? '',
  checked: block.checked ?? false,
  due: block.due ?? null,
  doneAt: block.doneAt ?? null,
  priority: block.priority ?? null,
  tags: normalizeTags(block.tags ?? null),
  createdAt: block.createdAt ?? null,
  language: block.language ?? null,
  taskId: block.taskId ?? null,
  meta: block.meta ?? null,
});

const serializeBlocks = (blocks: Block[] | undefined) =>
  JSON.stringify((blocks ?? []).map((block) => normalizeBlock(block)));

const areStringArraysEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

export const hasMeaningfulDiff = (a: Node, b: Node): boolean => {
  if (a.nodeType !== b.nodeType) {
    return true;
  }
  if ((a.title ?? '') !== (b.title ?? '')) {
    return true;
  }
  if ((a.parentId ?? '') !== (b.parentId ?? '')) {
    return true;
  }
  if ((a.favorite ?? false) !== (b.favorite ?? false)) {
    return true;
  }

  const tagsA = normalizeTags(a.tags);
  const tagsB = normalizeTags(b.tags);
  if (!areStringArraysEqual(tagsA, tagsB)) {
    return true;
  }

  const propsA = stableStringify(a.props ?? {});
  const propsB = stableStringify(b.props ?? {});
  if (propsA !== propsB) {
    return true;
  }

  if (a.nodeType === 'note' && b.nodeType === 'note') {
    const contentA = serializeBlocks(a.content);
    const contentB = serializeBlocks(b.content);
    if (contentA !== contentB) {
      return true;
    }
  }

  return false;
};

export const buildConflictKey = (
  nodeId: string,
  localUpdatedAt: number,
  remoteUpdatedAt: number,
) => `${nodeId}:${localUpdatedAt}:${remoteUpdatedAt}`;

export const collectExistingConflictKeys = (items: Node[]) => {
  const keys = new Set<string>();
  items.forEach((item) => {
    if (item.nodeType !== 'note') {
      return;
    }
    const props = item.props;
    if (!props || typeof props !== 'object') {
      return;
    }
    const createdBy = (props as Record<string, unknown>).createdBy;
    const conflictOf = (props as Record<string, unknown>).conflictOf;
    const localUpdatedAt = (props as Record<string, unknown>).localUpdatedAt;
    const remoteUpdatedAt = (props as Record<string, unknown>).remoteUpdatedAt;
    if (createdBy !== 'sync-conflict') {
      return;
    }
    if (typeof conflictOf !== 'string') {
      return;
    }
    if (typeof localUpdatedAt !== 'number' || typeof remoteUpdatedAt !== 'number') {
      return;
    }
    keys.add(buildConflictKey(conflictOf, localUpdatedAt, remoteUpdatedAt));
  });
  return keys;
};

const formatDateTime = (value: number) => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return '-';
  }
  const pad = (input: number) => String(input).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day} ${hours}:${minutes}`;
};

const renderBlocksToText = (blocks: Block[] | undefined) => {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return '(sem conteudo)';
  }

  const lines: string[] = [];
  blocks.forEach((block, index) => {
    const type = block.type as BlockType;
    const text = block.text ?? '';
    switch (type) {
      case 'checklist':
        lines.push(`${block.checked ? '[x]' : '[ ]'} ${text}`);
        break;
      case 'bullet':
        lines.push(`- ${text}`);
        break;
      case 'numbered':
        lines.push(`${index + 1}. ${text}`);
        break;
      case 'h1':
        lines.push(`# ${text}`);
        break;
      case 'h2':
        lines.push(`## ${text}`);
        break;
      case 'h3':
        lines.push(`### ${text}`);
        break;
      case 'divider':
        lines.push('---');
        break;
      case 'callout':
        lines.push(`> ${text}`);
        break;
      default:
        lines.push(text);
        break;
    }
  });

  return lines.join('\n').trim() || '(sem conteudo)';
};

const renderNodeSnapshot = (node: Node) => {
  if (node.nodeType === 'note') {
    return renderBlocksToText(node.content);
  }

  const propsText =
    node.props && Object.keys(node.props).length > 0
      ? stableStringify(node.props)
      : '-';
  const parentLabel = node.parentId ?? 'Raiz';
  const tagsLabel = normalizeTags(node.tags).join(', ') || '-';
  const favoriteLabel = node.favorite ? 'sim' : 'nao';
  return [
    `Titulo: ${node.title || 'Sem titulo'}`,
    `ParentId: ${parentLabel}`,
    `Tags: ${tagsLabel}`,
    `Favorito: ${favoriteLabel}`,
    `Props: ${propsText}`,
  ].join('\n');
};

const makeBlock = (type: BlockType, text: string): Block => ({
  id: uuidv4(),
  type,
  text,
});

export const buildConflictNote = (conflict: ConflictEntry, createdAt: number): Node => {
  const baseTitle = conflict.local.title || conflict.remote.title || 'Sem titulo';
  const title = `Conflito - ${baseTitle} - ${formatDateTime(createdAt)}`;
  const localUpdatedAt = conflict.local.updatedAt ?? 0;
  const remoteUpdatedAt = conflict.remote.updatedAt ?? 0;

  const content: Block[] = [
    makeBlock('h2', 'Conflito detectado'),
    makeBlock('paragraph', `Nota original: ${baseTitle} (id: ${conflict.nodeId})`),
    makeBlock(
      'paragraph',
      `Local updatedAt: ${formatDateTime(localUpdatedAt)} | Remote updatedAt: ${formatDateTime(remoteUpdatedAt)}`,
    ),
    makeBlock('h3', 'Versao LOCAL'),
    makeBlock('code', renderNodeSnapshot(conflict.local)),
    makeBlock('h3', 'Versao REMOTA'),
    makeBlock('code', renderNodeSnapshot(conflict.remote)),
  ];

  return {
    id: uuidv4(),
    nodeType: 'note',
    title,
    parentId: undefined,
    tags: [],
    favorite: false,
    linksTo: [],
    rev: 1,
    createdAt,
    updatedAt: createdAt,
    props: {
      conflictOf: conflict.nodeId,
      localUpdatedAt,
      remoteUpdatedAt,
      localRev: conflict.local.rev ?? 0,
      remoteRev: conflict.remote.rev ?? 0,
      createdBy: 'sync-conflict',
    },
    content,
  };
};
