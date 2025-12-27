import React from 'react';
import {
  Box,
  Button,
  Chip,
  IconButton,
  List,
  Menu,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  Tooltip,
} from '@mui/material';
import { ArrowForward, MoreVert, Repeat } from '@mui/icons-material';
import { addDays, endOfDay, format, startOfDay } from 'date-fns';
import { useNavigate } from 'react-router-dom';

import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import ItemRow from '../components/ItemRow';
import ListToolbar from '../components/ListToolbar';
import LoadingState from '../components/LoadingState';
import { useNotifier } from '../components/Notifier';
import TaskBoard from '../components/tasks/TaskBoard';
import TaskFilters, { type TaskFilterKey } from '../components/tasks/TaskFilters';
import { useItemsByType } from '../data/hooks';
import { completeTask, deleteItem, updateItemProps } from '../data/repo';
import { matchesItemSearch } from '../data/search';
import type { Item, TaskStatus } from '../data/types';
import { useDataStore } from '../store/useDataStore';

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'A Fazer',
  doing: 'Fazendo',
  done: 'Feito',
};

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

type TaskView = 'list' | 'board';
const PAGE_SIZE = 200;

const getNextStatus = (status: TaskStatus): TaskStatus => {
  if (status === 'todo') {
    return 'doing';
  }
  if (status === 'doing') {
    return 'done';
  }
  return 'done';
};

const getSortRank = (item: Item, todayStart: number, todayEnd: number) => {
  const status = (item.status ?? 'todo') as TaskStatus;
  if (status === 'done') {
    return 4;
  }
  if (!item.dueDate) {
    return 3;
  }
  if (item.dueDate < todayStart) {
    return 0;
  }
  if (item.dueDate <= todayEnd) {
    return 1;
  }
  return 2;
};

