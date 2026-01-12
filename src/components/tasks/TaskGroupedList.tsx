import React from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material';
import { ExpandMore } from '@mui/icons-material';

import TaskList from '../TaskList';
import DateField from '../DateField';
import type { IndexedTask } from '../../tasks/taskIndex';
import { addDaysISO, getTodayISO } from '../../tasks/date';
import { useTaskSelection } from '../../store/useTaskSelection';

type GroupMode = 'path' | 'note' | 'none';

type NoteGroup = { kind: 'note'; key: string; label: string; tasks: IndexedTask[] };
type AllGroup = { kind: 'all'; key: string; label: string; tasks: IndexedTask[] };
type PathGroup = {
  kind: 'path';
  key: string;
  label: string;
  notes: { key: string; label: string; tasks: IndexedTask[] }[];
};
type TaskGroup = NoteGroup | AllGroup | PathGroup;

type TaskGroupedListProps = {
  tasks: IndexedTask[];
  groupMode: GroupMode;
  storageKey: string;
  emptyMessage?: string;
  onToggle: (task: IndexedTask, checked: boolean) => void;
  onOpenNote: (noteId: string, blockId: string) => void;
  onUpdateDue: (task: IndexedTask, due: string | null) => void;
  onUpdateStatus?: (task: IndexedTask, status: 'open' | 'doing' | 'waiting') => void;
  onUpdatePriority?: (task: IndexedTask, priority: 'P1' | 'P2' | 'P3' | null) => void;
  onUpdateRecurrence?: (task: IndexedTask, recurrence: 'weekly' | 'monthly' | null) => void;
  onSnooze?: (task: IndexedTask, snoozedUntil: string | null) => void;
  onClearSnooze?: (task: IndexedTask) => void;
  showMetaControls?: boolean;
  enableShortcuts?: boolean;
};

const taskKey = (task: IndexedTask) => `${task.noteId}:${task.blockId}`;

const readStored = (key: string) => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const raw = window.localStorage.getItem(key);
  if (raw === '1') {
    return true;
  }
  if (raw === '0') {
    return false;
  }
  return undefined;
};

const writeStored = (key: string, value: boolean) => {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(key, value ? '1' : '0');
};

const shouldIgnoreKey = (event: React.KeyboardEvent) => {
  if (event.defaultPrevented) {
    return true;
  }
  const target = event.target as HTMLElement | null;
  if (!target) {
    return false;
  }
  const tag = target.tagName?.toLowerCase();
  return tag === 'input' || tag === 'textarea' || target.isContentEditable;
};

