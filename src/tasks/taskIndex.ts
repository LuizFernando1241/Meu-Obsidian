import type { Block, NoteNode } from '../data/types';

export type IndexedTask = {
  noteId: string;
  blockId: string;
  text: string;
  checked: boolean;
  due?: string | null;
  doneAt?: number | null;
  priority?: number | null;
  noteTitle: string;
  notePath?: string;
  updatedAt: number;
  rev: number;
};

const taskCache = new Map<string, { rev: number; tasks: IndexedTask[] }>();

const normalizeTitle = (title: string | undefined) => (title?.trim() ? title.trim() : 'Sem titulo');

const isChecklistBlock = (block: Block) => block.type === 'checklist';

export const extractTasksFromNote = (note: NoteNode): IndexedTask[] => {
  const noteTitle = normalizeTitle(note.title);
  const tasks: IndexedTask[] = [];
  const content = Array.isArray(note.content) ? note.content : [];

  content.forEach((block) => {
    if (!isChecklistBlock(block)) {
      return;
    }
    tasks.push({
      noteId: note.id,
      blockId: block.id,
      text: block.text ?? '',
      checked: block.checked ?? false,
      due: block.due ?? null,
      doneAt: block.doneAt ?? null,
      priority: block.priority ?? null,
      noteTitle,
      updatedAt: note.updatedAt,
      rev: note.rev ?? 0,
    });
  });

  return tasks;
};

export const buildTaskIndex = (notes: NoteNode[]): IndexedTask[] => {
  const result: IndexedTask[] = [];
  const seen = new Set<string>();

  notes.forEach((note) => {
    seen.add(note.id);
    const rev = note.rev ?? 0;
    const cached = taskCache.get(note.id);
    if (cached && cached.rev === rev) {
      result.push(...cached.tasks);
      return;
    }
    const tasks = extractTasksFromNote(note);
    taskCache.set(note.id, { rev, tasks });
    result.push(...tasks);
  });

  for (const key of taskCache.keys()) {
    if (!seen.has(key)) {
      taskCache.delete(key);
    }
  }

  return result;
};
