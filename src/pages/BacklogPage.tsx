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
import { useSpaceStore } from '../store/useSpaceStore';
import { getTodayISO } from '../tasks/date';
import type { IndexedTask } from '../tasks/taskIndex';
import { mapTaskIndexRow } from '../tasks/taskIndexView';
import { buildPathCache } from '../vault/pathCache';

export default function BacklogPage() {
  const navigate = useNavigate();
  const notifier = useNotifier();
  const space = useSpaceStore((state) => state.space);

  const allNodes = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const nodes = React.useMemo(() => filterActiveNodes(allNodes), [allNodes]);
  const notes = React.useMemo(
    () => nodes.filter((node): node is NoteNode => node.nodeType === 'note'),
    [nodes],
  );
  const notesById = React.useMemo(
    () => new Map(notes.map((note) => [note.id, note])),
    [notes],
  );
  const pathCache = React.useMemo(() => buildPathCache(nodes), [nodes]);
  const tasksIndex =
    useLiveQuery(
      () => db.tasks_index.where('space').equals(space).toArray(),
      [space],
    ) ?? [];

  const todayISO = getTodayISO();
  const tasks = React.useMemo(() => {
    return tasksIndex
      .filter((row) => !row.scheduledDay && row.status !== 'DONE')
      .map((row) =>
        mapTaskIndexRow(
          row,
          notesById.get(row.noteId),
          pathCache.get(row.noteId),
          todayISO,
        ),
      );
  }, [notesById, pathCache, tasksIndex, todayISO]);

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
      notifier.error(`Erro ao definir prazo: ${message}`);
    }
  };

  const handleSnooze = async (task: IndexedTask, snoozedUntil: string | null) => {
    try {
      await setChecklistSnooze(task.noteId, task.blockId, snoozedUntil);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao agendar: ${message}`);
    }
  };

  const handleClearSnooze = async (task: IndexedTask) => {
    try {
      await clearChecklistSnooze(task.noteId, task.blockId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao limpar agendamento: ${message}`);
    }
  };

  const handleOpenNote = (noteId: string, blockId: string) => {
    navigate(`/item/${noteId}`, { state: { highlightBlockId: blockId } });
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h4" component="h1">
          Backlog
        </Typography>
        <Typography color="text.secondary">
          {tasks.length} tarefas sem agendamento.
        </Typography>
      </Stack>

      <TaskGroupedList
        tasks={tasks}
        groupMode="path"
        storageKey="backlog"
        emptyMessage="Nenhuma tarefa no backlog."
        onToggle={handleToggle}
        onOpenNote={handleOpenNote}
        onUpdateDue={handleUpdateDue}
        onSnooze={handleSnooze}
        onClearSnooze={handleClearSnooze}
      />
    </Stack>
  );
}
