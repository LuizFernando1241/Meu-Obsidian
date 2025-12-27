export type NodeType = 'folder' | 'note';

export type LegacyItemType = 'note' | 'task' | 'project' | 'area';

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
  doneAt?: number | null;
  priority?: number | null;
  tags?: string[] | null;
  createdAt?: number;
  language?: string;
  taskId?: string;
};

export type BaseNode = {
  id: string;
  nodeType: NodeType;
  title: string;
  parentId?: string;
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

export type Tombstone = {
  id: string;
  deletedAt: number;
  rev: number;
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
