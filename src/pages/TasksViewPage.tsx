import React from 'react';
import {
  Checkbox,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
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
  updateChecklistMeta,
} from '../data/repo';
import type { NoteNode } from '../data/types';
import { addDaysISO, getTodayISO } from '../tasks/date';
import { buildTaskIndex, type IndexedTask } from '../tasks/taskIndex';
import { getTaskNotePath } from '../tasks/taskPath';
import { buildPathCache } from '../vault/pathCache';

type DueFilter = 'all' | 'none' | 'has' | 'overdue' | 'today' | 'next7';
type StatusFilter = 'all' | 'open' | 'doing' | 'waiting';
type PriorityFilter = 'all' | 'P1' | 'P2' | 'P3';
type GroupMode = 'path' | 'note' | 'none';

const PRIORITY_ORDER: Record<string, number> = {
  P1: 3,
  P2: 2,
  P3: 1,
};

const compareByEffectiveDue = (left: IndexedTask, right: IndexedTask) => {
  const leftDue = left.effectiveDue ?? null;
  const rightDue = right.effectiveDue ?? null;
  if (!leftDue && !rightDue) {
    const noteCompare = left.noteTitle.localeCompare(right.noteTitle);
    if (noteCompare !== 0) {
      return noteCompare;
    }
    return left.text.localeCompare(right.text);
  }
  if (!leftDue) {
    return 1;
  }
  if (!rightDue) {
    return -1;
  }
  if (leftDue !== rightDue) {
    return leftDue.localeCompare(rightDue);
  }
  const leftPriority = PRIORITY_ORDER[left.priority ?? ''] ?? 0;
  const rightPriority = PRIORITY_ORDER[right.priority ?? ''] ?? 0;
  if (leftPriority !== rightPriority) {
    return rightPriority - leftPriority;
  }
  const noteCompare = left.noteTitle.localeCompare(right.noteTitle);
  if (noteCompare !== 0) {
    return noteCompare;
  }
  return left.text.localeCompare(right.text);
};