export default function TaskGroupedList({
  tasks,
  groupMode,
  storageKey,
  emptyMessage,
  onToggle,
  onOpenNote,
  onUpdateDue,
  onUpdateStatus,
  onUpdatePriority,
  onUpdateRecurrence,
  onSnooze,
  onClearSnooze,
  showMetaControls = false,
  enableShortcuts = true,
}: TaskGroupedListProps) {
  const setSelectedTask = useTaskSelection((state) => state.setSelectedTask);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const [dueDialogTask, setDueDialogTask] = React.useState<IndexedTask | null>(null);
  const [dueValue, setDueValue] = React.useState('');

  const resolveExpanded = React.useCallback(
    (key: string, defaultValue = true) => {
      const stored = readStored(key);
      return stored ?? defaultValue;
    },
    [],
  );

  const [expandedState, setExpandedState] = React.useState<Record<string, boolean>>({});

  const getExpanded = React.useCallback(
    (key: string, defaultValue = true) => {
      if (expandedState[key] !== undefined) {
        return expandedState[key];
      }
      return resolveExpanded(key, defaultValue);
    },
    [expandedState, resolveExpanded],
  );

  const setExpanded = React.useCallback((key: string, value: boolean) => {
    setExpandedState((prev) => ({ ...prev, [key]: value }));
    writeStored(key, value);
  }, []);

  const grouped = React.useMemo<TaskGroup[]>(() => {
    if (groupMode === 'none') {
      return [{ kind: 'all', key: 'all', label: 'Tarefas', tasks }];
    }

    if (groupMode === 'note') {
      const map = new Map<string, { label: string; tasks: IndexedTask[] }>();
      tasks.forEach((task) => {
        const key = task.noteId;
        const entry = map.get(key) ?? { label: task.noteTitle, tasks: [] };
        entry.tasks.push(task);
        map.set(key, entry);
      });
      return Array.from(map.entries()).map(([key, entry]) => ({
        kind: 'note',
        key,
        label: entry.label,
        tasks: entry.tasks,
      }));
    }

    const pathMap = new Map<
      string,
      Map<string, { label: string; tasks: IndexedTask[] }>
    >();
    tasks.forEach((task) => {
      const pathKey = task.notePath ?? 'Raiz';
      const noteKey = task.noteId;
      const noteLabel = task.noteTitle;
      if (!pathMap.has(pathKey)) {
        pathMap.set(pathKey, new Map());
      }
      const noteMap = pathMap.get(pathKey)!;
      const entry = noteMap.get(noteKey) ?? { label: noteLabel, tasks: [] };
      entry.tasks.push(task);
      noteMap.set(noteKey, entry);
    });
    return Array.from(pathMap.entries()).map(([pathKey, noteMap]) => ({
      kind: 'path',
      key: pathKey,
      label: pathKey,
      notes: Array.from(noteMap.entries()).map(([noteId, entry]) => ({
        key: noteId,
        label: entry.label,
        tasks: entry.tasks,
      })),
    }));
  }, [groupMode, tasks]);

  const visibleTasks = React.useMemo(() => {
    if (groupMode === 'none') {
      return tasks;
    }
    if (groupMode === 'note') {
      return grouped.flatMap((group) =>
        group.kind === 'note' && getExpanded(`${storageKey}:note:${group.key}`)
          ? group.tasks
          : [],
      );
    }
    return grouped.flatMap((group) => {
      if (group.kind !== 'path') {
        return [];
      }
      const pathExpanded = getExpanded(`${storageKey}:path:${group.key}`);
      if (!pathExpanded) {
        return [];
      }
      return group.notes.flatMap((note) =>
        getExpanded(`${storageKey}:note:${note.key}`) ? note.tasks : [],
      );
    });
  }, [groupMode, grouped, getExpanded, storageKey, tasks]);

  React.useEffect(() => {
    if (selectedId && visibleTasks.some((task) => taskKey(task) === selectedId)) {
      const current = visibleTasks.find((task) => taskKey(task) === selectedId);
      if (current) {
        setSelectedTask(current);
      }
      return;
    }
    const first = visibleTasks[0];
    setSelectedId(first ? taskKey(first) : null);
    setSelectedTask(first ?? null);
  }, [selectedId, setSelectedTask, visibleTasks]);

  const handleSelectTask = (task: IndexedTask) => {
    setSelectedId(taskKey(task));
    setSelectedTask(task);
  };

  const cyclePriority = (task: IndexedTask) => {
    if (!onUpdatePriority) {
      return;
    }
    const order: Array<'P1' | 'P2' | 'P3' | null> = ['P1', 'P2', 'P3', null];
    const current = task.priority ?? null;
    const index = order.indexOf(current);
    const next = order[(index + 1) % order.length];
    onUpdatePriority(task, next);
  };

  const cycleStatus = (task: IndexedTask) => {
    if (!onUpdateStatus) {
      return;
    }
    const order: Array<'open' | 'doing' | 'waiting'> = ['open', 'doing', 'waiting'];
    const current = task.status ?? 'open';
    const index = order.indexOf(current);
    const next = order[(index + 1) % order.length];
    onUpdateStatus(task, next);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (!enableShortcuts || shouldIgnoreKey(event)) {
      return;
    }
    if (visibleTasks.length === 0) {
      return;
    }
    const index = selectedId
      ? visibleTasks.findIndex((task) => taskKey(task) === selectedId)
      : -1;
    const currentIndex = index >= 0 ? index : 0;
    const current = visibleTasks[currentIndex];
    const key = event.key.toLowerCase();

    if (key === 'arrowdown') {
      event.preventDefault();
      const nextIndex = Math.min(visibleTasks.length - 1, currentIndex + 1);
      setSelectedId(taskKey(visibleTasks[nextIndex]));
      return;
    }
    if (key === 'arrowup') {
      event.preventDefault();
      const nextIndex = Math.max(0, currentIndex - 1);
      setSelectedId(taskKey(visibleTasks[nextIndex]));
      return;
    }
    if (key === ' ') {
      event.preventDefault();
      onToggle(current, !current.checked);
      return;
    }
    if (key === 'enter') {
      event.preventDefault();
      onOpenNote(current.noteId, current.blockId);
      return;
    }
    if (key === 'd') {
      event.preventDefault();
      setDueDialogTask(current);
      setDueValue(current.due ?? '');
      return;
    }
    if (key === 'z' && onSnooze) {
      event.preventDefault();
      const next = addDaysISO(getTodayISO(), 1);
      onSnooze(current, next);
      return;
    }
    if (key === 'p') {
      event.preventDefault();
      cyclePriority(current);
      return;
    }
    if (key === 's') {
      event.preventDefault();
      cycleStatus(current);
      return;
    }
  };

  const handleSaveDueDialog = () => {
    if (!dueDialogTask) {
      return;
    }
    onUpdateDue(dueDialogTask, dueValue ? dueValue : null);
    setDueDialogTask(null);
  };

  const handleCloseDueDialog = () => {
    setDueDialogTask(null);
  };

  if (tasks.length === 0) {
    return <Typography color="text.secondary">{emptyMessage ?? 'Sem tarefas.'}</Typography>;
  }

  if (groupMode === 'none') {
    return (
      <Box tabIndex={0} onKeyDown={handleKeyDown}>
        <TaskList
          tasks={tasks}
          emptyMessage={emptyMessage}
          onToggle={onToggle}
          onOpenNote={onOpenNote}
          onUpdateDue={onUpdateDue}
          onUpdateStatus={onUpdateStatus}
          onUpdatePriority={onUpdatePriority}
          onUpdateRecurrence={onUpdateRecurrence}
          onSnooze={onSnooze}
          onClearSnooze={onClearSnooze}
          showMetaControls={showMetaControls}
          selectedTaskId={selectedId ?? undefined}
          onSelectTask={handleSelectTask}
        />
        <Dialog open={Boolean(dueDialogTask)} onClose={handleCloseDueDialog}>
          <DialogTitle>Definir prazo</DialogTitle>
          <DialogContent>
            <DateField
              label="Prazo"
              value={dueValue}
              onCommit={(next) => setDueValue(next ?? '')}
              fullWidth
              sx={{ mt: 1 }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={handleCloseDueDialog}>Cancelar</Button>
            <Button variant="contained" onClick={handleSaveDueDialog}>
              Salvar
            </Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }

  return (
    <Box tabIndex={0} onKeyDown={handleKeyDown}>
      <Stack spacing={2}>
        {grouped.map((group) => {
          const isPathMode = group.kind === 'path';
          const groupKey = isPathMode
            ? `${storageKey}:path:${group.key}`
            : `${storageKey}:note:${group.key}`;
          const expanded = getExpanded(groupKey, true);
          const taskCount = isPathMode
            ? group.notes.reduce(
                (sum, note) => sum + note.tasks.filter((task) => !task.checked).length,
                0,
              )
            : group.tasks.filter((task) => !task.checked).length;
          const snoozedCount = isPathMode
            ? group.notes.reduce(
                (sum, note) =>
                  sum +
                  note.tasks.filter((task) => !task.checked && task.isSnoozed).length,
                0,
              )
            : group.tasks.filter((task) => !task.checked && task.isSnoozed).length;

          return (
            <Accordion
              key={group.key}
              expanded={expanded}
              onChange={(_, next) => setExpanded(groupKey, next)}
            >
              <AccordionSummary expandIcon={<ExpandMore />}>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Typography variant="subtitle1">{group.label}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {taskCount} abertas
                  </Typography>
                  {snoozedCount > 0 && (
                    <Typography variant="body2" color="text.secondary">
                      {snoozedCount} agendadas
                    </Typography>
                  )}
                </Stack>
              </AccordionSummary>
              <AccordionDetails>
                {isPathMode ? (
                  <Stack spacing={1.5}>
                    {(group.notes ?? []).map((note) => {
                      const noteKey = `${storageKey}:note:${note.key}`;
                      const noteExpanded = getExpanded(noteKey, true);
                      return (
                        <Accordion
                          key={note.key}
                          expanded={noteExpanded}
                          onChange={(_, next) => setExpanded(noteKey, next)}
                          sx={{ bgcolor: 'action.hover' }}
                        >
                          <AccordionSummary expandIcon={<ExpandMore />}>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <Typography variant="subtitle2">{note.label}</Typography>
                              <Typography variant="body2" color="text.secondary">
                                {note.tasks.filter((task) => !task.checked).length} abertas
                              </Typography>
                            </Stack>
                          </AccordionSummary>
                          <AccordionDetails>
                            <TaskList
                              tasks={note.tasks}
                              emptyMessage={emptyMessage}
                              onToggle={onToggle}
                              onOpenNote={onOpenNote}
                              onUpdateDue={onUpdateDue}
                              onUpdateStatus={onUpdateStatus}
                              onUpdatePriority={onUpdatePriority}
                              onUpdateRecurrence={onUpdateRecurrence}
                              onSnooze={onSnooze}
                              onClearSnooze={onClearSnooze}
                              showMetaControls={showMetaControls}
                              selectedTaskId={selectedId ?? undefined}
                              onSelectTask={handleSelectTask}
                            />
                          </AccordionDetails>
                        </Accordion>
                      );
                    })}
                  </Stack>
                ) : (
                  <TaskList
                    tasks={group.tasks}
                    emptyMessage={emptyMessage}
                    onToggle={onToggle}
                    onOpenNote={onOpenNote}
                    onUpdateDue={onUpdateDue}
                    onUpdateStatus={onUpdateStatus}
                    onUpdatePriority={onUpdatePriority}
                    onUpdateRecurrence={onUpdateRecurrence}
                    onSnooze={onSnooze}
                    onClearSnooze={onClearSnooze}
                    showMetaControls={showMetaControls}
                    selectedTaskId={selectedId ?? undefined}
                    onSelectTask={handleSelectTask}
                  />
                )}
              </AccordionDetails>
            </Accordion>
          );
        })}
      </Stack>
      <Dialog open={Boolean(dueDialogTask)} onClose={handleCloseDueDialog}>
        <DialogTitle>Definir prazo</DialogTitle>
        <DialogContent>
          <DateField
            label="Prazo"
            value={dueValue}
            onCommit={(next) => setDueValue(next ?? '')}
            fullWidth
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDueDialog}>Cancelar</Button>
          <Button variant="contained" onClick={handleSaveDueDialog}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
