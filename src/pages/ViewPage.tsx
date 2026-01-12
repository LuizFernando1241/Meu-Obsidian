import React from 'react';
import {
  Button,
  Checkbox,
  Chip,
  Divider,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  List,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import {
  DeleteOutline,
  DriveFileMoveOutlined,
  Star,
  StarBorder,
} from '@mui/icons-material';

import ItemRow from '../components/ItemRow';
import LoadingState from '../components/LoadingState';
import MoveToDialog from '../components/dialogs/MoveToDialog';
import ConfirmDialog from '../components/ConfirmDialog';
import { useNotifier } from '../components/Notifier';
import ViewCalendar from '../components/views/ViewCalendar';
import ViewKanban from '../components/views/ViewKanban';
import ViewTable from '../components/views/ViewTable';
import { db } from '../data/db';
import { filterActiveNodes } from '../data/deleted';
import { mergeNodeProps } from '../components/PropertiesEditor';
import { createNote, deleteNode, moveNode, updateItemProps, upsertView } from '../data/repo';
import type { Node, SavedViewSort } from '../data/types';
import { buildPathCache } from '../vault/pathCache';
import { runView } from '../views/runView';

const getLabel = (value: string | undefined, fallback: string) =>
  value && value.trim() ? value : fallback;

const STATUS_LABELS: Record<string, string> = {
  idea: 'Ideia',
  active: 'Ativo',
  waiting: 'Aguardando',
  done: 'Concluido',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baixa',
  medium: 'Media',
  high: 'Alta',
};

const SORT_LABELS: Record<SavedViewSort['by'], string> = {
  updatedAt: 'Atualizacao',
  title: 'Titulo',
  type: 'Tipo',
  path: 'Caminho',
  status: 'Status',
  due: 'Prazo',
  priority: 'Prioridade',
};

const formatStatusLabel = (value: string) => STATUS_LABELS[value] ?? value;
const formatPriorityLabel = (value: string) => PRIORITY_LABELS[value] ?? value;
const formatSortLabel = (value: SavedViewSort['by']) => SORT_LABELS[value] ?? value;
const formatSortDir = (value?: SavedViewSort['dir']) =>
  value === 'desc' ? 'decrescente' : 'crescente';

export default function ViewPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const notifier = useNotifier();
  const views = useLiveQuery(() => db.views.toArray(), []);
  const allItems = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const items = React.useMemo(() => filterActiveNodes(allItems), [allItems]);
  const pathCache = React.useMemo(() => buildPathCache(items), [items]);
  const itemsById = React.useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );
  const [moveTarget, setMoveTarget] = React.useState<Node | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Node | null>(null);
  const [displayMode, setDisplayMode] = React.useState<
    'list' | 'table' | 'kanban' | 'calendar'
  >('list');
  const [sortOverride, setSortOverride] = React.useState<SavedViewSort | undefined>(
    undefined,
  );
  const [isManualSort, setIsManualSort] = React.useState(false);
  const [kanbanDialogOpen, setKanbanDialogOpen] = React.useState(false);
  const [kanbanColumnsInput, setKanbanColumnsInput] = React.useState('');
  const [kanbanIncludeEmpty, setKanbanIncludeEmpty] = React.useState(true);
  const [calendarMonth, setCalendarMonth] = React.useState(() => {
    const today = new Date();
    return { year: today.getFullYear(), month: today.getMonth() };
  });

  if (!id) {
    return (
      <Stack spacing={2}>
        <Typography variant="h4" component="h1">
          Visao invalida
        </Typography>
        <Typography color="text.secondary">Selecione uma visao para continuar.</Typography>
      </Stack>
    );
  }

  if (!views) {
    return <LoadingState message="Carregando visao..." />;
  }

  const view = views.find((entry) => entry.id === id);
  const activeSort = sortOverride ?? view?.sort;
  const results = React.useMemo(
    () => (view ? runView(items, { ...view, sort: activeSort }) : []),
    [items, view, activeSort?.by, activeSort?.dir],
  );

  React.useEffect(() => {
    if (!view) {
      return;
    }
    setDisplayMode(view.displayMode ?? 'list');
    setSortOverride(view.sort);
    setIsManualSort(false);
    const today = new Date();
    setCalendarMonth({ year: today.getFullYear(), month: today.getMonth() });
  }, [view?.id]);

  React.useEffect(() => {
    if (!view || isManualSort) {
      return;
    }
    setSortOverride(view.sort);
  }, [view?.sort?.by, view?.sort?.dir, view?.id, isManualSort]);

  const defaultKanbanColumns = React.useMemo(
    () => ['idea', 'active', 'waiting', 'done'],
    [],
  );

  const kanbanColumns = React.useMemo(() => {
    const configured = view?.kanban?.columns ?? [];
    return configured.length > 0 ? configured : defaultKanbanColumns;
  }, [defaultKanbanColumns, view?.kanban?.columns]);

  const kanbanIncludeEmptyStatus =
    view?.kanban?.includeEmptyStatus ?? true;

  const calendarWeekStartsOn = view?.calendar?.weekStartsOn ?? 0;
  const calendarShowUndated = view?.calendar?.showUndated ?? true;

  React.useEffect(() => {
    if (!kanbanDialogOpen || !view) {
      return;
    }
    setKanbanColumnsInput(kanbanColumns.join(', '));
    setKanbanIncludeEmpty(kanbanIncludeEmptyStatus);
  }, [kanbanDialogOpen, kanbanColumns, kanbanIncludeEmptyStatus, view]);

  const hasSortOverride =
    sortOverride &&
    (!view?.sort ||
      sortOverride.by !== view.sort.by ||
      sortOverride.dir !== view.sort.dir);

  const handleToggleFavorite = async (node: Node) => {
    try {
      await updateItemProps(node.id, { favorite: !node.favorite });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao favoritar: ${message}`);
    }
  };

  const handleConfirmMove = async (parentId?: string) => {
    if (!moveTarget) {
      return;
    }
    try {
      await moveNode(moveTarget.id, parentId);
      notifier.success('Item movido');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao mover: ${message}`);
    } finally {
      setMoveTarget(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    try {
      await deleteNode(deleteTarget.id);
      notifier.success('Item excluido');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao excluir: ${message}`);
    } finally {
      setDeleteTarget(null);
    }
  };

  if (!view) {
    return (
      <Stack spacing={2}>
        <Typography variant="h4" component="h1">
          Visao nao encontrada
        </Typography>
        <Typography color="text.secondary">
          A visao solicitada nao existe ou foi removida.
        </Typography>
      </Stack>
    );
  }

  const query = view.query ?? {};
  const summary: string[] = [];
  const summarySort = activeSort ?? view.sort;

  if (query.text) {
    summary.push(`Texto: ${query.text}`);
  }
  if (query.type && query.type !== 'any') {
    summary.push(`Tipo: ${query.type === 'note' ? 'Notas' : 'Pastas'}`);
  }
  if (query.tags?.length) {
    summary.push(`Tags: ${query.tags.join(', ')}`);
  }
  if (query.status?.length) {
    summary.push(`Status: ${query.status.map(formatStatusLabel).join(', ')}`);
  }
  if (query.priority?.length) {
    summary.push(`Prioridade: ${query.priority.map(formatPriorityLabel).join(', ')}`);
  }
  if (query.favoritesOnly) {
    summary.push('Somente favoritos');
  }
  if (query.rootId) {
    const path = pathCache.get(query.rootId)?.pathText ?? '';
    summary.push(`Pasta: ${getLabel(path, query.rootId)}`);
  }
  if (query.pathPrefix) {
    summary.push(`Caminho: ${query.pathPrefix}`);
  }
  if (query.due) {
    const parts = [];
    if (query.due.from) {
      parts.push(`de ${query.due.from}`);
    }
    if (query.due.to) {
      parts.push(`ate ${query.due.to}`);
    }
    if (query.due.missing) {
      parts.push('sem prazo');
    }
    if (parts.length > 0) {
      summary.push(`Prazo: ${parts.join(', ')}`);
    }
  }
  if (typeof query.updatedSinceDays === 'number') {
    summary.push(`Atualizadas nos ultimos ${query.updatedSinceDays} dias`);
  }
  if (summarySort?.by) {
    summary.push(
      `Ordenar: ${formatSortLabel(summarySort.by)} (${formatSortDir(summarySort.dir)})`,
    );
  }

  const handleDisplayModeChange = async (
    _event: React.MouseEvent<HTMLElement>,
    nextMode: 'list' | 'table' | 'kanban' | 'calendar' | null,
  ) => {
    if (!view || !nextMode || nextMode === displayMode) {
      return;
    }
    setDisplayMode(nextMode);
    try {
      await upsertView({
        ...view,
        displayMode: nextMode,
        updatedAt: Date.now(),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao atualizar visao: ${message}`);
    }
  };

  const handleSortChange = (nextSort: SavedViewSort) => {
    setSortOverride(nextSort);
    setIsManualSort(true);
  };

  const handleSaveSort = async () => {
    if (!view || !sortOverride) {
      return;
    }
    try {
      await upsertView({
        ...view,
        sort: sortOverride,
        updatedAt: Date.now(),
      });
      notifier.success('Ordenacao salva');
      setIsManualSort(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao salvar ordenacao: ${message}`);
    }
  };

  const handleUpdateProps = async (nodeId: string, patch: Record<string, unknown>) => {
    const node = itemsById.get(nodeId);
    if (!node) {
      return;
    }
    const current =
      node.props && typeof node.props === 'object'
        ? (node.props as Record<string, unknown>)
        : {};
    const nextProps = mergeNodeProps(current, patch);
    try {
      await updateItemProps(nodeId, { props: nextProps });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao atualizar propriedades: ${message}`);
    }
  };

  const handleCalendarMonthChange = (year: number, month: number) => {
    setCalendarMonth({ year, month });
  };

  const handleCreateNoteForDate = async (dueISO: string) => {
    if (!view) {
      return;
    }
    try {
      const created = await createNote({
        title: `Nota - ${dueISO}`,
        parentId: view.query?.rootId ?? undefined,
        props: { due: dueISO },
      });
      notifier.success('Nota criada');
      navigate(`/item/${created.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao criar nota: ${message}`);
    }
  };

  const handleMoveStatus = async (nodeId: string, newStatus: string | null) => {
    const node = itemsById.get(nodeId);
    if (!node) {
      return;
    }
    const current =
      node.props && typeof node.props === 'object'
        ? (node.props as Record<string, unknown>)
        : {};
    const currentStatus = typeof current.status === 'string' ? current.status : '';
    const nextStatus = newStatus ?? '';
    if (currentStatus === nextStatus) {
      return;
    }
    await handleUpdateProps(nodeId, { status: newStatus ?? undefined });
  };

  const handleSaveKanbanConfig = async () => {
    if (!view) {
      return;
    }
    const columns = kanbanColumnsInput
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    try {
      await upsertView({
        ...view,
        kanban: {
          columns: columns.length > 0 ? columns : defaultKanbanColumns,
          includeEmptyStatus: kanbanIncludeEmpty,
        },
        updatedAt: Date.now(),
      });
      notifier.success('Kanban atualizado');
      setKanbanDialogOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao salvar kanban: ${message}`);
    }
  };

  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          alignItems={{ sm: 'center' }}
          justifyContent="space-between"
        >
          <Typography variant="h4" component="h1">
            {view.name}
          </Typography>
          <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
            {hasSortOverride && (
              <Button size="small" variant="outlined" onClick={handleSaveSort}>
                Salvar ordenacao
              </Button>
            )}
            {displayMode === 'kanban' && (
              <Button size="small" variant="outlined" onClick={() => setKanbanDialogOpen(true)}>
                Configurar colunas
              </Button>
            )}
            <ToggleButtonGroup
              size="small"
              value={displayMode}
              exclusive
              onChange={handleDisplayModeChange}
              aria-label="Modo de visualizacao"
            >
              <ToggleButton value="list">Lista</ToggleButton>
              <ToggleButton value="table">Tabela</ToggleButton>
              <ToggleButton value="kanban">Kanban</ToggleButton>
              <ToggleButton value="calendar">Calendario</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </Stack>
        <Typography color="text.secondary">
          {results.length} item{results.length === 1 ? '' : 's'} nesta visao.
        </Typography>
        {summary.length === 0 ? (
          <Typography color="text.secondary">Sem filtros aplicados.</Typography>
        ) : (
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {summary.map((entry) => (
              <Chip key={entry} size="small" label={entry} />
            ))}
          </Stack>
        )}
      </Stack>
      <Divider />
      {results.length === 0 ? (
        <Typography color="text.secondary">Nenhum item encontrado.</Typography>
      ) : displayMode === 'table' ? (
        <ViewTable
          nodes={results}
          pathCache={pathCache}
          onOpen={(itemId) => navigate(`/item/${itemId}`)}
          onUpdateProps={handleUpdateProps}
          sortState={activeSort}
          onSortChange={handleSortChange}
          compact={Boolean(view.table?.compact)}
        />
      ) : displayMode === 'kanban' ? (
        <ViewKanban
          nodes={results}
          columns={kanbanColumns}
          includeEmptyStatus={kanbanIncludeEmptyStatus}
          onOpen={(itemId) => navigate(`/item/${itemId}`)}
          onMove={handleMoveStatus}
        />
      ) : displayMode === 'calendar' ? (
        <ViewCalendar
          nodes={results}
          month={calendarMonth}
          onMonthChange={handleCalendarMonthChange}
          onOpen={(itemId) => navigate(`/item/${itemId}`)}
          onCreateNote={handleCreateNoteForDate}
          weekStartsOn={calendarWeekStartsOn}
          showUndated={calendarShowUndated}
        />
      ) : (
        <List disablePadding>
          {results.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              onOpen={(itemId) => navigate(`/item/${itemId}`)}
              rightActions={
                <>
                  <Tooltip title={item.favorite ? 'Remover favorito' : 'Favoritar'}>
                    <IconButton
                      size="small"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleToggleFavorite(item);
                      }}
                    >
                      {item.favorite ? (
                        <Star fontSize="small" />
                      ) : (
                        <StarBorder fontSize="small" />
                      )}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Mover">
                    <IconButton
                      size="small"
                      onClick={(event) => {
                        event.stopPropagation();
                        setMoveTarget(item);
                      }}
                    >
                      <DriveFileMoveOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Excluir">
                    <IconButton
                      size="small"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteTarget(item);
                      }}
                    >
                      <DeleteOutline fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              }
            />
          ))}
        </List>
      )}
      <MoveToDialog
        open={Boolean(moveTarget)}
        nodeId={moveTarget?.id ?? ''}
        nodeType={moveTarget?.nodeType ?? 'note'}
        currentParentId={moveTarget?.parentId}
        nodes={items}
        onClose={() => setMoveTarget(null)}
        onConfirm={handleConfirmMove}
      />
      <Dialog open={kanbanDialogOpen} onClose={() => setKanbanDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Configurar colunas</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              label="Colunas (separadas por virgula)"
              value={kanbanColumnsInput}
              onChange={(event) => setKanbanColumnsInput(event.target.value)}
              fullWidth
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={kanbanIncludeEmpty}
                  onChange={(event) => setKanbanIncludeEmpty(event.target.checked)}
                />
              }
              label="Incluir sem status"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setKanbanDialogOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSaveKanbanConfig}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Excluir item?"
        description="O item sera movido para a lixeira."
        confirmLabel="Excluir"
        confirmColor="error"
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </Stack>
  );
}
