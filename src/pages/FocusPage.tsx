import React from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Stack,
  Typography,
} from '@mui/material';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';

import { useNotifier } from '../components/Notifier';
import { db } from '../data/db';
import { filterActiveNodes } from '../data/deleted';
import { setChecklistDue, setChecklistSnooze, toggleChecklist } from '../data/repo';
import {
  enqueueFocusTask,
  removeFocusTask,
  setFocusQueue,
  setFocusTask,
} from '../data/focus';
import type { NoteNode, TaskIndexRow } from '../data/types';
import { useSpaceStore } from '../store/useSpaceStore';
import { addDaysISO, getTodayISO } from '../tasks/date';
import { mapTaskIndexRow } from '../tasks/taskIndexView';
import { buildPathCache, type PathInfo } from '../vault/pathCache';

const DEFAULT_USER_ID = 'local';

type FocusEntry = {
  row: TaskIndexRow;
  task: ReturnType<typeof mapTaskIndexRow>;
};

const toFocusEntry = (
  row: TaskIndexRow,
  note: NoteNode | undefined,
  pathCache: Map<string, PathInfo>,
  todayISO: string,
): FocusEntry => ({
  row,
  task: mapTaskIndexRow(row, note, pathCache.get(row.noteId), todayISO),
});

export default function FocusPage() {
  const notifier = useNotifier();
  const navigate = useNavigate();
  const space = useSpaceStore((state) => state.space);
  const todayISO = getTodayISO();

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
  const focusState =
    useLiveQuery(
      () => db.user_state.get([DEFAULT_USER_ID, space]),
      [space],
    ) ?? null;
  const openTaskIds = React.useMemo(() => {
    const ids = new Set<string>();
    tasksIndex.forEach((row) => {
      if (row.status !== 'DONE') {
        ids.add(row.taskId);
      }
    });
    return ids;
  }, [tasksIndex]);

  const focusEntries = React.useMemo(() => {
    const map = new Map<string, FocusEntry>();
    tasksIndex.forEach((row) => {
      if (!row.taskId) {
        return;
      }
      map.set(row.taskId, toFocusEntry(row, notesById.get(row.noteId), pathCache, todayISO));
    });
    return map;
  }, [notesById, pathCache, tasksIndex, todayISO]);

  const focusEntry = focusState?.focusTaskId
    ? focusEntries.get(focusState.focusTaskId)
    : undefined;
  const focusQueue = focusState?.focusQueue ?? [];
  const queueEntries = focusQueue
    .map((taskId) => focusEntries.get(taskId))
    .filter((entry): entry is FocusEntry => Boolean(entry));

  const suggestions = React.useMemo(() => {
    const rows = tasksIndex.filter((row) => row.status !== 'DONE');
    const doing = rows.filter((row) => row.status === 'DOING');
    const today = rows.filter((row) => row.scheduledDay === todayISO);
    const backlog = rows.filter((row) => !row.scheduledDay);
    const preferred = doing.length > 0 ? doing : today.length > 0 ? today : backlog;
    return preferred
      .slice(0, 5)
      .map((row) => toFocusEntry(row, notesById.get(row.noteId), pathCache, todayISO));
  }, [notesById, pathCache, tasksIndex, todayISO]);

  React.useEffect(() => {
    if (!focusState) {
      return;
    }
    const currentFocusId = focusState.focusTaskId ?? null;
    const filteredQueue = focusQueue.filter((taskId) => openTaskIds.has(taskId));
    const queueChanged =
      filteredQueue.length !== focusQueue.length ||
      filteredQueue.some((taskId, index) => taskId !== focusQueue[index]);
    let nextFocusId = currentFocusId;
    let nextQueue = filteredQueue;
    let focusChanged = false;

    if (currentFocusId && !openTaskIds.has(currentFocusId)) {
      nextFocusId = filteredQueue[0] ?? null;
      focusChanged = true;
      if (nextFocusId) {
        nextQueue = filteredQueue.filter((taskId) => taskId !== nextFocusId);
      }
    }

    if (!queueChanged && !focusChanged) {
      return;
    }

    const updates: Promise<void>[] = [];
    if (queueChanged || nextQueue.length !== focusQueue.length) {
      updates.push(setFocusQueue(space, nextQueue));
    }
    if (nextFocusId !== currentFocusId) {
      updates.push(setFocusTask(space, nextFocusId));
    }
    if (updates.length > 0) {
      void Promise.all(updates);
    }
  }, [focusQueue, focusState, openTaskIds, space]);

  const handleOpenTask = (entry: FocusEntry) => {
    navigate(`/item/${entry.task.noteId}`, {
      state: { highlightBlockId: entry.task.blockId },
    });
  };

  const handleComplete = async (entry: FocusEntry) => {
    try {
      await toggleChecklist(entry.task.noteId, entry.task.blockId, true);
      const currentQueue = focusState?.focusQueue ?? [];
      const cleanedQueue = currentQueue.filter((taskId) => taskId !== entry.row.taskId);
      if (focusState?.focusTaskId === entry.row.taskId) {
        const nextFocusId = cleanedQueue[0] ?? null;
        const nextQueue = nextFocusId
          ? cleanedQueue.filter((taskId) => taskId !== nextFocusId)
          : cleanedQueue;
        await setFocusQueue(space, nextQueue);
        await setFocusTask(space, nextFocusId);
        return;
      }
      if (cleanedQueue.length !== currentQueue.length) {
        await setFocusQueue(space, cleanedQueue);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao concluir: ${message}`);
    }
  };

  const handleSchedulePreset = async (entry: FocusEntry, days: number) => {
    try {
      const next = addDaysISO(todayISO, days);
      await setChecklistSnooze(entry.task.noteId, entry.task.blockId, next);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao agendar: ${message}`);
    }
  };

  const handleSetDueToday = async (entry: FocusEntry) => {
    try {
      await setChecklistDue(entry.task.noteId, entry.task.blockId, todayISO);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao definir prazo: ${message}`);
    }
  };

  const handleSetFocus = async (taskId: string) => {
    try {
      await setFocusTask(space, taskId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao definir foco: ${message}`);
    }
  };

  const handleQueueAdd = async (taskId: string) => {
    try {
      await enqueueFocusTask(space, taskId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao adicionar na fila: ${message}`);
    }
  };

  const handleQueueRemove = async (taskId: string) => {
    try {
      await removeFocusTask(space, taskId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao remover da fila: ${message}`);
    }
  };

  const handleQueueClear = async () => {
    try {
      await setFocusQueue(space, []);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao limpar fila: ${message}`);
    }
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h4" component="h1">
          Agora
        </Typography>
        <Typography color="text.secondary">
          Modo de foco para executar sem distracao.
        </Typography>
      </Stack>

      {!focusEntry ? (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={1}>
              <Typography variant="h6">Sem foco definido</Typography>
              <Typography color="text.secondary">
                Escolha uma tarefa sugerida para iniciar.
              </Typography>
              {suggestions.length === 0 ? (
                <Typography color="text.secondary">
                  Nenhuma tarefa sugerida encontrada.
                </Typography>
              ) : (
                <Stack spacing={1}>
                  {suggestions.map((entry) => (
                    <Box key={entry.row.taskId} sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 1 }}>
                      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                        <Box>
                          <Typography variant="subtitle1">{entry.task.text}</Typography>
                          <Typography variant="caption" color="text.secondary">
                            {entry.task.noteTitle}
                          </Typography>
                        </Box>
                        <Stack direction="row" spacing={1}>
                          <Button size="small" onClick={() => handleSetFocus(entry.row.taskId)}>
                            Definir foco
                          </Button>
                          <Button size="small" onClick={() => handleQueueAdd(entry.row.taskId)}>
                            Fila
                          </Button>
                        </Stack>
                      </Stack>
                    </Box>
                  ))}
                </Stack>
              )}
            </Stack>
          </CardContent>
        </Card>
      ) : (
        <Card variant="outlined">
          <CardContent>
            <Stack spacing={2}>
              <Stack spacing={0.5}>
                <Typography variant="h6">{focusEntry.task.text}</Typography>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Chip label={focusEntry.task.noteTitle} onClick={() => handleOpenTask(focusEntry)} />
                  {focusEntry.task.notePath && (
                    <Typography variant="caption" color="text.secondary">
                      {focusEntry.task.notePath}
                    </Typography>
                  )}
                </Stack>
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Button variant="contained" onClick={() => handleComplete(focusEntry)}>
                  Concluir
                </Button>
                <Button variant="outlined" onClick={() => handleOpenTask(focusEntry)}>
                  Abrir contexto
                </Button>
                <Button onClick={() => handleSchedulePreset(focusEntry, 0)}>Agendar hoje</Button>
                <Button onClick={() => handleSchedulePreset(focusEntry, 1)}>Agendar amanha</Button>
                <Button onClick={() => handleSetDueToday(focusEntry)}>Prazo hoje</Button>
              </Stack>
            </Stack>
          </CardContent>
        </Card>
      )}

      <Stack spacing={1}>
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
          <Typography variant="h6">Proximas</Typography>
          {queueEntries.length > 0 && (
            <Button size="small" onClick={handleQueueClear}>
              Limpar fila
            </Button>
          )}
        </Stack>
        {queueEntries.length === 0 ? (
          <Typography color="text.secondary">Fila vazia.</Typography>
        ) : (
          <Stack spacing={1}>
            {queueEntries.map((entry) => (
              <Card key={entry.row.taskId} variant="outlined">
                <CardContent>
                  <Stack spacing={1}>
                    <Typography variant="subtitle1">{entry.task.text}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {entry.task.noteTitle}
                    </Typography>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" onClick={() => handleSetFocus(entry.row.taskId)}>
                        Tornar foco
                      </Button>
                      <Button size="small" onClick={() => handleQueueRemove(entry.row.taskId)}>
                        Remover
                      </Button>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </Stack>
    </Stack>
  );
}
