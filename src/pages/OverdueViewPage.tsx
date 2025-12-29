import React from 'react';
import { Stack, Typography } from '@mui/material';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';

import TaskGroupedList from '../components/tasks/TaskGroupedList';
import { useNotifier } from '../components/Notifier';
import { db } from '../data/db';
import { filterActiveNodes } from '../data/deleted';
import {
  clearChecklistSnooze,
  setChecklistDue,
  setChecklistSnooze,
  toggleChecklist,
} from '../data/repo';
import type { NoteNode } from '../data/types';
import { getTodayISO } from '../tasks/date';
import { buildTaskIndex, type IndexedTask } from '../tasks/taskIndex';
import { getTaskNotePath } from '../tasks/taskPath';
import { buildPathCache } from '../vault/pathCache';

const PRIORITY_ORDER: Record<string, number> = {
  P1: 3,
  P2: 2,
  P3: 1,
};

export default function OverdueViewPage() {
  const navigate = useNavigate();
  const notifier = useNotifier();

  const allNodes = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const nodes = React.useMemo(() => filterActiveNodes(allNodes), [allNodes]);
  const notes = React.useMemo(
    () => nodes.filter((node): node is NoteNode => node.nodeType === 'note'),
    [nodes],
  );
  const pathCache = React.useMemo(() => buildPathCache(nodes), [nodes]);

  const todayISO = getTodayISO();
  const tasks = React.useMemo(
    () =>
      buildTaskIndex(notes as NoteNode[], todayISO).map((task) => ({
        ...task,
        notePath: getTaskNotePath(pathCache.get(task.noteId)),
      })),
    [notes, pathCache, todayISO],
  );

  const filtered = React.useMemo(
    () =>
      tasks
        .filter(
          (task) => !task.checked && task.effectiveDue && task.effectiveDue < todayISO,
        )
        .sort((a, b) => {
          const dueCompare = (a.effectiveDue ?? '').localeCompare(b.effectiveDue ?? '');
          if (dueCompare !== 0) {
            return dueCompare;
          }
          const leftPriority = PRIORITY_ORDER[a.priority ?? ''] ?? 0;
          const rightPriority = PRIORITY_ORDER[b.priority ?? ''] ?? 0;
          if (leftPriority !== rightPriority) {
            return rightPriority - leftPriority;
          }
          const noteCompare = a.noteTitle.localeCompare(b.noteTitle);
          if (noteCompare !== 0) {
            return noteCompare;
          }
          return a.text.localeCompare(b.text);
        }),
    [tasks, todayISO],
  );

  const handleToggle = async (task: IndexedTask, checked: boolean) => {
    try {
      await toggleChecklist(task.noteId, task.blockId, checked);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao atualizar tarefa: ${message}`);
    }
  };

  const handleUpdateDue = async (task: IndexedTask, due: string | null) => {
    try {
      await setChecklistDue(task.noteId, task.blockId, due);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao definir vencimento: ${message}`);
    }
  };

  const handleSnooze = async (task: IndexedTask, snoozedUntil: string | null) => {
    try {
      await setChecklistSnooze(task.noteId, task.blockId, snoozedUntil);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao definir snooze: ${message}`);
    }
  };

  const handleClearSnooze = async (task: IndexedTask) => {
    try {
      await clearChecklistSnooze(task.noteId, task.blockId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao limpar snooze: ${message}`);
    }
  };

  const handleOpenNote = (noteId: string, blockId: string) => {
    navigate(`/item/${noteId}`, { state: { highlightBlockId: blockId } });
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h4" component="h1">
          Atrasadas
        </Typography>
        <Typography color="text.secondary">
          {filtered.length} tarefas atrasadas.
        </Typography>
      </Stack>

      <TaskGroupedList
        tasks={filtered}
        groupMode="path"
        storageKey="overdue"
        emptyMessage="Nenhuma tarefa atrasada."
        onToggle={handleToggle}
        onOpenNote={handleOpenNote}
        onUpdateDue={handleUpdateDue}
        onSnooze={handleSnooze}
        onClearSnooze={handleClearSnooze}
      />
    </Stack>
  );
}
