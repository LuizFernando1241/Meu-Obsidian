import React from 'react';
import {
  Box,
  ButtonBase,
  Checkbox,
  Chip,
  IconButton,
  List,
  ListItem,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { addDays } from 'date-fns';
import {
  DeleteOutline,
  DriveFileMoveOutlined,
  Star,
  StarBorder,
} from '@mui/icons-material';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';

import ItemRow from '../components/ItemRow';
import ConfirmDialog from '../components/ConfirmDialog';
import MoveToDialog from '../components/dialogs/MoveToDialog';
import { useNotifier } from '../components/Notifier';
import { mergeNodeProps } from '../components/PropertiesEditor';
import DateField from '../components/DateField';
import { db } from '../data/db';
import { filterActiveNodes } from '../data/deleted';
import {
  deleteNode,
  moveNode,
  setChecklistDue,
  toggleChecklist,
  updateItemProps,
} from '../data/repo';
import type { Node, NoteNode, PropertySchema, TaskIndexRow } from '../data/types';
import type { IndexedTask } from '../tasks/taskIndex';
import { getTodayISO, toISODate } from '../tasks/date';
import { mapTaskIndexRow } from '../tasks/taskIndexView';
import { buildPathCache } from '../vault/pathCache';
import { useSpaceStore } from '../store/useSpaceStore';

const STALE_NOTE_DAYS = 14;
const STALE_FOLDER_DAYS = 30;
const UPCOMING_DAYS = 7;

const TASK_STATUS_LABELS: Record<string, string> = {
  open: 'Aberta',
  doing: 'Em andamento',
  waiting: 'Aguardando',
};

const formatTaskStatus = (value: string) => TASK_STATUS_LABELS[value] ?? value;

const getNodeDue = (node: Node) => {
  const props = node.props as Record<string, unknown> | undefined;
  return typeof props?.due === 'string' ? props.due : '';
};

const Section = ({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) => (
  <Stack spacing={1.5}>
    <Stack direction="row" spacing={1} alignItems="center">
      <Typography variant="h5">{title}</Typography>
      <Chip size="small" label={String(count)} />
    </Stack>
    {children}
  </Stack>
);

export default function ReviewPage() {
  const navigate = useNavigate();
  const notifier = useNotifier();
  const space = useSpaceStore((state) => state.space);
  const allItems = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const items = React.useMemo(() => filterActiveNodes(allItems), [allItems]);
  const pathCache = React.useMemo(() => buildPathCache(items), [items]);
  const notes = React.useMemo(
    () => items.filter((item): item is NoteNode => item.nodeType === 'note'),
    [items],
  );
  const notesById = React.useMemo(
    () => new Map(notes.map((note) => [note.id, note])),
    [notes],
  );
  const schemas = useLiveQuery(() => db.schemas.toArray(), []) ?? [];
  const schemasById = React.useMemo(
    () => new Map(schemas.map((schema) => [schema.id, schema])),
    [schemas],
  );
  const tasksIndex =
    useLiveQuery(
      () => db.tasks_index.where('space').equals(space).toArray(),
      [space],
    ) ?? [];

  const [moveTarget, setMoveTarget] = React.useState<Node | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Node | null>(null);

  const todayISO = getTodayISO();
  const openRows = React.useMemo(
    () => tasksIndex.filter((row) => row.status !== 'DONE'),
    [tasksIndex],
  );
  const openTasks = React.useMemo(
    () =>
      openRows.map((row) =>
        mapTaskIndexRow(
          row,
          notesById.get(row.noteId),
          pathCache.get(row.noteId),
          todayISO,
        ),
      ),
    [notesById, openRows, pathCache, todayISO],
  );
  const upcomingISO = toISODate(addDays(new Date(), UPCOMING_DAYS));

  const overdueTasks = React.useMemo(
    () =>
      openRows
        .filter((row) => row.dueDay && row.dueDay < todayISO)
        .map((row) =>
          mapTaskIndexRow(
            row,
            notesById.get(row.noteId),
            pathCache.get(row.noteId),
            todayISO,
          ),
        ),
    [notesById, openRows, pathCache, todayISO],
  );
  const noDueTasks = React.useMemo(
    () =>
      openRows
        .filter((row) => !row.dueDay)
        .map((row) =>
          mapTaskIndexRow(
            row,
            notesById.get(row.noteId),
            pathCache.get(row.noteId),
            todayISO,
          ),
        ),
    [notesById, openRows, pathCache, todayISO],
  );
  const upcomingTasks = React.useMemo(
    () =>
      openRows
        .filter(
          (row) => row.dueDay && row.dueDay >= todayISO && row.dueDay <= upcomingISO,
        )
        .map((row) =>
          mapTaskIndexRow(
            row,
            notesById.get(row.noteId),
            pathCache.get(row.noteId),
            todayISO,
          ),
        ),
    [notesById, openRows, pathCache, todayISO, upcomingISO],
  );

  const staleNotes = React.useMemo(() => {
    const threshold = Date.now() - STALE_NOTE_DAYS * 24 * 60 * 60 * 1000;
    return notes.filter((note) => note.updatedAt < threshold);
  }, [notes]);

  const staleFolders = React.useMemo(() => {
    const threshold = Date.now() - STALE_FOLDER_DAYS * 24 * 60 * 60 * 1000;
    return items.filter((item) => item.nodeType === 'folder' && item.updatedAt < threshold);
  }, [items]);

  const favorites = React.useMemo(
    () => items.filter((item) => item.favorite),
    [items],
  );

  const getSchemaIdFromProps = (props?: Record<string, unknown>) => {
    const raw = typeof props?.schemaId === 'string' ? props.schemaId.trim() : '';
    return raw ? raw : undefined;
  };

  const isProjectSchema = (schemaId?: string, schemaName?: string) => {
    const haystack = `${schemaId ?? ''} ${schemaName ?? ''}`.toLowerCase();
    return haystack.includes('project') || haystack.includes('projeto');
  };

  const isProjectActive = (node: Node) => {
    const props = node.props as Record<string, unknown> | undefined;
    const statusRaw =
      (typeof props?.projectStatus === 'string' && props.projectStatus) ||
      (typeof props?.status === 'string' && props.status) ||
      '';
    const status = statusRaw.toLowerCase();
    if (!status) {
      return true;
    }
    return !['done', 'paused', 'archived', 'inactive', 'cancelled'].includes(status);
  };

  const projects = React.useMemo(() => {
    return items.filter((item) => {
      if (item.nodeType !== 'folder') {
        return false;
      }
      const props = item.props as Record<string, unknown> | undefined;
      const spaceValue = typeof props?.space === 'string' ? props.space : undefined;
      if (spaceValue && spaceValue !== space) {
        return false;
      }
      const schemaId = getSchemaIdFromProps(item.props as Record<string, unknown> | undefined);
      if (!schemaId) {
        return false;
      }
      const schema = schemasById.get(schemaId) as PropertySchema | undefined;
      return isProjectSchema(schemaId, schema?.name);
    });
  }, [items, schemasById, space]);

  const projectsMissingNext = React.useMemo(() => {
    const byProject = new Map<string, TaskIndexRow[]>();
    openRows.forEach((row) => {
      if (!row.projectId) {
        return;
      }
      const list = byProject.get(row.projectId) ?? [];
      list.push(row);
      byProject.set(row.projectId, list);
    });
    return projects.filter((project) => {
      if (!isProjectActive(project)) {
        return false;
      }
      const rows = byProject.get(project.id) ?? [];
      const hasNext = rows.some((row) => row.isNextAction && row.status !== 'DONE');
      const hasDoing = rows.some((row) => row.status === 'DOING');
      return !hasNext && !hasDoing;
    });
  }, [openRows, projects]);

  const handleOpenTask = (task: IndexedTask) => {
    navigate(`/item/${task.noteId}`, { state: { highlightBlockId: task.blockId } });
  };

  const handleToggleTask = async (task: IndexedTask, checked: boolean) => {
    try {
      await toggleChecklist(task.noteId, task.blockId, checked);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao atualizar tarefa: ${message}`);
    }
  };

  const handleTaskDue = async (task: IndexedTask, due: string | null) => {
    try {
      await setChecklistDue(task.noteId, task.blockId, due);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao definir prazo: ${message}`);
    }
  };

  const handleToggleFavorite = async (node: Node) => {
    try {
      await updateItemProps(node.id, { favorite: !node.favorite });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao favoritar: ${message}`);
    }
  };

  const handleUpdateNodeDue = async (node: Node, due: string | null) => {
    const current =
      node.props && typeof node.props === 'object' ? (node.props as Record<string, unknown>) : {};
    const nextProps = mergeNodeProps(current, { due: due ?? undefined });
    try {
      await updateItemProps(node.id, { props: nextProps });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao definir prazo: ${message}`);
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

  const renderTaskList = (list: IndexedTask[]) =>
    list.length === 0 ? (
      <Typography color="text.secondary">Nada por aqui.</Typography>
    ) : (
      <List disablePadding>
        {list.map((task) => {
          const note = notesById.get(task.noteId);
          return (
            <ListItem key={`${task.noteId}:${task.blockId}`} divider alignItems="flex-start">
              <Checkbox
                checked={task.checked}
                onChange={(event) => handleToggleTask(task, event.target.checked)}
                sx={{ mt: 0.5 }}
              />
              <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
                <ButtonBase
                  onClick={() => handleOpenTask(task)}
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
                    {task.text.trim() ? task.text : 'Checklist'}
                  </Typography>
                </ButtonBase>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Chip
                    label={task.noteTitle}
                    size="small"
                    onClick={() => handleOpenTask(task)}
                  />
                  {task.notePath && (
                    <Typography variant="caption" color="text.secondary">
                      {task.notePath}
                    </Typography>
                  )}
                  {task.priority && <Chip size="small" label={task.priority} variant="outlined" />}
                  {task.status && task.status !== 'open' && (
                    <Chip size="small" label={formatTaskStatus(task.status)} variant="outlined" />
                  )}
                  <Box sx={{ minWidth: { xs: '100%', sm: 160 } }}>
                    <DateField
                      label="Prazo"
                      size="small"
                      value={task.due ?? ''}
                      onCommit={(next) => handleTaskDue(task, next)}
                      fullWidth
                    />
                  </Box>
                </Stack>
              </Stack>
              <Stack direction="row" spacing={0.5} sx={{ ml: 1 }}>
                {note && (
                  <Tooltip title={note.favorite ? 'Remover favorito' : 'Favoritar'}>
                    <IconButton
                      size="small"
                      onClick={() => handleToggleFavorite(note)}
                    >
                      {note.favorite ? <Star fontSize="small" /> : <StarBorder fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                )}
                {note && (
                  <Tooltip title="Mover nota">
                    <IconButton size="small" onClick={() => setMoveTarget(note)}>
                      <DriveFileMoveOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                )}
              </Stack>
            </ListItem>
          );
        })}
      </List>
    );

  const renderNodeList = (list: Node[]) =>
    list.length === 0 ? (
      <Typography color="text.secondary">Nada por aqui.</Typography>
    ) : (
      <List disablePadding>
        {list.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            onOpen={(itemId) => navigate(`/item/${itemId}`)}
            rightActions={
              <Stack direction="row" spacing={0.5} alignItems="center">
                <Box sx={{ width: 150 }}>
                  <DateField
                    label="Prazo"
                    size="small"
                    value={getNodeDue(item)}
                    onClick={(event) => event.stopPropagation()}
                    onCommit={(next) => handleUpdateNodeDue(item, next)}
                    fullWidth
                  />
                </Box>
                <Tooltip title={item.favorite ? 'Remover favorito' : 'Favoritar'}>
                  <IconButton
                    size="small"
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleToggleFavorite(item);
                    }}
                  >
                    {item.favorite ? <Star fontSize="small" /> : <StarBorder fontSize="small" />}
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
              </Stack>
            }
          />
        ))}
      </List>
    );

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4" component="h1">
          Revisao
        </Typography>
        <Typography color="text.secondary">
          Painel semanal para focar no que importa.
        </Typography>
      </Stack>

      <Section title="Atrasadas" count={overdueTasks.length}>
        {renderTaskList(overdueTasks)}
      </Section>

      <Section title="Sem data" count={noDueTasks.length}>
        {renderTaskList(noDueTasks)}
      </Section>

      <Section title="Proximas 7 dias" count={upcomingTasks.length}>
        {renderTaskList(upcomingTasks)}
      </Section>

      <Section title="Projetos sem proxima acao" count={projectsMissingNext.length}>
        {renderNodeList(projectsMissingNext)}
      </Section>

      <Section title={`Notas stale (${STALE_NOTE_DAYS}d)`} count={staleNotes.length}>
        {renderNodeList(staleNotes)}
      </Section>

      <Section
        title={`Pastas sem atividade (${STALE_FOLDER_DAYS}d)`}
        count={staleFolders.length}
      >
        {renderNodeList(staleFolders)}
      </Section>

      <Section title="Favoritos" count={favorites.length}>
        {renderNodeList(favorites)}
      </Section>

      <MoveToDialog
        open={Boolean(moveTarget)}
        nodeId={moveTarget?.id ?? ''}
        nodeType={moveTarget?.nodeType ?? 'note'}
        currentParentId={moveTarget?.parentId}
        nodes={items}
        onClose={() => setMoveTarget(null)}
        onConfirm={handleConfirmMove}
      />
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
