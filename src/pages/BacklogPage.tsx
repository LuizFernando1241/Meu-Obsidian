import React from 'react';
import { MenuItem, Stack, TextField, Typography } from '@mui/material';
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
import { setTaskNextAction } from '../tasks/taskIndexStore';
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
  const [groupMode, setGroupMode] = React.useState<'project' | 'area' | 'path' | 'none'>(
    'project',
  );
  const labelLookup = React.useMemo(
    () => new Map(nodes.map((node) => [node.id, node.title || node.id])),
    [nodes],
  );
  const agedCutoffMs = React.useMemo(
    () => Date.now() - 14 * 24 * 60 * 60 * 1000,
    [],
  );
  const agedCount = React.useMemo(
    () =>
      tasks.filter(
        (task) => typeof task.createdAt === 'number' && task.createdAt < agedCutoffMs,
      ).length,
    [agedCutoffMs, tasks],
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

  const handleUpdateNextAction = async (task: IndexedTask, next: boolean) => {
    try {
      await setTaskNextAction(task.noteId, task.blockId, next);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao atualizar next action: ${message}`);
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
          {tasks.length} tarefas sem agendamento
          {agedCount > 0 ? ` • ${agedCount} envelhecidas` : ''}.
        </Typography>
      </Stack>

      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
        <TextField
          select
          label="Agrupar"
          value={groupMode}
          onChange={(event) =>
            setGroupMode(event.target.value as 'project' | 'area' | 'path' | 'none')
          }
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="project">Por projeto</MenuItem>
          <MenuItem value="area">Por area</MenuItem>
          <MenuItem value="path">Por pasta</MenuItem>
          <MenuItem value="none">Sem grupo</MenuItem>
        </TextField>
      </Stack>

      <TaskGroupedList
        tasks={tasks}
        groupMode={groupMode}
        storageKey="backlog"
        emptyMessage="Nenhuma tarefa no backlog."
        onToggle={handleToggle}
        onOpenNote={handleOpenNote}
        onUpdateDue={handleUpdateDue}
        onSnooze={handleSnooze}
        onClearSnooze={handleClearSnooze}
        onUpdateNextAction={handleUpdateNextAction}
        groupLabelLookup={labelLookup}
        emptyGroupLabel={groupMode === 'area' ? 'Sem area' : 'Sem projeto'}
        showAged
        agedCutoffMs={agedCutoffMs}
      />
    </Stack>
  );
}
