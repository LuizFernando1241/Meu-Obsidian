import React from 'react';
import {
  Box,
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from '@mui/material';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';

import DateField from '../components/DateField';
import { useNotifier } from '../components/Notifier';
import { db } from '../data/db';
import { filterActiveNodes } from '../data/deleted';
import { setFocusTask } from '../data/focus';
import {
  clearChecklistSnooze,
  setChecklistDue,
  setChecklistSnooze,
  toggleChecklist,
} from '../data/repo';
import type { NoteNode, TaskIndexRow } from '../data/types';
import { useSpaceStore } from '../store/useSpaceStore';
import { addDaysISO, getTodayISO } from '../tasks/date';
import type { IndexedTask } from '../tasks/taskIndex';
import { mapTaskIndexRow } from '../tasks/taskIndexView';
import { buildPathCache, type PathInfo } from '../vault/pathCache';

const PRIORITY_ORDER: Record<string, number> = {
  P1: 3,
  P2: 2,
  P3: 1,
};

const sortByPriority = (left: IndexedTask, right: IndexedTask) => {
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

const DEFAULT_USER_ID = 'local';

type CockpitEntry = {
  row: TaskIndexRow;
  task: IndexedTask;
};

const toEntry = (
  row: TaskIndexRow,
  note: NoteNode | undefined,
  pathCache: Map<string, PathInfo>,
  todayISO: string,
): CockpitEntry => ({
  row,
  task: mapTaskIndexRow(row, note, pathCache.get(row.noteId), todayISO),
});

const sortByDueThenPriority = (left: CockpitEntry, right: CockpitEntry) => {
  const leftDue = left.row.dueDay ?? '';
  const rightDue = right.row.dueDay ?? '';
  if (leftDue !== rightDue) {
    return leftDue.localeCompare(rightDue);
  }
  return sortByPriority(left.task, right.task);
};

export default function HomeCockpitPage() {
  const navigate = useNavigate();
  const notifier = useNotifier();
  const space = useSpaceStore((state) => state.space);
  const todayISO = getTodayISO();

  const allNodes = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const nodes = React.useMemo(() => filterActiveNodes(allNodes), [allNodes]);
  const notes = React.useMemo(
    () => nodes.filter((node): node is NoteNode => node.nodeType === 'note'),
    [nodes],
  );
  const eventsToday = React.useMemo(() => {
    return notes.filter((note) => {
      const props =
        note.props && typeof note.props === 'object'
          ? (note.props as Record<string, unknown>)
          : undefined;
      const eventDate =
        props && typeof props.eventDate === 'string' ? props.eventDate : null;
      return eventDate === todayISO;
    });
  }, [notes, todayISO]);
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
  const inboxItems =
    useLiveQuery(
      () => db.inbox_items.where('[space+status]').equals([space, 'OPEN']).toArray(),
      [space],
    ) ?? [];
  const focusState =
    useLiveQuery(
      () => db.user_state.get([DEFAULT_USER_ID, space]),
      [space],
    ) ?? null;

  const openRows = React.useMemo(
    () => tasksIndex.filter((row) => row.status !== 'DONE'),
    [tasksIndex],
  );

  const entries = React.useMemo(
    () =>
      openRows.map((row) => toEntry(row, notesById.get(row.noteId), pathCache, todayISO)),
    [notesById, openRows, pathCache, todayISO],
  );
  const entryById = React.useMemo(() => {
    const map = new Map<string, CockpitEntry>();
    entries.forEach((entry) => map.set(entry.row.taskId, entry));
    return map;
  }, [entries]);

  const todayEntries = React.useMemo(
    () => entries.filter((entry) => entry.row.scheduledDay === todayISO),
    [entries, todayISO],
  );
  const overdueEntries = React.useMemo(
    () =>
      entries.filter((entry) => entry.row.dueDay && entry.row.dueDay < todayISO),
    [entries, todayISO],
  );
  const dueTodayEntries = React.useMemo(
    () => entries.filter((entry) => entry.row.dueDay === todayISO),
    [entries, todayISO],
  );
  const criticalEntries = React.useMemo(() => {
    const seen = new Set<string>();
    const combined = [...overdueEntries, ...dueTodayEntries].filter((entry) => {
      if (seen.has(entry.row.taskId)) {
        return false;
      }
      seen.add(entry.row.taskId);
      return true;
    });
    return combined.sort(sortByDueThenPriority);
  }, [dueTodayEntries, overdueEntries]);
  const weekEndISO = addDaysISO(todayISO, 7);
  const weekEntries = React.useMemo(
    () =>
      entries.filter(
        (entry) =>
          entry.row.scheduledDay &&
          entry.row.scheduledDay > todayISO &&
          entry.row.scheduledDay <= weekEndISO,
      ),
    [entries, todayISO, weekEndISO],
  );
  const backlogEntries = React.useMemo(
    () => entries.filter((entry) => !entry.row.scheduledDay),
    [entries],
  );
  const focusEntry = focusState?.focusTaskId
    ? entryById.get(focusState.focusTaskId)
    : undefined;
  const suggestions = React.useMemo(() => {
    const doing = entries.filter((entry) => entry.row.status === 'DOING');
    const preferred =
      doing.length > 0
        ? doing
        : todayEntries.length > 0
          ? todayEntries
          : backlogEntries;
    return preferred.slice(0, 3);
  }, [backlogEntries, entries, todayEntries]);

  const [scheduleAnchor, setScheduleAnchor] = React.useState<HTMLElement | null>(null);
  const [scheduleEntry, setScheduleEntry] = React.useState<CockpitEntry | null>(null);
  const [scheduleDialogOpen, setScheduleDialogOpen] = React.useState(false);
  const [scheduleValue, setScheduleValue] = React.useState('');
  const [dueAnchor, setDueAnchor] = React.useState<HTMLElement | null>(null);
  const [dueEntry, setDueEntry] = React.useState<CockpitEntry | null>(null);
  const [dueDialogOpen, setDueDialogOpen] = React.useState(false);
  const [dueValue, setDueValue] = React.useState('');

  const handleComplete = async (entry: CockpitEntry) => {
    try {
      await toggleChecklist(entry.task.noteId, entry.task.blockId, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao concluir tarefa: ${message}`);
    }
  };

  const handleUpdateDue = async (entry: CockpitEntry, due: string | null) => {
    try {
      await setChecklistDue(entry.task.noteId, entry.task.blockId, due);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao definir prazo: ${message}`);
    }
  };

  const handleSnooze = async (entry: CockpitEntry, snoozedUntil: string | null) => {
    try {
      await setChecklistSnooze(entry.task.noteId, entry.task.blockId, snoozedUntil);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao definir agendamento: ${message}`);
    }
  };

  const handleClearSnooze = async (entry: CockpitEntry) => {
    try {
      await clearChecklistSnooze(entry.task.noteId, entry.task.blockId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao limpar agendamento: ${message}`);
    }
  };

  const handleSchedulePreset = async (entry: CockpitEntry, days: number) => {
    try {
      const next = addDaysISO(todayISO, days);
      await setChecklistSnooze(entry.task.noteId, entry.task.blockId, next);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao agendar: ${message}`);
    }
  };

  const handleSetFocus = async (entry: CockpitEntry, openFocus = true) => {
    try {
      await setFocusTask(space, entry.row.taskId);
      if (openFocus) {
        navigate('/focus');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao definir foco: ${message}`);
    }
  };

  const handleOpenScheduleMenu = (entry: CockpitEntry, anchor: HTMLElement) => {
    setScheduleEntry(entry);
    setScheduleAnchor(anchor);
  };

  const handleOpenDueMenu = (entry: CockpitEntry, anchor: HTMLElement) => {
    setDueEntry(entry);
    setDueAnchor(anchor);
  };

  const handleOpenScheduleDialog = () => {
    if (!scheduleEntry) {
      return;
    }
    setScheduleValue(scheduleEntry.row.scheduledDay ?? '');
    setScheduleDialogOpen(true);
    setScheduleAnchor(null);
  };

  const handleOpenDueDialog = () => {
    if (!dueEntry) {
      return;
    }
    setDueValue(dueEntry.row.dueDay ?? '');
    setDueDialogOpen(true);
    setDueAnchor(null);
  };

  const handleSaveScheduleDialog = async () => {
    if (!scheduleEntry) {
      return;
    }
    await handleSnooze(scheduleEntry, scheduleValue ? scheduleValue : null);
    setScheduleDialogOpen(false);
  };

  const handleSaveDueDialog = async () => {
    if (!dueEntry) {
      return;
    }
    await handleUpdateDue(dueEntry, dueValue ? dueValue : null);
    setDueDialogOpen(false);
  };

  const handleOpenNote = (entry: CockpitEntry) => {
    navigate(`/item/${entry.task.noteId}`, {
      state: { highlightBlockId: entry.task.blockId },
    });
  };

  const renderTaskRow = (entry: CockpitEntry, showQuickSchedule = false) => {
    const isOverdue = Boolean(entry.row.dueDay && entry.row.dueDay < todayISO);
    return (
      <Box
        key={entry.row.taskId}
        sx={{
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 1,
          px: 2,
          py: 1.5,
        }}
      >
        <Stack spacing={1}>
          <Stack spacing={0.5}>
            <Typography variant="subtitle1">{entry.task.text}</Typography>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Chip
                size="small"
                label={entry.task.noteTitle}
                onClick={() => handleOpenNote(entry)}
              />
              {entry.task.notePath && (
                <Typography variant="caption" color="text.secondary">
                  {entry.task.notePath}
                </Typography>
              )}
              {entry.row.dueDay && (
                <Chip
                  size="small"
                  color={isOverdue ? 'error' : 'default'}
                  label={`Prazo ${entry.row.dueDay}`}
                />
              )}
              {entry.row.scheduledDay && (
                <Chip size="small" label={`Agendada ${entry.row.scheduledDay}`} />
              )}
            </Stack>
          </Stack>
          <Stack direction="row" spacing={1} flexWrap="wrap">
            <Button size="small" variant="contained" onClick={() => handleComplete(entry)}>
              Concluir
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={(event) => handleOpenScheduleMenu(entry, event.currentTarget)}
            >
              Agendar
            </Button>
            <Button
              size="small"
              variant="outlined"
              onClick={(event) => handleOpenDueMenu(entry, event.currentTarget)}
            >
              Prazo
            </Button>
            <Button size="small" onClick={() => handleSetFocus(entry)}>
              Focar
            </Button>
          </Stack>
          {showQuickSchedule && (
            <Stack direction="row" spacing={1} flexWrap="wrap">
              <Button size="small" onClick={() => handleSchedulePreset(entry, 0)}>
                Agendar hoje
              </Button>
              <Button size="small" onClick={() => handleSchedulePreset(entry, 1)}>
                Agendar amanha
              </Button>
              <Button size="small" onClick={() => handleSchedulePreset(entry, 7)}>
                Agendar semana
              </Button>
            </Stack>
          )}
        </Stack>
      </Box>
    );
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h4" component="h1">
          Hoje
        </Typography>
        <Typography color="text.secondary">
          {todayEntries.length} tarefas agendadas para hoje.
        </Typography>
      </Stack>

      <Card>
        <CardHeader title="Agora" />
        <CardContent>
          {focusEntry ? (
            <Stack spacing={2}>
              <Stack spacing={0.5}>
                <Typography variant="subtitle1">{focusEntry.task.text}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {focusEntry.task.noteTitle}
                </Typography>
              </Stack>
              <Stack direction="row" spacing={1} flexWrap="wrap">
                <Button variant="contained" onClick={() => navigate('/focus')}>
                  Abrir Foco
                </Button>
                <Button variant="outlined" onClick={() => handleOpenNote(focusEntry)}>
                  Abrir contexto
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Stack spacing={2}>
              <Typography color="text.secondary">
                Nenhum foco ativo. Sugestoes para iniciar:
              </Typography>
              {suggestions.length === 0 ? (
                <Typography color="text.secondary">Nenhuma sugestao encontrada.</Typography>
              ) : (
                <Stack spacing={1}>
                  {suggestions.map((entry) => (
                    <Box key={entry.row.taskId} sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                      <Box>
                        <Typography variant="subtitle2">{entry.task.text}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {entry.task.noteTitle}
                        </Typography>
                      </Box>
                      <Button size="small" onClick={() => handleSetFocus(entry)}>
                        Focar
                      </Button>
                    </Box>
                  ))}
                </Stack>
              )}
              <Button
                variant="contained"
                onClick={() => {
                  if (suggestions[0]) {
                    void handleSetFocus(suggestions[0]);
                  } else {
                    navigate('/focus');
                  }
                }}
              >
                Entrar em Foco
              </Button>
            </Stack>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Critico" />
        <CardContent>
          {criticalEntries.length === 0 ? (
            <Typography color="text.secondary">Nada critico hoje.</Typography>
          ) : (
            <Stack spacing={1}>
              {criticalEntries.slice(0, 8).map((entry) => renderTaskRow(entry))}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Compromissos de hoje" />
        <CardContent>
          {eventsToday.length === 0 ? (
            <Typography color="text.secondary">Sem compromissos cadastrados.</Typography>
          ) : (
            <Stack spacing={1}>
              {eventsToday.map((note) => (
                <Box
                  key={note.id}
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 1,
                    px: 2,
                    py: 1.5,
                  }}
                >
                  <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                    <Typography variant="subtitle1">{note.title}</Typography>
                    <Button size="small" onClick={() => navigate(`/item/${note.id}`)}>
                      Abrir
                    </Button>
                  </Stack>
                </Box>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Plano do dia" />
        <CardContent>
          {todayEntries.length === 0 ? (
            <Typography color="text.secondary">Nenhuma tarefa agendada para hoje.</Typography>
          ) : (
            <Stack spacing={1}>
              {[...todayEntries]
                .sort(sortByDueThenPriority)
                .map((entry) => renderTaskRow(entry))}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Proximos 7 dias" />
        <CardContent>
          {weekEntries.length === 0 ? (
            <Typography color="text.secondary">Nada agendado para a proxima semana.</Typography>
          ) : (
            <Stack spacing={1}>
              {[...weekEntries]
                .sort((left, right) => {
                  const leftDay = left.row.scheduledDay ?? '';
                  const rightDay = right.row.scheduledDay ?? '';
                  if (leftDay !== rightDay) {
                    return leftDay.localeCompare(rightDay);
                  }
                  return sortByPriority(left.task, right.task);
                })
                .slice(0, 8)
                .map((entry) => renderTaskRow(entry))}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Backlog rapido" />
        <CardContent>
          {backlogEntries.length === 0 ? (
            <Typography color="text.secondary">Nenhuma tarefa no backlog.</Typography>
          ) : (
            <Stack spacing={1}>
              {[...backlogEntries]
                .sort((left, right) => {
                  const priorityCompare = sortByPriority(left.task, right.task);
                  if (priorityCompare !== 0) {
                    return priorityCompare;
                  }
                  return (left.row.createdAt ?? 0) - (right.row.createdAt ?? 0);
                })
                .slice(0, 10)
                .map((entry) => renderTaskRow(entry, true))}
            </Stack>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader title="Inbox pendente" />
        <CardContent>
          <Stack direction="row" spacing={2} alignItems="center" justifyContent="space-between">
            <Typography color="text.secondary">
              {inboxItems.length} item(ns) aguardando triagem.
            </Typography>
            <Button variant="contained" onClick={() => navigate('/inbox')}>
              Processar agora
            </Button>
          </Stack>
        </CardContent>
      </Card>

      <Menu
        anchorEl={scheduleAnchor}
        open={Boolean(scheduleAnchor)}
        onClose={() => setScheduleAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            if (scheduleEntry) {
              void handleSchedulePreset(scheduleEntry, 0);
            }
            setScheduleAnchor(null);
          }}
        >
          Agendar hoje
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (scheduleEntry) {
              void handleSchedulePreset(scheduleEntry, 1);
            }
            setScheduleAnchor(null);
          }}
        >
          Agendar amanha
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (scheduleEntry) {
              void handleSchedulePreset(scheduleEntry, 7);
            }
            setScheduleAnchor(null);
          }}
        >
          Agendar +7 dias
        </MenuItem>
        <MenuItem onClick={handleOpenScheduleDialog}>Escolher data...</MenuItem>
        {scheduleEntry?.row.scheduledDay && (
          <MenuItem
            onClick={() => {
              if (scheduleEntry) {
                void handleClearSnooze(scheduleEntry);
              }
              setScheduleAnchor(null);
            }}
          >
            Remover agendamento
          </MenuItem>
        )}
      </Menu>

      <Menu
        anchorEl={dueAnchor}
        open={Boolean(dueAnchor)}
        onClose={() => setDueAnchor(null)}
      >
        <MenuItem
          onClick={() => {
            if (dueEntry) {
              void handleUpdateDue(dueEntry, todayISO);
            }
            setDueAnchor(null);
          }}
        >
          Prazo hoje
        </MenuItem>
        <MenuItem onClick={handleOpenDueDialog}>Escolher data...</MenuItem>
        {dueEntry?.row.dueDay && (
          <MenuItem
            onClick={() => {
              if (dueEntry) {
                void handleUpdateDue(dueEntry, null);
              }
              setDueAnchor(null);
            }}
          >
            Limpar prazo
          </MenuItem>
        )}
      </Menu>

      <Dialog open={scheduleDialogOpen} onClose={() => setScheduleDialogOpen(false)}>
        <DialogTitle>Agendar</DialogTitle>
        <DialogContent>
          <DateField
            value={scheduleValue}
            onCommit={(next) => setScheduleValue(next ?? '')}
            fullWidth
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setScheduleDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSaveScheduleDialog}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={dueDialogOpen} onClose={() => setDueDialogOpen(false)}>
        <DialogTitle>Prazo</DialogTitle>
        <DialogContent>
          <DateField
            value={dueValue}
            onCommit={(next) => setDueValue(next ?? '')}
            fullWidth
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDueDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSaveDueDialog}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
