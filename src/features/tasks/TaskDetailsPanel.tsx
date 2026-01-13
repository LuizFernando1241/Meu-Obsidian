import React from 'react';
import {
  Box,
  Button,
  Chip,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';

import type { IndexedTask } from '../../tasks/taskIndex';
import { addDaysISO, getTodayISO } from '../../tasks/date';
import DateField from '../../components/DateField';
import { useNotifier } from '../../components/Notifier';
import { db } from '../../data/db';
import type { Node, NoteNode } from '../../data/types';
import { setChecklistDue, setChecklistSnooze, toggleChecklist } from '../../data/repo';
import {
  setTaskNextAction,
  setTaskPriority,
  setTaskStatus,
} from '../../tasks/taskIndexStore';

type TaskDetailsPanelProps = {
  task: IndexedTask;
  onClear?: () => void;
};

const resolveProjectArea = (note?: NoteNode | null) => {
  const props = note?.props && typeof note.props === 'object' ? note.props : {};
  const projectId = typeof (props as Record<string, unknown>).projectId === 'string'
    ? String((props as Record<string, unknown>).projectId)
    : '';
  const areaId = typeof (props as Record<string, unknown>).areaId === 'string'
    ? String((props as Record<string, unknown>).areaId)
    : '';
  return { projectId, areaId };
};

const formatTaskText = (text: string) => (text.trim() ? text : 'Checklist');

export default function TaskDetailsPanel({ task, onClear }: TaskDetailsPanelProps) {
  const notifier = useNotifier();
  const navigate = useNavigate();
  const note = useLiveQuery(
    () => db.items.get(task.noteId) as Promise<NoteNode | undefined>,
    [task.noteId],
  );
  const { projectId, areaId } = React.useMemo(
    () => resolveProjectArea(note ?? null),
    [note],
  );
  const projectLabel = task.projectId ?? projectId;
  const areaLabel = task.areaId ?? areaId;
  const projectNode = useLiveQuery(
    () => (projectLabel ? (db.items.get(projectLabel) as Promise<Node | undefined>) : undefined),
    [projectLabel],
  );
  const areaNode = useLiveQuery(
    () => (areaLabel ? (db.items.get(areaLabel) as Promise<Node | undefined>) : undefined),
    [areaLabel],
  );
  const projectDisplay = projectNode?.title ?? projectLabel;
  const areaDisplay = areaNode?.title ?? areaLabel;
  const [scheduledValue, setScheduledValue] = React.useState(task.snoozedUntil ?? '');
  const [dueValue, setDueValue] = React.useState(task.due ?? '');
  const [nextAction, setNextAction] = React.useState(Boolean(task.isNextAction));

  React.useEffect(() => {
    setScheduledValue(task.snoozedUntil ?? '');
    setDueValue(task.due ?? '');
  }, [task.due, task.snoozedUntil]);

  React.useEffect(() => {
    setNextAction(Boolean(task.isNextAction));
  }, [task.isNextAction]);

  const handleOpenNote = () => {
    navigate(`/item/${task.noteId}`, { state: { highlightBlockId: task.blockId } });
  };

  const handleToggleComplete = async () => {
    try {
      await toggleChecklist(task.noteId, task.blockId, !task.checked);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao atualizar tarefa: ${message}`);
    }
  };

  const handleUpdateScheduled = async (next: string | null) => {
    try {
      await setChecklistSnooze(task.noteId, task.blockId, next);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao agendar: ${message}`);
    }
  };

  const handleUpdateDue = async (next: string | null) => {
    try {
      await setChecklistDue(task.noteId, task.blockId, next);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao definir prazo: ${message}`);
    }
  };

  const handleUpdateStatus = async (status: 'open' | 'doing' | 'waiting') => {
    try {
      await setTaskStatus(task.noteId, task.blockId, status);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao atualizar status: ${message}`);
    }
  };

  const handleUpdatePriority = async (priority: 'P1' | 'P2' | 'P3' | null) => {
    try {
      await setTaskPriority(task.noteId, task.blockId, priority);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao atualizar prioridade: ${message}`);
    }
  };

  const handleToggleNextAction = async (checked: boolean) => {
    setNextAction(checked);
    try {
      await setTaskNextAction(task.noteId, task.blockId, checked);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao atualizar next action: ${message}`);
    }
  };

  const handleSchedulePreset = async (days: number) => {
    const today = getTodayISO();
    const next = addDaysISO(today, days);
    setScheduledValue(next);
    await handleUpdateScheduled(next);
  };

  return (
    <Stack spacing={2}>
      <Stack spacing={1}>
        <Typography variant="h6">{formatTaskText(task.text)}</Typography>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Chip label={task.noteTitle} onClick={handleOpenNote} />
          {task.notePath && (
            <Typography variant="caption" color="text.secondary">
              {task.notePath}
            </Typography>
          )}
        </Stack>
      </Stack>
      <Stack direction="row" spacing={1}>
        <Button variant="contained" onClick={handleToggleComplete}>
          {task.checked ? 'Reabrir' : 'Concluir'}
        </Button>
        <Tooltip title="Abrir nota para mover a tarefa">
          <Button variant="outlined" onClick={handleOpenNote}>
            Mover
          </Button>
        </Tooltip>
        {onClear && (
          <Button variant="text" onClick={onClear}>
            Limpar selecao
          </Button>
        )}
      </Stack>
      <Divider />
      <Stack spacing={2}>
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Agendamento
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <DateField
              label="Agendar"
              value={scheduledValue}
              onCommit={(next) => {
                const nextValue = next ?? null;
                setScheduledValue(nextValue ?? '');
                void handleUpdateScheduled(nextValue);
              }}
            />
            <Button size="small" onClick={() => void handleSchedulePreset(0)}>
              Hoje
            </Button>
            <Button size="small" onClick={() => void handleSchedulePreset(1)}>
              Amanha
            </Button>
            <Button size="small" onClick={() => void handleSchedulePreset(7)}>
              +7d
            </Button>
          </Stack>
        </Box>
        <Box>
          <Typography variant="subtitle2" gutterBottom>
            Prazo
          </Typography>
          <DateField
            label="Prazo"
            value={dueValue}
            onCommit={(next) => {
              const nextValue = next ?? null;
              setDueValue(nextValue ?? '');
              void handleUpdateDue(nextValue);
            }}
          />
        </Box>
        <Stack direction="row" spacing={2} flexWrap="wrap">
          <TextField
            label="Status"
            select
            size="small"
            value={task.status ?? 'open'}
            onChange={(event) =>
              void handleUpdateStatus(event.target.value as 'open' | 'doing' | 'waiting')
            }
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="open">Aberta</MenuItem>
            <MenuItem value="doing">Em andamento</MenuItem>
            <MenuItem value="waiting">Aguardando</MenuItem>
          </TextField>
          <TextField
            label="Prioridade"
            select
            size="small"
            value={task.priority ?? ''}
            onChange={(event) =>
              void handleUpdatePriority(
                event.target.value
                  ? (event.target.value as 'P1' | 'P2' | 'P3')
                  : null,
              )
            }
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="">Sem prioridade</MenuItem>
            <MenuItem value="P1">P1</MenuItem>
            <MenuItem value="P2">P2</MenuItem>
            <MenuItem value="P3">P3</MenuItem>
          </TextField>
        </Stack>
        <FormControlLabel
          control={
            <Switch
              checked={nextAction}
              onChange={(event) => void handleToggleNextAction(event.target.checked)}
            />
          }
          label="Proxima acao"
        />
        <Stack spacing={0.5}>
          <Typography variant="subtitle2">Projeto</Typography>
          <Typography variant="body2" color="text.secondary">
            {projectDisplay || 'Sem projeto'}
          </Typography>
          <Typography variant="subtitle2">Area</Typography>
          <Typography variant="body2" color="text.secondary">
            {areaDisplay || 'Sem area'}
          </Typography>
        </Stack>
      </Stack>
    </Stack>
  );
}
