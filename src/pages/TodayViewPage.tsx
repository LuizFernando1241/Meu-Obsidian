import React from 'react';
import { Stack, Typography } from '@mui/material';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';

import TaskList from '../components/TaskList';
import { useNotifier } from '../components/Notifier';
import { db } from '../data/db';
import { setChecklistDue, toggleChecklist } from '../data/repo';
import type { NoteNode } from '../data/types';
import { getTodayISO } from '../tasks/date';
import { buildTaskIndex, type IndexedTask } from '../tasks/taskIndex';

export default function TodayViewPage() {
  const navigate = useNavigate();
  const notifier = useNotifier();

  const notes =
    useLiveQuery(
      () => db.items.where('nodeType').equals('note').toArray(),
      [],
    ) ?? [];

  const tasks = React.useMemo(
    () => buildTaskIndex(notes as NoteNode[]),
    [notes],
  );

  const todayISO = getTodayISO();
  const filtered = React.useMemo(
    () =>
      tasks
        .filter((task) => !task.checked && task.due === todayISO)
        .sort((a, b) => a.noteTitle.localeCompare(b.noteTitle)),
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

  const handleOpenNote = (noteId: string, blockId: string) => {
    navigate(`/item/${noteId}`, { state: { highlightBlockId: blockId } });
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h4" component="h1">
          Hoje
        </Typography>
        <Typography color="text.secondary">
          {filtered.length} tarefas para hoje.
        </Typography>
      </Stack>

      <TaskList
        tasks={filtered}
        emptyMessage="Nenhuma tarefa para hoje."
        onToggle={handleToggle}
        onOpenNote={handleOpenNote}
        onUpdateDue={handleUpdateDue}
      />
    </Stack>
  );
}
