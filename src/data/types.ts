export type NodeType = 'folder' | 'note';

export type LegacyItemType = 'note' | 'task' | 'project' | 'area';

export type PropertyType =
  | 'text'
  | 'number'
  | 'checkbox'
  | 'date'
  | 'select'
  | 'multi_select';

export type PropertyDef = {
  key: string;
  name: string;
  type: PropertyType;
  options?: string[];
  defaultValue?: unknown;
  indexed?: boolean;
};

export type PropertySchema = {
  id: string;
  name: string;
  version: number;
  properties: PropertyDef[];
  updatedAt: number;
};

export type BlockType =
  | 'paragraph'
  | 'h1'
  | 'h2'
  | 'h3'
  | 'bullet'
  | 'numbered'
  | 'checklist'
  | 'callout'
  | 'code'
  | 'divider';

export type Block = {
  id: string;
  type: BlockType;
  text?: string;
  checked?: boolean;
  due?: string | null;
  snoozedUntil?: string | null;
  originalDue?: string | null;
  doneAt?: number | null;
  priority?: number | null;
  tags?: string[] | null;
  createdAt?: number;
  language?: string;
  taskId?: string;
  meta?: {
    priority?: 'P1' | 'P2' | 'P3';
    status?: 'open' | 'doing' | 'waiting';
    recurrence?: 'weekly' | 'monthly';
  };
};

export type BaseNode = {
  id: string;
  nodeType: NodeType;
  title: string;
  parentId?: string;
  order?: number;
  tags: string[];
  favorite: boolean;
  linksTo?: string[];
  rev: number;
  createdAt: number;
  updatedAt: number;
  props?: Record<string, unknown>;
  legacyType?: LegacyItemType;
};

export type NoteNode = BaseNode & {
  nodeType: 'note';
  content: Block[];
};

export type FolderNode = BaseNode & {
  nodeType: 'folder';
};

export type Node = NoteNode | FolderNode;

export type SavedViewQuery = {
  text?: string;
  type?: 'note' | 'folder' | 'any';
  rootId?: string;
  pathPrefix?: string;
  tags?: string[];
  status?: string[];
  priority?: string[];
  favoritesOnly?: boolean;
  due?: { from?: string; to?: string; missing?: boolean };
  updatedSinceDays?: number;
};

export type SavedViewSort = {
  by: 'updatedAt' | 'title' | 'due' | 'priority' | 'status' | 'type' | 'path';
  dir: 'asc' | 'desc';
};

export type SavedView = {
  id: string;
  name: string;
  query: SavedViewQuery;
  sort?: SavedViewSort;
  displayMode?: 'list' | 'table' | 'kanban' | 'calendar';
  table?: {
    columns?: Array<'title' | 'type' | 'path' | 'status' | 'priority' | 'due' | 'updatedAt'>;
    compact?: boolean;
  };
  kanban?: {
    columns: string[];
    includeEmptyStatus?: boolean;
  };
  calendar?: {
    dateField?: 'due';
    weekStartsOn?: 0 | 1;
    showUndated?: boolean;
  };
  createdAt: number;
  updatedAt: number;
};

export type NoteSnapshot = {
  id: string;
  nodeId: string;
  title: string;
  content: Block[];
  props?: Record<string, unknown>;
  updatedAt: number;
  createdAt: number;
};

export type Tombstone = {
  id: string;
  deletedAt: number;
  rev: number;
};

export type AutoBackup = {
  id: string;
  createdAt: number;
  bytes: number;
  payloadJson: string;
};

export type TaskStatus = 'todo' | 'doing' | 'done';

export type Recurrence = {
  freq: 'daily' | 'weekly' | 'monthly';
  interval: number;
};

export type LegacyTaskFields = {
  status?: TaskStatus;
  dueDate?: number;
  doneAt?: number;
  recurrence?: Recurrence;
  projectId?: string;
  originItemId?: string;
  originBlockId?: string;
  originType?: LegacyItemType;
};

export type LegacyProjectFields = {
  nextActionId?: string;
};

export type Item = Node;
