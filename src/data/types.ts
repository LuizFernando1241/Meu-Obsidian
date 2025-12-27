export type ItemType = 'note' | 'task' | 'project' | 'area';

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
  language?: string;
  taskId?: string;
};

export type BaseItem = {
  id: string;
  type: ItemType;
  title: string;
  content: Block[];
  tags: string[];
  favorite: boolean;
  linksTo: string[];
  rev: number;
  createdAt: number;
  updatedAt: number;
};

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

export type TaskFields = {
  status: TaskStatus;
  dueDate?: number;
  doneAt?: number;
  recurrence?: Recurrence;
  projectId?: string;
  originItemId?: string;
  originBlockId?: string;
  originType?: ItemType;
};

export type ProjectFields = {
  nextActionId?: string;
};

export type Item = BaseItem & Partial<TaskFields & ProjectFields>;
