import React from 'react';
import { ArrowBack, ArrowForward, Repeat } from '@mui/icons-material';
import {
  Box,
  Chip,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { format, startOfDay } from 'date-fns';

import type { Item, TaskStatus } from '../../data/types';

type TaskCardProps = {
  task: Item;
  onOpen: (id: string) => void;
  onUpdateStatus: (id: string, status: TaskStatus) => void;
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'A Fazer',
  doing: 'Fazendo',
  done: 'Feito',
};

const formatDueDate = (timestamp?: number) => {
  if (!timestamp) {
    return '';
  }
  return format(new Date(timestamp), 'dd/MM');
};

const getStatusAfterMove = (status: TaskStatus, direction: 'left' | 'right') => {
  if (direction === 'left') {
    if (status === 'doing') {
      return 'todo';
    }
    if (status === 'done') {
      return 'doing';
    }
  }

  if (direction === 'right') {
    if (status === 'todo') {
      return 'doing';
    }
    if (status === 'doing') {
      return 'done';
    }
  }

  return null;
};

export default function TaskCard({ task, onOpen, onUpdateStatus }: TaskCardProps) {
  const status = (task.status ?? 'todo') as TaskStatus;
  const dueLabel = formatDueDate(task.dueDate);
  const isOverdue =
    status !== 'done' &&
    task.dueDate !== undefined &&
    task.dueDate < startOfDay(new Date()).getTime();

  const handleMove = (event: React.MouseEvent, direction: 'left' | 'right') => {
    event.stopPropagation();
    const next = getStatusAfterMove(status, direction);
    if (next) {
      onUpdateStatus(task.id, next);
    }
  };

  return (
    <Paper
      variant="outlined"
      sx={{ p: 1.5, cursor: 'pointer' }}
      onClick={() => onOpen(task.id)}
    >
      <Stack spacing={1}>
        <Typography variant="subtitle1">{task.title || 'Sem titulo'}</Typography>
        <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
          <Chip size="small" label={STATUS_LABELS[status]} variant="outlined" />
          {dueLabel && (
            <Chip
              size="small"
              label={`Vence ${dueLabel}`}
              color={isOverdue ? 'error' : 'default'}
              variant={isOverdue ? 'filled' : 'outlined'}
            />
          )}
          {task.recurrence && (
            <Chip size="small" label="Recorrente" icon={<Repeat fontSize="small" />} />
          )}
          {task.tags?.slice(0, 3).map((tag) => (
            <Chip key={tag} size="small" label={tag} variant="outlined" />
          ))}
        </Stack>
        <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
          <Tooltip title="Mover para esquerda">
            <span>
              <IconButton
                size="small"
                aria-label="Mover para esquerda"
                onClick={(event) => handleMove(event, 'left')}
                disabled={status === 'todo'}
              >
                <ArrowBack fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Mover para direita">
            <span>
              <IconButton
                size="small"
                aria-label="Mover para direita"
                onClick={(event) => handleMove(event, 'right')}
                disabled={status === 'done'}
              >
                <ArrowForward fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Stack>
    </Paper>
  );
}

