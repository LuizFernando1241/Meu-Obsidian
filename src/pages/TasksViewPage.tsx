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

import TaskList from '../components/TaskList';
import { useNotifier } from '../components/Notifier';
import { db } from '../data/db';
import { setChecklistDue, toggleChecklist } from '../data/repo';
import type { NoteNode } from '../data/types';
import { getTodayISO } from '../tasks/date';
import { buildTaskIndex, type IndexedTask } from '../tasks/taskIndex';

type OrderBy = 'due' | 'title' | 'updated';

const compareByDue = (left: IndexedTask, right: IndexedTask) => {
  if (!left.due && !right.due) {
    return left.noteTitle.localeCompare(right.noteTitle);
  }
  if (!left.due) {
    return 1;
  }
  if (!right.due) {
    return -1;
  }
  if (left.due !== right.due) {
    return left.due.localeCompare(right.due);
  }
  return left.noteTitle.localeCompare(right.noteTitle);
};

const compareByTitle = (left: IndexedTask, right: IndexedTask) => {
  const noteCompare = left.noteTitle.localeCompare(right.noteTitle);
  if (noteCompare !== 0) {
    return noteCompare;
  }
  return left.text.localeCompare(right.text);
};

const compareByUpdated = (left: IndexedTask, right: IndexedTask) =>
  right.updatedAt - left.updatedAt;

export default function TasksViewPage() {
  const navigate = useNavigate();
  const notifier = useNotifier();

  const notes =
    useLiveQuery(
      () => db.items.where('nodeType').equals('note').toArray(),
      [],
    ) ?? [];

  const [query, setQuery] = React.useState('');
  const [onlyDue, setOnlyDue] = React.useState(false);
  const [orderBy, setOrderBy] = React.useState<OrderBy>('due');

  const tasks = React.useMemo(
    () => buildTaskIndex(notes as NoteNode[]),
    [notes],
  );

  const openTasks = React.useMemo(
    () => tasks.filter((task) => !task.checked),
    [tasks],
  );

  const filtered = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    let next = openTasks;
    if (normalizedQuery) {
      next = next.filter(
        (task) =>
          task.text.toLowerCase().includes(normalizedQuery) ||
          task.noteTitle.toLowerCase().includes(normalizedQuery),
      );
    }
    if (onlyDue) {
      next = next.filter((task) => Boolean(task.due));
    }

    const sorted = [...next];
    if (orderBy === 'title') {
      sorted.sort(compareByTitle);
    } else if (orderBy === 'updated') {
      sorted.sort(compareByUpdated);
    } else {
      sorted.sort(compareByDue);
    }
    return sorted;
  }, [onlyDue, openTasks, orderBy, query]);

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

  const todayISO = getTodayISO();
  const todayCount = openTasks.filter((task) => task.due === todayISO).length;

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h4" component="h1">
          Tarefas
        </Typography>
        <Typography color="text.secondary">
          {filtered.length} abertas (hoje: {todayCount})
        </Typography>
      </Stack>

      <Stack spacing={2} direction={{ xs: 'column', md: 'row' }}>
        <TextField
          label="Buscar"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          fullWidth
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={onlyDue}
              onChange={(event) => setOnlyDue(event.target.checked)}
            />
          }
          label="Somente com vencimento"
        />
        <TextField
          select
          label="Ordenar"
          value={orderBy}
          onChange={(event) => setOrderBy(event.target.value as OrderBy)}
          sx={{ minWidth: 180 }}
        >
          <MenuItem value="due">Vencimento</MenuItem>
          <MenuItem value="title">Titulo</MenuItem>
          <MenuItem value="updated">Atualizacao</MenuItem>
        </TextField>
      </Stack>

      <TaskList
        tasks={filtered}
        emptyMessage="Nenhuma tarefa aberta."
        onToggle={handleToggle}
        onOpenNote={handleOpenNote}
        onUpdateDue={handleUpdateDue}
      />
    </Stack>
  );
}
