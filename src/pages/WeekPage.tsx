import React from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { useLiveQuery } from 'dexie-react-hooks';
import { addDays, format, startOfWeek } from 'date-fns';
import { useNavigate } from 'react-router-dom';

import TaskList from '../components/TaskList';
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
import { useTaskSelection } from '../store/useTaskSelection';
import { getTodayISO, toISODate } from '../tasks/date';
import type { IndexedTask } from '../tasks/taskIndex';
import { mapTaskIndexRow } from '../tasks/taskIndexView';
import { buildPathCache } from '../vault/pathCache';

const PRIORITY_ORDER: Record<string, number> = {
  P1: 3,
  P2: 2,
  P3: 1,
};

const buildWeek = (base: Date) => {
  const start = startOfWeek(base, { weekStartsOn: 1 });
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
};

export default function WeekPage() {
  const navigate = useNavigate();
  const notifier = useNotifier();
  const space = useSpaceStore((state) => state.space);
  const { selectedTask, setSelectedTask } = useTaskSelection((state) => ({
    selectedTask: state.selectedTask,
    setSelectedTask: state.setSelectedTask,
  }));
  const todayISO = getTodayISO();
  const [dragOverDay, setDragOverDay] = React.useState<string | null>(null);

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

  const weekDays = React.useMemo(() => buildWeek(new Date()), []);

  const tasksByDay = React.useMemo(() => {
    const map = new Map<string, IndexedTask[]>();
    weekDays.forEach((date) => {
      map.set(toISODate(date), []);
    });
    tasksIndex.forEach((row) => {
      if (!row.scheduledDay || row.status === 'DONE') {
        return;
      }
      if (!map.has(row.scheduledDay)) {
        return;
      }
      const list = map.get(row.scheduledDay) ?? [];
      list.push(
        mapTaskIndexRow(
          row,
          notesById.get(row.noteId),
          pathCache.get(row.noteId),
          todayISO,
        ),
      );
      map.set(row.scheduledDay, list);
    });
    map.forEach((list) => {
      list.sort((a, b) => {
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
      });
    });
    return map;
  }, [notesById, pathCache, tasksIndex, todayISO, weekDays]);

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

  const handleSelectTask = (task: IndexedTask) => {
    setSelectedTask(task);
  };

  const handleDragStart = (task: IndexedTask, event: React.DragEvent<HTMLLIElement>) => {
    event.dataTransfer.setData(
      'application/x-task',
      JSON.stringify({ noteId: task.noteId, blockId: task.blockId }),
    );
    event.dataTransfer.effectAllowed = 'move';
  };

  const handleDropOnDay = async (
    event: React.DragEvent<HTMLDivElement>,
    isoDay: string,
  ) => {
    event.preventDefault();
    setDragOverDay(null);
    const raw =
      event.dataTransfer.getData('application/x-task') ||
      event.dataTransfer.getData('text/plain');
    if (!raw) {
      return;
    }
    try {
      const payload = JSON.parse(raw) as { noteId?: string; blockId?: string };
      if (!payload.noteId || !payload.blockId) {
        return;
      }
      await setChecklistSnooze(payload.noteId, payload.blockId, isoDay);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao mover tarefa: ${message}`);
    }
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h4" component="h1">
          Semana
        </Typography>
        <Typography color="text.secondary">
          Planejamento por dia usando agendamentos.
        </Typography>
      </Stack>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        {weekDays.map((date) => {
          const iso = toISODate(date);
          const dayTasks = tasksByDay.get(iso) ?? [];
          return (
            <Box
              key={iso}
              sx={{
                flex: 1,
                minWidth: { xs: '100%', md: 180 },
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                p: 2,
                bgcolor: dragOverDay === iso ? 'action.hover' : 'background.paper',
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverDay(iso);
              }}
              onDragLeave={() => setDragOverDay(null)}
              onDrop={(event) => void handleDropOnDay(event, iso)}
            >
              <Typography variant="subtitle1">
                {format(date, 'EEE dd/MM')}
              </Typography>
              <TaskList
                tasks={dayTasks}
                emptyMessage="Sem tarefas."
                onToggle={handleToggle}
                onOpenNote={handleOpenNote}
                onUpdateDue={handleUpdateDue}
                onSnooze={handleSnooze}
                onClearSnooze={handleClearSnooze}
                onSelectTask={handleSelectTask}
                selectedTaskId={
                  selectedTask ? `${selectedTask.noteId}:${selectedTask.blockId}` : undefined
                }
                onDragStartTask={handleDragStart}
              />
            </Box>
          );
        })}
      </Stack>
    </Stack>
  );
}