export default function TasksPage() {
  const navigate = useNavigate();
  const notifier = useNotifier();
  const items = useItemsByType('task');
  const { createQuick, isSeeding } = useDataStore((state) => ({
    createQuick: state.createQuick,
    isSeeding: state.isSeeding,
  }));

  const [search, setSearch] = React.useState('');
  const [view, setView] = React.useState<TaskView>('list');
  const [filterKey, setFilterKey] = React.useState<TaskFilterKey>('all');
  const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null);
  const [menuItem, setMenuItem] = React.useState<Item | null>(null);
  const [confirmItem, setConfirmItem] = React.useState<Item | null>(null);
  const [visibleCount, setVisibleCount] = React.useState(PAGE_SIZE);

  const dayKey = new Date().toDateString();
  const { todayStart, todayEnd, weekEnd } = React.useMemo(() => {
    const now = new Date();
    return {
      todayStart: startOfDay(now).getTime(),
      todayEnd: endOfDay(now).getTime(),
      weekEnd: endOfDay(addDays(now, 7)).getTime(),
    };
  }, [dayKey]);

  const filteredItems = React.useMemo(() => {
    return items.filter((item) => {
      const status = (item.status ?? 'todo') as TaskStatus;
      const dueDate = item.dueDate;
      const isOpen = status !== 'done';
      const matchesFilter = (() => {
        switch (filterKey) {
          case 'done':
            return status === 'done';
          case 'noDate':
            return isOpen && !dueDate;
          case 'overdue':
            return (
              isOpen && typeof dueDate === 'number' && dueDate < todayStart
            );
          case 'today':
            return (
              isOpen &&
              typeof dueDate === 'number' &&
              dueDate >= todayStart &&
              dueDate <= todayEnd
            );
          case 'week':
            return (
              isOpen &&
              typeof dueDate === 'number' &&
              dueDate >= todayStart &&
              dueDate <= weekEnd
            );
          case 'all':
          default:
            return true;
        }
      })();
      const searchOk = matchesItemSearch(item, search);
      return matchesFilter && searchOk;
    });
  }, [items, search, filterKey, todayStart, todayEnd, weekEnd]);

  const listItems = React.useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      const rankA = getSortRank(a, todayStart, todayEnd);
      const rankB = getSortRank(b, todayStart, todayEnd);
      if (rankA !== rankB) {
        return rankA - rankB;
      }
      const dueA = a.dueDate ?? Number.POSITIVE_INFINITY;
      const dueB = b.dueDate ?? Number.POSITIVE_INFINITY;
      if (dueA !== dueB) {
        return dueA - dueB;
      }
      return b.updatedAt - a.updatedAt;
    });
  }, [filteredItems, todayStart, todayEnd]);

  React.useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, filterKey, view]);

  const handleCreate = async () => {
    try {
      const id = await createQuick('task');
      notifier.success('Tarefa criada');
      navigate(`/item/${id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao criar: ${message}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteItem(id);
      notifier.success('Tarefa excluida');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao excluir: ${message}`);
    }
  };

  const handleUpdateStatus = async (id: string, status: TaskStatus) => {
    try {
      if (status === 'done') {
        await completeTask(id);
        notifier.success('Tarefa concluida');
      } else {
        await updateItemProps(id, {
          status,
          doneAt: undefined,
        });
        notifier.success(`Movida para ${STATUS_LABELS[status]}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao mover: ${message}`);
    }
  };

  const handleOpenMenu = (
    event: React.MouseEvent<HTMLButtonElement>,
    item: Item,
  ) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setMenuItem(item);
  };

  const handleCloseMenu = () => {
    setMenuAnchor(null);
    setMenuItem(null);
  };

  const handleRequestDelete = () => {
    setConfirmItem(menuItem);
    handleCloseMenu();
  };

  const handleConfirmDelete = async () => {
    if (!confirmItem) {
      return;
    }
    try {
      await handleDelete(confirmItem.id);
    } finally {
      setConfirmItem(null);
    }
  };

  const visibleItems = listItems.slice(0, visibleCount);
  const hasMore = listItems.length > visibleCount;

  return (
    <Stack spacing={2}>
      <ListToolbar
        title="Tarefas"
        search={search}
        onSearchChange={setSearch}
        onCreate={handleCreate}
        createLabel="Nova tarefa"
      />
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'center' }}>
        <Tabs
          value={view}
          onChange={(_, value) => setView(value)}
          variant="scrollable"
          allowScrollButtonsMobile
        >
          <Tab value="list" label="Lista" />
          <Tab value="board" label="Board" />
        </Tabs>
        <Box sx={{ overflowX: 'auto' }}>
          <TaskFilters value={filterKey} onChange={setFilterKey} />
        </Box>
      </Stack>
      {isSeeding && <LoadingState message="Carregando dados..." />}
      {view === 'list' ? (
        listItems.length === 0 ? (
          <EmptyState
            title="Nenhuma tarefa"
            description="Crie a primeira tarefa para comecar."
            actionLabel="Nova tarefa"
            onAction={handleCreate}
          />
        ) : (
          <List dense disablePadding>
            {visibleItems.map((item) => {
              const status = (item.status ?? 'todo') as TaskStatus;
              const dueLabel = formatDueDate(item.dueDate);
              const isOverdue =
                typeof item.dueDate === 'number' &&
                item.dueDate < todayStart &&
                status !== 'done';

              const secondary = (
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Chip
                    size="small"
                    label={STATUS_LABELS[status]}
                    color={STATUS_COLORS[status]}
                  />
                  {dueLabel && (
                    <Chip
                      size="small"
                      label={`Vence ${dueLabel}`}
                      color={isOverdue ? 'error' : 'default'}
                      variant={isOverdue ? 'filled' : 'outlined'}
                    />
                  )}
                  {item.recurrence && (
                    <Chip size="small" label="Recorrente" icon={<Repeat fontSize="small" />} />
                  )}
                  {item.tags.map((tag) => (
                    <Chip key={tag} size="small" label={tag} variant="outlined" />
                  ))}
                </Stack>
              );

              const nextStatus = getNextStatus(status);

              const rightActions = (
                <>
                  <Tooltip title="Avancar status">
                    <span>
                      <IconButton
                        size="small"
                        aria-label="Avancar status"
                        onClick={() => handleUpdateStatus(item.id, nextStatus)}
                        disabled={status === 'done'}
                      >
                        <ArrowForward fontSize="small" />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <IconButton
                    size="small"
                    aria-label="Mais acoes"
                    onClick={(event) => handleOpenMenu(event, item)}
                  >
                    <MoreVert fontSize="small" />
                  </IconButton>
                </>
              );

              return (
                <ItemRow
                  key={item.id}
                  item={item}
                  onOpen={(id) => navigate(`/item/${id}`)}
                  secondary={secondary}
                  rightActions={rightActions}
                />
              );
            })}
          </List>
        )
      ) : (
        filteredItems.length === 0 ? (
          <EmptyState
            title="Nenhuma tarefa"
            description="Crie a primeira tarefa para comecar."
            actionLabel="Nova tarefa"
            onAction={handleCreate}
          />
        ) : (
          <TaskBoard
            tasks={filteredItems}
            onOpen={(id) => navigate(`/item/${id}`)}
            onUpdateStatus={handleUpdateStatus}
          />
        )
      )}
      {view === 'list' && hasMore && (
        <Box>
          <Button onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}>
            Carregar mais
          </Button>
        </Box>
      )}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleCloseMenu}>
        <MenuItem onClick={handleRequestDelete}>Excluir</MenuItem>
      </Menu>
      <ConfirmDialog
        open={Boolean(confirmItem)}
        title="Excluir tarefa?"
        description="Esta acao nao pode ser desfeita."
        confirmLabel="Excluir"
        confirmColor="error"
        onConfirm={handleConfirmDelete}
        onClose={() => setConfirmItem(null)}
      />
    </Stack>
  );
}
