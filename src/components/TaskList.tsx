import React from 'react';
import {
  Box,
  Button,
  ButtonBase,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  MenuItem,
  Menu,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import { AccessTime } from '@mui/icons-material';

import type { IndexedTask } from '../tasks/taskIndex';
import { addDaysISO, getTodayISO } from '../tasks/date';
import DateField from './DateField';
import VirtualList from './VirtualList';

type TaskListProps = {
  tasks: IndexedTask[];
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
  selectedTaskId?: string;
  onSelectTask?: (task: IndexedTask) => void;
};

const formatText = (text: string) => (text.trim() ? text : 'Checklist');
const VIRTUAL_THRESHOLD = 100;

const TASK_STATUS_LABELS: Record<string, string> = {
  open: 'Aberta',
  doing: 'Em andamento',
  waiting: 'Aguardando',
};

const formatTaskStatus = (value: string) => TASK_STATUS_LABELS[value] ?? value;

const getListHeight = () => {
  if (typeof window === 'undefined') {
    return 520;
  }
  const base = Math.floor(window.innerHeight * 0.6);
  return Math.max(320, Math.min(base, 720));
};

export default function TaskList({
  tasks,
  emptyMessage = 'Sem tarefas.',
  onToggle,
  onOpenNote,
  onUpdateDue,
  onUpdateStatus,
  onUpdatePriority,
  onUpdateRecurrence,
  onSnooze,
  onClearSnooze,
  showMetaControls = false,
  selectedTaskId,
  onSelectTask,
}: TaskListProps) {
  const [snoozeAnchor, setSnoozeAnchor] = React.useState<HTMLElement | null>(null);
  const [snoozeTask, setSnoozeTask] = React.useState<IndexedTask | null>(null);
  const [snoozeDialogOpen, setSnoozeDialogOpen] = React.useState(false);
  const [snoozeDate, setSnoozeDate] = React.useState('');
  const [listHeight, setListHeight] = React.useState(getListHeight);

  React.useEffect(() => {
    const handleResize = () => setListHeight(getListHeight());
    if (typeof window === 'undefined') {
      return;
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleOpenSnoozeMenu = (task: IndexedTask, anchor: HTMLElement) => {
    setSnoozeTask(task);
    setSnoozeAnchor(anchor);
  };

  const handleCloseSnoozeMenu = () => {
    setSnoozeAnchor(null);
  };

  const handleSnoozeDays = (days: number) => {
    if (!snoozeTask || !onSnooze) {
      return;
    }
    const today = getTodayISO();
    const next = addDaysISO(today, days);
    onSnooze(snoozeTask, next);
    setSnoozeAnchor(null);
  };

  const handleOpenSnoozeDialog = () => {
    if (!snoozeTask) {
      return;
    }
    setSnoozeDate(snoozeTask.snoozedUntil ?? '');
    setSnoozeDialogOpen(true);
    setSnoozeAnchor(null);
  };

  const handleSaveSnoozeDate = () => {
    if (!snoozeTask || !onSnooze) {
      return;
    }
    onSnooze(snoozeTask, snoozeDate ? snoozeDate : null);
    setSnoozeDialogOpen(false);
  };

  const handleClearSnooze = () => {
    if (!snoozeTask || !onClearSnooze) {
      return;
    }
    onClearSnooze(snoozeTask);
    setSnoozeAnchor(null);
  };

  if (tasks.length === 0) {
    return <Typography color="text.secondary">{emptyMessage}</Typography>;
  }

  const shouldVirtualize = tasks.length > VIRTUAL_THRESHOLD;
  const itemHeight = showMetaControls ? 200 : 140;

  const renderTaskItem = (task: IndexedTask) => (
    <ListItem
      key={`${task.noteId}:${task.blockId}`}
      divider
      alignItems="flex-start"
      selected={selectedTaskId === `${task.noteId}:${task.blockId}`}
      sx={{ alignItems: 'flex-start' }}
      onClick={() => onSelectTask?.(task)}
    >
        <Checkbox
          checked={task.checked}
          onChange={(event) => onToggle(task, event.target.checked)}
          sx={{ mt: 0.5 }}
        />
        <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
          <ButtonBase
            onClick={() => onOpenNote(task.noteId, task.blockId)}
            sx={{ textAlign: 'left', width: '100%', display: 'block' }}
          >
            <Typography
              variant="body1"
              sx={{
                textDecoration: task.checked ? 'line-through' : 'none',
                color: task.checked ? 'text.secondary' : 'text.primary',
                wordBreak: 'break-word',
              }}
            >
              {formatText(task.text)}
            </Typography>
          </ButtonBase>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            <Chip
              label={task.noteTitle}
              size="small"
              onClick={() => onOpenNote(task.noteId, task.blockId)}
            />
            {task.notePath && (
              <Typography variant="caption" color="text.secondary">
                {task.notePath}
              </Typography>
            )}
            {!showMetaControls && task.priority && (
              <Chip size="small" label={task.priority} variant="outlined" />
            )}
            {!showMetaControls && task.status && task.status !== 'open' && (
              <Chip size="small" label={formatTaskStatus(task.status)} variant="outlined" />
            )}
            {!showMetaControls && task.recurrence && (
              <Chip size="small" label={task.recurrence} variant="outlined" />
            )}
            {task.snoozedUntil && (
              <Chip
                size="small"
                label={`Adiada ate ${task.snoozedUntil}`}
                variant="outlined"
              />
            )}
            <Box sx={{ minWidth: { xs: '100%', sm: 160 } }}>
              <DateField
                label="Vencimento"
                size="small"
                value={task.due ?? ''}
                onCommit={(next) => onUpdateDue(task, next)}
                fullWidth
              />
            </Box>
            {onSnooze && (
              <Tooltip title="Adiar">
                <IconButton
                  size="small"
                  onClick={(event) => handleOpenSnoozeMenu(task, event.currentTarget)}
                  aria-label="Adiar"
                >
                  <AccessTime fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {showMetaControls && (
              <>
                <Box sx={{ minWidth: { xs: '100%', sm: 140 } }}>
                  <TextField
                    label="Status"
                    select
                    size="small"
                    value={task.status ?? 'open'}
                    onChange={(event) =>
                      onUpdateStatus?.(
                        task,
                        event.target.value as 'open' | 'doing' | 'waiting',
                      )
                    }
                    fullWidth
                  >
                    <MenuItem value="open">Aberta</MenuItem>
                    <MenuItem value="doing">Em andamento</MenuItem>
                    <MenuItem value="waiting">Aguardando</MenuItem>
                  </TextField>
                </Box>
                <Box sx={{ minWidth: { xs: '100%', sm: 140 } }}>
                  <TextField
                    label="Prioridade"
                    select
                    size="small"
                    value={task.priority ?? ''}
                    onChange={(event) =>
                      onUpdatePriority?.(
                        task,
                        event.target.value
                          ? (event.target.value as 'P1' | 'P2' | 'P3')
                          : null,
                      )
                    }
                    fullWidth
                  >
                    <MenuItem value="">Sem prioridade</MenuItem>
                    <MenuItem value="P1">P1</MenuItem>
                    <MenuItem value="P2">P2</MenuItem>
                    <MenuItem value="P3">P3</MenuItem>
                  </TextField>
                </Box>
                <Box sx={{ minWidth: { xs: '100%', sm: 160 } }}>
                  <TextField
                    label="Recorrencia"
                    select
                    size="small"
                    value={task.recurrence ?? ''}
                    onChange={(event) =>
                      onUpdateRecurrence?.(
                        task,
                        event.target.value
                          ? (event.target.value as 'weekly' | 'monthly')
                          : null,
                      )
                    }
                    fullWidth
                  >
                    <MenuItem value="">Sem recorrencia</MenuItem>
                    <MenuItem value="weekly">weekly</MenuItem>
                    <MenuItem value="monthly">monthly</MenuItem>
                  </TextField>
                </Box>
              </>
            )}
          </Stack>
        </Stack>
    </ListItem>
  );

  const renderTask = (task: IndexedTask, style?: React.CSSProperties) => {
    if (!style) {
      return renderTaskItem(task);
    }
    return (
      <Box key={`${task.noteId}:${task.blockId}`} style={style}>
        {renderTaskItem(task)}
      </Box>
    );
  };

  return (
    <>
      {shouldVirtualize ? (
        <VirtualList
          itemCount={tasks.length}
          itemHeight={itemHeight}
          height={listHeight}
          renderItem={(index, style) => renderTask(tasks[index], style)}
        />
      ) : (
        <List disablePadding>{tasks.map((task) => renderTask(task))}</List>
      )}
      <Menu
        anchorEl={snoozeAnchor}
        open={Boolean(snoozeAnchor)}
        onClose={handleCloseSnoozeMenu}
      >
        <MenuItem onClick={() => handleSnoozeDays(1)}>Adiar +1 dia</MenuItem>
        <MenuItem onClick={() => handleSnoozeDays(3)}>Adiar +3 dias</MenuItem>
        <MenuItem onClick={() => handleSnoozeDays(7)}>Adiar +7 dias</MenuItem>
        <MenuItem onClick={handleOpenSnoozeDialog}>Escolher data...</MenuItem>
        {snoozeTask?.snoozedUntil && (
          <MenuItem onClick={handleClearSnooze}>Remover adiamento</MenuItem>
        )}
      </Menu>
      <Dialog open={snoozeDialogOpen} onClose={() => setSnoozeDialogOpen(false)}>
        <DialogTitle>Adiar ate</DialogTitle>
        <DialogContent>
          <DateField
            value={snoozeDate}
            onCommit={(next) => setSnoozeDate(next ?? '')}
            fullWidth
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSnoozeDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSaveSnoozeDate}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
