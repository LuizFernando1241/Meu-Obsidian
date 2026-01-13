import type { NoteNode, TaskIndexRow, TaskIndexStatus, TaskPriority } from '../data/types';
import type { IndexedTask } from './taskIndex';
import { getTodayISO } from './date';
import { getTaskNotePath } from './taskPath';
import type { PathInfo } from '../vault/pathCache';

const mapStatus = (status: TaskIndexStatus | undefined): IndexedTask['status'] => {
  if (status === 'DOING') {
    return 'doing';
  }
  if (status === 'WAITING') {
    return 'waiting';
  }
  return 'open';
};

const mapPriority = (priority: TaskPriority | undefined): IndexedTask['priority'] => {
  if (priority === 'P1' || priority === 'P2' || priority === 'P3') {
    return priority;
  }
  return undefined;
};

export const mapTaskIndexRow = (
  row: TaskIndexRow,
  note: NoteNode | undefined,
  pathInfo: PathInfo | undefined,
  todayISO = getTodayISO(),
): IndexedTask => {
  const noteTitle = note?.title?.trim() ? note.title : 'Sem titulo';
  const scheduledDay = row.scheduledDay ?? null;
  const dueDay = row.dueDay ?? null;
  const effectiveDue = scheduledDay || dueDay || null;
  const isSnoozed = Boolean(scheduledDay && scheduledDay > todayISO);
  return {
    noteId: row.noteId,
    blockId: row.blockId,
    text: row.title,
    checked: row.status === 'DONE',
    due: dueDay,
    snoozedUntil: scheduledDay,
    originalDue: dueDay,
    effectiveDue,
    isSnoozed,
    doneAt: row.completedAt ?? null,
    createdAt: row.createdAt,
    priority: mapPriority(row.priority),
    status: mapStatus(row.status),
    recurrence: undefined,
    isNextAction: row.isNextAction,
    projectId: row.projectId,
    areaId: row.areaId,
    noteTitle,
    notePath: getTaskNotePath(pathInfo),
    updatedAt: row.updatedAt,
    rev: note?.rev ?? 0,
  };
};
