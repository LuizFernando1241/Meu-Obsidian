import React from 'react';
import { CheckCircleOutline, Repeat, Snooze } from '@mui/icons-material';
import { Chip, IconButton, List, Stack, Tooltip, Typography } from '@mui/material';
import { addDays, format, startOfDay } from 'date-fns';
import { useNavigate } from 'react-router-dom';

import EmptyState from '../components/EmptyState';
import ItemRow from '../components/ItemRow';
import { useNotifier } from '../components/Notifier';
import { useOpenTasksNoDueDate, useOverdueTasks, useTodayTasks } from '../data/hooks';
import { completeTask, updateItemProps } from '../data/repo';
import type { Item } from '../data/types';

const STATUS_LABELS = {
  todo: 'A Fazer',
  doing: 'Fazendo',
  done: 'Feito',
} as const;

const STATUS_COLORS = {
  todo: 'default',
  doing: 'warning',
  done: 'success',
} as const;

const formatDueDate = (timestamp?: number) => {
  if (!timestamp) {
    return null;
  }
  return format(new Date(timestamp), 'dd/MM');
};

export default function TodayPage() {
  const navigate = useNavigate();
  const notifier = useNotifier();
  const overdueTasks = useOverdueTasks();
  const todayTasks = useTodayTasks();
  const noDueDateTasks = useOpenTasksNoDueDate();

  const handleOpenItem = React.useCallback(
    (id: string) => {
      navigate(`/item/${id}`);
    },
    [navigate],
  );

  const handleComplete = async (event: React.MouseEvent, id: string) => {
    event.stopPropagation();
    try {
      await completeTask(id);
      notifier.success('Tarefa concluida');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao concluir: ${message}`);
    }
  };

  const handleSnooze = async (event: React.MouseEvent, id: string) => {
    event.stopPropagation();
    const tomorrowStart = startOfDay(addDays(new Date(), 1)).getTime();
    try {
      await updateItemProps(id, { dueDate: tomorrowStart });
      notifier.info('Tarefa adiada para amanha');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao adiar: ${message}`);
    }
  };

  const renderTaskSecondary = (item: Item) => {
    const status = item.status ?? 'todo';
    const dueDate = formatDueDate(item.dueDate);
    const isOverdue = item.dueDate ? item.dueDate < startOfDay(new Date()).getTime() : false;

    return (
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <Chip size="small" label={STATUS_LABELS[status]} color={STATUS_COLORS[status]} />
        {dueDate && (
          <Chip
            size="small"
            label={`Vence ${dueDate}`}
            color={isOverdue ? 'error' : 'default'}
            variant={isOverdue ? 'filled' : 'outlined'}
          />
        )}
        {item.recurrence && (
          <Chip size="small" label="Recorrente" icon={<Repeat fontSize="small" />} />
        )}
      </Stack>
    );
  };

  const renderTaskActions = (item: Item) => (
    <>
      <Tooltip title="Concluir">
        <IconButton
          size="small"
          aria-label="Concluir tarefa"
          onClick={(event) => handleComplete(event, item.id)}
        >
          <CheckCircleOutline fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title="Adiar para amanha">
        <IconButton
          size="small"
          aria-label="Adiar tarefa"
          onClick={(event) => handleSnooze(event, item.id)}
        >
          <Snooze fontSize="small" />
        </IconButton>
      </Tooltip>
    </>
  );

  const renderTaskList = (items: Item[], emptyLabel: string) => (
    <Stack spacing={1}>
      {items.length === 0 ? (
        <EmptyState title={emptyLabel} />
      ) : (
        <List dense disablePadding>
          {items.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              onOpen={handleOpenItem}
              secondary={renderTaskSecondary(item)}
              rightActions={renderTaskActions(item)}
            />
          ))}
        </List>
      )}
    </Stack>
  );

  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        Hoje
      </Typography>

      <Stack spacing={1}>
        <Typography variant="h6">Atrasadas</Typography>
        {renderTaskList(overdueTasks, 'Nenhuma tarefa atrasada.')}
      </Stack>

      <Stack spacing={1}>
        <Typography variant="h6">Hoje</Typography>
        {renderTaskList(todayTasks, 'Nenhuma tarefa para hoje.')}
      </Stack>

      {noDueDateTasks.length > 0 && (
        <Stack spacing={1}>
          <Typography variant="h6">Sem data</Typography>
          {renderTaskList(noDueDateTasks, 'Nenhuma tarefa sem data.')}
        </Stack>
      )}

    </Stack>
  );
}