export default function TasksViewPage() {
  const navigate = useNavigate();
  const notifier = useNotifier();

  const allNodes = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const nodes = React.useMemo(() => filterActiveNodes(allNodes), [allNodes]);
  const notes = React.useMemo(
    () => nodes.filter((node): node is NoteNode => node.nodeType === 'note'),
    [nodes],
  );
  const pathCache = React.useMemo(() => buildPathCache(nodes), [nodes]);

  const [query, setQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [priorityFilter, setPriorityFilter] = React.useState<PriorityFilter>('all');
  const [dueFilter, setDueFilter] = React.useState<DueFilter>('all');
  const [includeSnoozed, setIncludeSnoozed] = React.useState(false);
  const [showCompleted, setShowCompleted] = React.useState(false);
  const [groupMode, setGroupMode] = React.useState<GroupMode>('path');

  const todayISO = getTodayISO();
  const nextWeekISO = addDaysISO(todayISO, 7);
  const tasks = React.useMemo(
    () =>
      buildTaskIndex(notes as NoteNode[], todayISO).map((task) => ({
        ...task,
        notePath: getTaskNotePath(pathCache.get(task.noteId)),
      })),
    [notes, pathCache, todayISO],
  );

  const openTasks = React.useMemo(
    () => tasks.filter((task) => !task.checked),
    [tasks],
  );

  const filtered = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    let next = showCompleted ? tasks : openTasks;
    if (!includeSnoozed) {
      next = next.filter((task) => !task.isSnoozed);
    }
    if (normalizedQuery) {
      next = next.filter(
        (task) =>
          task.text.toLowerCase().includes(normalizedQuery) ||
          task.noteTitle.toLowerCase().includes(normalizedQuery),
      );
    }
    if (statusFilter !== 'all') {
      next = next.filter((task) => (task.status ?? 'open') === statusFilter);
    }
    if (priorityFilter !== 'all') {
      next = next.filter((task) => task.priority === priorityFilter);
    }
    if (dueFilter !== 'all') {
      next = next.filter((task) => {
        const effectiveDue = task.effectiveDue ?? null;
        if (dueFilter === 'none') {
          return !effectiveDue;
        }
        if (dueFilter === 'has') {
          return Boolean(effectiveDue);
        }
        if (dueFilter === 'overdue') {
          return Boolean(effectiveDue && effectiveDue < todayISO);
        }
        if (dueFilter === 'today') {
          return effectiveDue === todayISO;
        }
        if (dueFilter === 'next7') {
          return Boolean(
            effectiveDue && effectiveDue >= todayISO && effectiveDue <= nextWeekISO,
          );
        }
        return true;
      });
    }
    const sorted = [...next];
    sorted.sort(compareByEffectiveDue);
    return sorted;
  }, [
    dueFilter,
    includeSnoozed,
    nextWeekISO,
    openTasks,
    priorityFilter,
    query,
    showCompleted,
    statusFilter,
    tasks,
    todayISO,
  ]);

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

  const handleUpdateStatus = async (
    task: IndexedTask,
    status: 'open' | 'doing' | 'waiting',
  ) => {
    try {
      await updateChecklistMeta(task.noteId, task.blockId, { status });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao atualizar status: ${message}`);
    }
  };

  const handleUpdatePriority = async (
    task: IndexedTask,
    priority: 'P1' | 'P2' | 'P3' | null,
  ) => {
    try {
      await updateChecklistMeta(task.noteId, task.blockId, { priority: priority ?? undefined });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao atualizar prioridade: ${message}`);
    }
  };

  const handleUpdateRecurrence = async (
    task: IndexedTask,
    recurrence: 'weekly' | 'monthly' | null,
  ) => {
    try {
      await updateChecklistMeta(task.noteId, task.blockId, { recurrence: recurrence ?? undefined });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao atualizar recorrencia: ${message}`);
    }
  };

  const handleSnooze = async (task: IndexedTask, snoozedUntil: string | null) => {
    try {
      await setChecklistSnooze(task.noteId, task.blockId, snoozedUntil);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao definir adiamento: ${message}`);
    }
  };

  const handleClearSnooze = async (task: IndexedTask) => {
    try {
      await clearChecklistSnooze(task.noteId, task.blockId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao limpar adiamento: ${message}`);
    }
  };

  const handleOpenNote = (noteId: string, blockId: string) => {
    navigate(`/item/${noteId}`, { state: { highlightBlockId: blockId } });
  };

  const todayCount = openTasks.filter((task) => task.effectiveDue === todayISO).length;

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h4" component="h1">
          Tarefas
        </Typography>
        <Typography color="text.secondary">
          {showCompleted
            ? `${filtered.length} tarefas (abertas: ${openTasks.length}, hoje: ${todayCount})`
            : `${filtered.length} abertas (hoje: ${todayCount})`}
        </Typography>
      </Stack>

      <Stack
        spacing={2}
        direction={{ xs: 'column', md: 'row' }}
        sx={{ flexWrap: 'wrap', alignItems: { xs: 'stretch', md: 'center' } }}
      >
        <TextField
          label="Buscar"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          fullWidth
        />
        <TextField
          select
          label="Status"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="all">Todos</MenuItem>
          <MenuItem value="open">Aberta</MenuItem>
          <MenuItem value="doing">Em andamento</MenuItem>
          <MenuItem value="waiting">Aguardando</MenuItem>
        </TextField>
        <TextField
          select
          label="Prioridade"
          value={priorityFilter}
          onChange={(event) => setPriorityFilter(event.target.value as PriorityFilter)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="all">Todas</MenuItem>
          <MenuItem value="P1">P1</MenuItem>
          <MenuItem value="P2">P2</MenuItem>
          <MenuItem value="P3">P3</MenuItem>
        </TextField>
        <TextField
          select
          label="Vencimento"
          value={dueFilter}
          onChange={(event) => setDueFilter(event.target.value as DueFilter)}
          sx={{ minWidth: 200 }}
        >
          <MenuItem value="all">Todos</MenuItem>
          <MenuItem value="none">Sem vencimento</MenuItem>
          <MenuItem value="has">Com vencimento</MenuItem>
          <MenuItem value="overdue">Atrasadas</MenuItem>
          <MenuItem value="today">Hoje</MenuItem>
          <MenuItem value="next7">Proximos 7 dias</MenuItem>
        </TextField>
        <TextField
          select
          label="Agrupar"
          value={groupMode}
          onChange={(event) => setGroupMode(event.target.value as GroupMode)}
          sx={{ minWidth: 160 }}
        >
          <MenuItem value="path">Por pasta</MenuItem>
          <MenuItem value="note">Por nota</MenuItem>
          <MenuItem value="none">Sem grupo</MenuItem>
        </TextField>
        <FormControlLabel
          control={
            <Checkbox
              checked={includeSnoozed}
              onChange={(event) => setIncludeSnoozed(event.target.checked)}
            />
          }
          label="Incluir adiadas"
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={showCompleted}
              onChange={(event) => setShowCompleted(event.target.checked)}
            />
          }
          label="Mostrar concluidas"
        />
      </Stack>

      <TaskGroupedList
        tasks={filtered}
        groupMode={groupMode}
        storageKey="tasks"
        emptyMessage="Nenhuma tarefa aberta."
        onToggle={handleToggle}
        onOpenNote={handleOpenNote}
        onUpdateDue={handleUpdateDue}
        onUpdateStatus={handleUpdateStatus}
        onUpdatePriority={handleUpdatePriority}
        onUpdateRecurrence={handleUpdateRecurrence}
        onSnooze={handleSnooze}
        onClearSnooze={handleClearSnooze}
        showMetaControls
      />
    </Stack>
  );
}
