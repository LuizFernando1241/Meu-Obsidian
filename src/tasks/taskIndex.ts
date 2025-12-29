import type { Block, NoteNode } from '../data/types';
import { getTodayISO } from './date';

export type IndexedTask = {
  noteId: string;
  blockId: string;
  text: string;
  checked: boolean;
  due?: string | null;
  snoozedUntil?: string | null;
  originalDue?: string | null;
  effectiveDue?: string | null;
  isSnoozed?: boolean;
  doneAt?: number | null;
  priority?: 'P1' | 'P2' | 'P3';
  status?: 'open' | 'doing' | 'waiting';
  recurrence?: 'weekly' | 'monthly';
  noteTitle: string;
  notePath?: string;
  updatedAt: number;
  rev: number;
};

const taskCache = new Map<
  string,
  { rev: number; tasks: IndexedTask[]; todayISO: string }
>();

const normalizeTitle = (title: string | undefined) => (title?.trim() ? title.trim() : 'Sem titulo');

const isChecklistBlock = (block: Block) => block.type === 'checklist';

const mapLegacyPriority = (value?: number | null) => {
  if (value === 1) {
    return 'P1';
  }
  if (value === 2) {
    return 'P2';
  }
  if (value === 3) {
    return 'P3';
  }
  return undefined;
};

export const extractTasksFromNote = (note: NoteNode, todayISO: string): IndexedTask[] => {
  const noteTitle = normalizeTitle(note.title);
  const tasks: IndexedTask[] = [];
  const content = Array.isArray(note.content) ? note.content : [];

  content.forEach((block) => {
    if (!isChecklistBlock(block)) {
      return;
    }
    const meta = block.meta;
    const due = block.due ?? null;
    const snoozedUntil = block.snoozedUntil ?? null;
    const originalDue = block.originalDue ?? null;
    const effectiveDue = snoozedUntil || due || null;
    const isSnoozed = Boolean(snoozedUntil && snoozedUntil > todayISO);
    tasks.push({
      noteId: note.id,
      blockId: block.id,
      text: block.text ?? '',
      checked: block.checked ?? false,
      due,
      snoozedUntil,
      originalDue,
      effectiveDue,
      isSnoozed,
      doneAt: block.doneAt ?? null,
      priority: meta?.priority ?? mapLegacyPriority(block.priority),
      status: meta?.status ?? 'open',
      recurrence: meta?.recurrence,
      noteTitle,
      updatedAt: note.updatedAt,
      rev: note.rev ?? 0,
    });
  });

  return tasks;
};

export const buildTaskIndex = (
  notes: NoteNode[],
  todayISO: string = getTodayISO(),
): IndexedTask[] => {
  const result: IndexedTask[] = [];
  const seen = new Set<string>();

  notes.forEach((note) => {
    seen.add(note.id);
    const rev = note.rev ?? 0;
    const cached = taskCache.get(note.id);
    if (cached && cached.rev === rev && cached.todayISO === todayISO) {
      result.push(...cached.tasks);
      return;
    }
    const tasks = extractTasksFromNote(note, todayISO);
    taskCache.set(note.id, { rev, tasks, todayISO });
    result.push(...tasks);
  });

  for (const key of taskCache.keys()) {
    if (!seen.has(key)) {
      taskCache.delete(key);
    }
  }

  return result;
};
