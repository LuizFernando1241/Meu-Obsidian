import React from 'react';
import {
  Checkbox,
  FormControlLabel,
  IconButton,
  List,
  Menu,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { MoreVert, Star } from '@mui/icons-material';
import { format } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';

import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import ItemRow from '../components/ItemRow';
import MoveToDialog from '../components/dialogs/MoveToDialog';
import { useNotifier } from '../components/Notifier';
import { db } from '../data/db';
import { deleteNode, moveNode, updateItemProps } from '../data/repo';
import type { Node as DataNode, NoteNode } from '../data/types';
import { buildPathCache } from '../vault/pathCache';
import { formatPath } from '../vault/path';

const formatUpdatedAt = (value: number) =>
  format(new Date(value), 'yyyy-MM-dd HH:mm');

const getDisplayPath = (
  pathInfo: { pathIds: string[] } | undefined,
  nodesById: Map<string, DataNode>,
) => {
  if (!pathInfo) {
    return 'Raiz';
  }
  const nodes = pathInfo.pathIds
    .map((id) => nodesById.get(id))
    .filter((node): node is DataNode => Boolean(node));
  if (nodes.length <= 1) {
    return 'Raiz';
  }
  return formatPath(nodes.slice(0, -1));
};

export default function RecentPage() {
  const navigate = useNavigate();
  const notifier = useNotifier();
  const nodes = useLiveQuery(() => db.items.toArray(), []) ?? [];

  const notes = React.useMemo(
    () => nodes.filter((node): node is NoteNode => node.nodeType === 'note'),
    [nodes],
  );

  const nodesById = React.useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );
  const pathCache = React.useMemo(() => buildPathCache(nodes), [nodes]);

  const [query, setQuery] = React.useState('');
  const [onlyQuick, setOnlyQuick] = React.useState(false);

  const filtered = React.useMemo(() => {
    const normalized = query.trim().toLowerCase();
    let list = notes;
    if (onlyQuick) {
      list = list.filter((note) => !note.parentId);
    }
    if (normalized) {
      list = list.filter((note) => note.title.toLowerCase().includes(normalized));
    }
    return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [notes, onlyQuick, query]);

  const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null);
  const [menuNoteId, setMenuNoteId] = React.useState<string | null>(null);
  const [moveNoteId, setMoveNoteId] = React.useState<string | null>(null);
  const [deleteNoteId, setDeleteNoteId] = React.useState<string | null>(null);

  const menuNote = menuNoteId ? nodesById.get(menuNoteId) : undefined;
  const moveNote = moveNoteId ? nodesById.get(moveNoteId) : undefined;
  const deleteNote = deleteNoteId ? nodesById.get(deleteNoteId) : undefined;

  const handleOpenMenu = (event: React.MouseEvent<HTMLButtonElement>, noteId: string) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setMenuNoteId(noteId);
  };

  const handleCloseMenu = () => {
    setMenuAnchor(null);
    setMenuNoteId(null);
  };

  const handleOpenNote = (noteId: string) => {
    navigate(`/item/${noteId}`);
  };

  const handleRequestMove = () => {
    if (!menuNoteId) {
      return;
    }
    setMoveNoteId(menuNoteId);
    handleCloseMenu();
  };

  const handleConfirmMove = async (parentId?: string) => {
    if (!moveNoteId) {
      return;
    }
    try {
      await moveNode(moveNoteId, parentId);
      notifier.success('Nota movida');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao mover: ${message}`);
    } finally {
      setMoveNoteId(null);
    }
  };

  const handleToggleFavorite = async () => {
    if (!menuNote) {
      return;
    }
    try {
      await updateItemProps(menuNote.id, { favorite: !menuNote.favorite });
      notifier.success(menuNote.favorite ? 'Removido dos favoritos' : 'Favoritado');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao atualizar favorito: ${message}`);
    } finally {
      handleCloseMenu();
    }
  };

  const handleRequestDelete = () => {
    if (!menuNoteId) {
      return;
    }
    setDeleteNoteId(menuNoteId);
    handleCloseMenu();
  };

  const handleConfirmDelete = async () => {
    if (!deleteNoteId) {
      return;
    }
    try {
      await deleteNode(deleteNoteId);
      notifier.success('Nota excluida');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao excluir: ${message}`);
    } finally {
      setDeleteNoteId(null);
    }
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h4" component="h1">
          Recentes
        </Typography>
        <Typography color="text.secondary">
          {filtered.length} notas recentes.
        </Typography>
      </Stack>

      <Stack spacing={2} direction={{ xs: 'column', md: 'row' }}>
        <TextField
          label="Filtrar por titulo"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          fullWidth
        />
        <FormControlLabel
          control={
            <Checkbox
              checked={onlyQuick}
              onChange={(event) => setOnlyQuick(event.target.checked)}
            />
          }
          label="Somente Quick Notes"
        />
      </Stack>

      {filtered.length === 0 ? (
        <EmptyState title="Nenhuma nota recente" />
      ) : (
        <List disablePadding>
          {filtered.map((note) => {
            const pathInfo = pathCache.get(note.id);
            const pathLabel = getDisplayPath(pathInfo, nodesById);
            const secondary = (
              <Stack spacing={0.25}>
                <Typography variant="body2" color="text.secondary">
                  {pathLabel}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {`Atualizado ${formatUpdatedAt(note.updatedAt)}`}
                </Typography>
              </Stack>
            );

            return (
              <ItemRow
                key={note.id}
                item={note}
                onOpen={handleOpenNote}
                secondary={secondary}
                leftIcon={note.favorite ? <Star fontSize="small" /> : undefined}
                rightActions={
                  <IconButton
                    aria-label="Acoes"
                    onClick={(event) => handleOpenMenu(event, note.id)}
                  >
                    <MoreVert />
                  </IconButton>
                }
              />
            );
          })}
        </List>
      )}

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleCloseMenu}>
        <MenuItem onClick={handleRequestMove}>Mover para...</MenuItem>
        <MenuItem onClick={handleToggleFavorite}>
          {menuNote?.favorite ? 'Remover favorito' : 'Favoritar'}
        </MenuItem>
        <MenuItem onClick={handleRequestDelete}>Excluir</MenuItem>
      </Menu>

      <MoveToDialog
        open={Boolean(moveNoteId && moveNote)}
        nodeId={moveNoteId ?? ''}
        nodeType="note"
        currentParentId={moveNote?.parentId}
        nodes={nodes as DataNode[]}
        onClose={() => setMoveNoteId(null)}
        onConfirm={handleConfirmMove}
      />

      <ConfirmDialog
        open={Boolean(deleteNoteId && deleteNote)}
        title="Excluir nota?"
        description="Esta acao nao pode ser desfeita."
        confirmLabel="Excluir"
        confirmColor="error"
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteNoteId(null)}
      />
    </Stack>
  );
}
