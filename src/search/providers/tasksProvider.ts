import type { Node, Space, TaskIndexRow, TaskIndexStatus } from '../../data/types';
import type { IndexedTask } from '../../tasks/taskIndex';
import { addDaysISO, getTodayISO } from '../../tasks/date';
import { getTaskNotePath } from '../../tasks/taskPath';
import { isValidISODate } from '../../views/calendarDate';
import type { PathInfo } from '../../vault/pathCache';

export type TaskSearchHit = {
  kind: 'task';
  id: string;
  title: string;
  updatedAt: number;
  noteId: string;
  blockId: string;
  noteTitle: string;
  notePath?: string;
  status: TaskIndexStatus;
  scheduledDay?: string;
  dueDay?: string;
  task: IndexedTask;
};

type TaskSearchTokens = {
  text: string;
  scheduled?: string | null;
  due?: { mode: 'eq' | 'missing' | 'overdue'; value?: string };
  status?: TaskIndexStatus;
  project?: string;
};

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

const resolveDateToken = (raw: string | undefined) => {
  if (!raw) {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === 'none' || normalized === 'null' || normalized === 'vazio') {
    return null;
  }
  if (normalized === 'today' || normalized === 'hoje') {
    return getTodayISO();
  }
  if (normalized === 'tomorrow' || normalized === 'amanha') {
    return addDaysISO(getTodayISO(), 1);
  }
  if (normalized === 'next-week' || normalized === 'nextweek') {
    return addDaysISO(getTodayISO(), 7);
  }
  return isValidISODate(normalized) ? normalized : undefined;
};

const resolveDueToken = (raw: string | undefined) => {
  if (!raw) {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === 'overdue' || normalized === 'atrasado') {
    return { mode: 'overdue' } as const;
  }
  const resolved = resolveDateToken(raw);
  if (resolved === null) {
    return { mode: 'missing' } as const;
  }
  if (resolved) {
    return { mode: 'eq', value: resolved } as const;
  }
  return undefined;
};

const parseTaskTokens = (raw: string): TaskSearchTokens => {
  const tokensRegex = /\b(scheduled|due|status|project):(?:"([^"]+)"|([^\s]+))/gi;
  let match: RegExpExecArray | null;
  let scheduledValue: string | null | undefined;
  let dueValue: TaskSearchTokens['due'];
  let statusValue: TaskIndexStatus | undefined;
  let projectValue: string | undefined;

  while ((match = tokensRegex.exec(raw)) !== null) {
    const key = match[1]?.toLowerCase();
    const value = match[2] ?? match[3] ?? '';
    if (key === 'scheduled') {
      scheduledValue = resolveDateToken(value);
    }
    if (key === 'due') {
      dueValue = resolveDueToken(value);
    }
    if (key === 'status') {
      const normalized = value.toLowerCase();
      if (normalized === 'todo') {
        statusValue = 'TODO';
      } else if (normalized === 'doing') {
        statusValue = 'DOING';
      } else if (normalized === 'done') {
        statusValue = 'DONE';
      } else if (normalized === 'waiting') {
        statusValue = 'WAITING';
      }
    }
    if (key === 'project' && value) {
      projectValue = value;
    }
  }

  const text = raw.replace(tokensRegex, ' ').replace(/\s+/g, ' ').trim();

  return {
    text,
    scheduled: scheduledValue,
    due: dueValue,
    status: statusValue,
    project: projectValue,
  };
};

const mapIndexStatus = (status: TaskIndexStatus): IndexedTask['status'] => {
  if (status === 'DOING') {
    return 'doing';
  }
  if (status === 'WAITING') {
    return 'waiting';
  }
  return 'open';
};

const mapIndexPriority = (priority: TaskIndexRow['priority']) => {
  if (priority === 'P1' || priority === 'P2' || priority === 'P3') {
    return priority;
  }
  return undefined;
};

const matchesProject = (
  row: TaskIndexRow,
  projectNeedle: string,
  nodesById: Map<string, Node>,
  pathCache: Map<string, PathInfo>,
) => {
  if (!projectNeedle) {
    return true;
  }
  const projectId = row.projectId ?? '';
  if (projectId && normalizeText(projectId).includes(projectNeedle)) {
    return true;
  }
  const projectNode = projectId ? nodesById.get(projectId) : undefined;
  if (projectNode && normalizeText(projectNode.title ?? '').includes(projectNeedle)) {
    return true;
  }
  const pathInfo = pathCache.get(row.noteId);
  const pathText = pathInfo?.pathText ?? '';
  return normalizeText(pathText).includes(projectNeedle);
};

export const searchTaskIndex = ({
  query,
  tasks,
  nodesById,
  pathCache,
  space,
  limit = 50,
}: {
  query: string;
  tasks: TaskIndexRow[];
  nodesById: Map<string, Node>;
  pathCache: Map<string, PathInfo>;
  space?: Space;
  limit?: number;
}): TaskSearchHit[] => {
  if (!query.trim()) {
    return [];
  }
  const tokens = parseTaskTokens(query);
  const textNeedle = normalizeText(tokens.text);
  const projectNeedle = tokens.project ? normalizeText(tokens.project) : '';
  const today = getTodayISO();

  const hits: TaskSearchHit[] = [];

  tasks.forEach((row) => {
    if (space && row.space !== space) {
      return;
    }
    if (tokens.status && row.status !== tokens.status) {
      return;
    }
    if (tokens.scheduled !== undefined) {
      if (tokens.scheduled === null) {
        if (row.scheduledDay) {
          return;
        }
      } else if (row.scheduledDay !== tokens.scheduled) {
        return;
      }
    }
    if (tokens.due) {
      if (tokens.due.mode === 'missing') {
        if (row.dueDay) {
          return;
        }
      } else if (tokens.due.mode === 'overdue') {
        if (!row.dueDay || row.dueDay >= today) {
          return;
        }
      } else if (tokens.due.mode === 'eq' && row.dueDay !== tokens.due.value) {
        return;
      }
    }
    if (!matchesProject(row, projectNeedle, nodesById, pathCache)) {
      return;
    }

    const note = nodesById.get(row.noteId);
    const noteTitle = note?.title ?? 'Sem titulo';
    if (textNeedle) {
      const titleMatch =
        normalizeText(row.title).includes(textNeedle) ||
        normalizeText(noteTitle).includes(textNeedle);
      if (!titleMatch) {
        return;
      }
    }

    const notePath = getTaskNotePath(pathCache.get(row.noteId));
    const isDone = row.status === 'DONE';
    const task: IndexedTask = {
      noteId: row.noteId,
      blockId: row.blockId,
      text: row.title,
      checked: isDone,
      due: row.dueDay ?? null,
      snoozedUntil: row.scheduledDay ?? null,
      originalDue: row.dueDay ?? null,
      effectiveDue: row.scheduledDay ?? row.dueDay ?? null,
      isSnoozed: Boolean(row.scheduledDay && row.scheduledDay > today),
      doneAt: row.completedAt ?? null,
      priority: mapIndexPriority(row.priority),
      status: mapIndexStatus(row.status),
      noteTitle,
      notePath,
      projectId: row.projectId,
      areaId: row.areaId,
      updatedAt: row.updatedAt,
      rev: note?.rev ?? 0,
    };

    hits.push({
      kind: 'task',
      id: row.taskId,
      title: row.title,
      updatedAt: row.updatedAt,
      noteId: row.noteId,
      blockId: row.blockId,
      noteTitle,
      notePath,
      status: row.status,
      scheduledDay: row.scheduledDay,
      dueDay: row.dueDay,
      task,
    });
  });

  return hits.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, limit);
};
