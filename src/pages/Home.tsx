import React from 'react';
import { ArrowForward, CheckCircleOutline, Repeat, Snooze, Star } from '@mui/icons-material';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Grid,
  IconButton,
  List,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { addDays, format, startOfDay } from 'date-fns';
import { useNavigate } from 'react-router-dom';

import EmptyState from '../components/EmptyState';
import ItemRow from '../components/ItemRow';
import { useNotifier } from '../components/Notifier';
import {
  useFavoriteItems,
  useItemsByIds,
  useOverdueTasks,
  useProjects,
  useRecentItems,
  useTodayTasks,
} from '../data/hooks';
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

export default function Home() {
  const navigate = useNavigate();
  const notifier = useNotifier();
  const favorites = useFavoriteItems();
  const recent = useRecentItems(10);
  const projects = useProjects(5);
  const nextActionIds = React.useMemo(
    () => projects.map((project) => project.nextActionId).filter(Boolean) as string[],
    [projects],
  );
  const nextActions = useItemsByIds(nextActionIds);
  const nextActionsById = React.useMemo(() => {
    const map = new Map<string, Item>();
    nextActions.forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }, [nextActions]);
  const overdueTasks = useOverdueTasks();
  const todayTasks = useTodayTasks();

  const handleOpenItem = React.useCallback(
    (id: string) => {
      navigate(`/item/${id}`);
    },
    [navigate],
  );

  const renderItemSecondary = (item: Item) =>
    `${item.type} \u2022 ${format(new Date(item.updatedAt), 'yyyy-MM-dd')}`;

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

  const renderItems = (items: Item[], emptyLabel: string) =>
    items.length === 0 ? (
      <EmptyState title={emptyLabel} />
    ) : (
      <List dense disablePadding>
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            onOpen={handleOpenItem}
            secondary={renderItemSecondary(item)}
          />
        ))}
      </List>
    );

  const renderProjects = () =>
    projects.length === 0 ? (
      <EmptyState title="Nenhum projeto ainda." />
    ) : (
      <List dense disablePadding>
        {projects.map((project) => {
          const nextTask = project.nextActionId
            ? nextActionsById.get(project.nextActionId)
            : undefined;
          const secondary = nextTask
            ? `Proxima: ${nextTask.title || 'Sem titulo'}`
            : 'Defina a proxima acao';
          const rightActions = nextTask ? (
            <Tooltip title="Abrir proxima acao">
              <IconButton
                size="small"
                aria-label="Abrir proxima acao"
                onClick={(event) => {
                  event.stopPropagation();
                  navigate(`/item/${nextTask.id}`);
                }}
              >
                <ArrowForward fontSize="small" />
              </IconButton>
            </Tooltip>
          ) : undefined;

          return (
            <ItemRow
              key={project.id}
              item={project}
              onOpen={handleOpenItem}
              secondary={secondary}
              rightActions={rightActions}
            />
          );
        })}
      </List>
    );

  const taskItems = React.useMemo(
    () => [...overdueTasks, ...todayTasks].slice(0, 5),
    [overdueTasks, todayTasks],
  );

  const renderTaskSecondary = (item: Item) => {
    const status = item.status ?? 'todo';
    const dueDate = item.dueDate ? format(new Date(item.dueDate), 'dd/MM') : null;
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

  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        Mecflux Personal OS
      </Typography>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader
              title="Hoje"
              action={
                <Button size="small" onClick={() => navigate('/today')}>
                  Ver tudo
                </Button>
              }
            />
            <CardContent>
              <Stack spacing={2}>
                <Stack direction="row" spacing={2}>
                  <Typography variant="body2" color="text.secondary">
                    Atrasadas: {overdueTasks.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Hoje: {todayTasks.length}
                  </Typography>
                </Stack>
                {taskItems.length === 0 ? (
                  <EmptyState title="Nenhuma tarefa para hoje." />
                ) : (
                  <List dense disablePadding>
                    {taskItems.map((item) => (
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
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title="Em andamento" />
            <CardContent>
              {renderProjects()}
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title="Recentes" />
            <CardContent>{renderItems(recent, 'Nenhum item recente.')}</CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader
              title="Favoritos"
              avatar={<Star fontSize="small" color="warning" />}
            />
            <CardContent>{renderItems(favorites, 'Nenhum favorito ainda.')}</CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
