import React from 'react';
import {
  Box,
  Button,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Typography,
} from '@mui/material';
import { MoreVert } from '@mui/icons-material';
import { format } from 'date-fns';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';

import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import { useNotifier } from '../components/Notifier';
import MoveToDialog from '../components/dialogs/MoveToDialog';
import NewNoteDialog from '../components/dialogs/NewNoteDialog';
import { db } from '../data/db';
import { createNote, deleteNode, moveNode } from '../data/repo';
import type { Node as DataNode, NoteNode } from '../data/types';
import { getTemplateContent } from '../vault/templates';

const formatUpdatedAt = (value: number) =>
  format(new Date(value), 'yyyy-MM-dd HH:mm');

export default function QuickNotesPage() {
  const navigate = useNavigate();
  const notifier = useNotifier();

  const nodes = useLiveQuery(() => db.items.toArray(), []) ?? [];

  const quickNotes = React.useMemo(
    () =>
      nodes
        .filter(
          (node): node is NoteNode => node.nodeType === 'note' && !node.parentId,
        )
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [nodes],
  );

  const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null);
  const [menuNoteId, setMenuNoteId] = React.useState<string | null>(null);
  const [moveNoteId, setMoveNoteId] = React.useState<string | null>(null);
  const [deleteNoteId, setDeleteNoteId] = React.useState<string | null>(null);
  const [newNoteOpen, setNewNoteOpen] = React.useState(false);

  const moveNote = moveNoteId ? nodes.find((node) => node.id === moveNoteId) : undefined;
  const deleteNote = deleteNoteId ? nodes.find((node) => node.id === deleteNoteId) : undefined;

  const handleOpenMenu = (event: React.MouseEvent<HTMLButtonElement>, noteId: string) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setMenuNoteId(noteId);
  };

  const handleCloseMenu = () => {
    setMenuAnchor(null);
    setMenuNoteId(null);
  };

  const handleOpenNote = (noteId: string, focusEditor = false) => {
    navigate(`/item/${noteId}`, focusEditor ? { state: { focusEditor: true } } : undefined);
  };

  const handleCreateQuickNote = async (payload: { title?: string; templateId: string }) => {
    try {
      const content = getTemplateContent(payload.templateId);
      const created = await createNote({
        title: payload.title,
        content,
      });
      notifier.success('Nota rapida criada');
      setNewNoteOpen(false);
      handleOpenNote(created.id, true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao criar nota: ${message}`);
    }
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
          Notas rapidas
        </Typography>
        <Typography color="text.secondary">
          {quickNotes.length} notas na raiz.
        </Typography>
        <Box>
          <Button variant="contained" onClick={() => setNewNoteOpen(true)}>
            + Nota rapida
          </Button>
        </Box>
      </Stack>

      {quickNotes.length === 0 ? (
        <EmptyState
          title="Nenhuma nota rapida"
          description="Crie uma nota para guardar ideias temporarias."
          actionLabel="Nova nota"
          onAction={() => setNewNoteOpen(true)}
        />
      ) : (
        <List disablePadding>
          {quickNotes.map((note) => (
            <ListItem
              key={note.id}
              divider
              disablePadding
              secondaryAction={
                <IconButton
                  edge="end"
                  aria-label="Acoes"
                  onClick={(event) => handleOpenMenu(event, note.id)}
                >
                  <MoreVert />
                </IconButton>
              }
            >
              <ListItemButton onClick={() => handleOpenNote(note.id)}>
                <ListItemText
                  primary={note.title || 'Sem titulo'}
                  secondary={`Atualizado ${formatUpdatedAt(note.updatedAt)}`}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      )}

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleCloseMenu}>
        <MenuItem onClick={handleRequestMove}>Mover para...</MenuItem>
        <MenuItem onClick={handleRequestDelete}>Excluir</MenuItem>
      </Menu>

      <MoveToDialog
        open={Boolean(moveNoteId && moveNote)}
        nodeId={moveNoteId ?? ''}
        nodeType={(moveNote as DataNode | undefined)?.nodeType ?? 'note'}
        currentParentId={(moveNote as DataNode | undefined)?.parentId}
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

      <NewNoteDialog
        open={newNoteOpen}
        onClose={() => setNewNoteOpen(false)}
        onConfirm={handleCreateQuickNote}
      />
    </Stack>
  );
}
