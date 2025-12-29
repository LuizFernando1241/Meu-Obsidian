import React from 'react';
import { Breadcrumbs, Button, Stack, Typography } from '@mui/material';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';

import EmptyState from '../components/EmptyState';
import ItemList from '../components/ItemList';
import { useNotifier } from '../components/Notifier';
import MoveToDialog from '../components/dialogs/MoveToDialog';
import NewNoteDialog from '../components/dialogs/NewNoteDialog';
import RenameDialog from '../components/dialogs/RenameDialog';
import { db } from '../data/db';
import { filterActiveNodes } from '../data/deleted';
import { useChildren, useItem } from '../data/hooks';
import { createFolder, createNote, deleteNode, moveNode, renameNode } from '../data/repo';
import type { Block, Node as DataNode } from '../data/types';
import { getPath } from '../vault/path';
import { getTemplateContent } from '../vault/templates';

type FolderPageProps = {
  folderId: string;
};

export default function FolderPage({ folderId }: FolderPageProps) {
  const navigate = useNavigate();
  const notifier = useNotifier();
  const folder = useItem(folderId);
  const children = useChildren(folderId);
  const allNodes = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const nodes = React.useMemo(() => filterActiveNodes(allNodes), [allNodes]);
  const nodesById = React.useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );
  const breadcrumbNodes = React.useMemo(
    () => (folderId ? getPath(folderId, nodesById) : []),
    [folderId, nodesById],
  );
  const folderTemplateBlocks =
    folder?.props &&
    Array.isArray((folder.props as Record<string, unknown>).templateBlocks)
      ? ((folder.props as Record<string, unknown>).templateBlocks as Block[])
      : [];
  const hasFolderTemplate = folderTemplateBlocks.length > 0;

  const subfolders = React.useMemo(
    () =>
      [...children]
        .filter((item) => item.nodeType === 'folder')
        .sort((a, b) => (a.title || '').localeCompare(b.title || '')),
    [children],
  );
  const notes = React.useMemo(
    () =>
      [...children]
        .filter((item) => item.nodeType === 'note')
        .sort((a, b) => (a.title || '').localeCompare(b.title || '')),
    [children],
  );

  const handleCreateFolder = async () => {
    try {
      const created = await createFolder({ parentId: folderId });
      notifier.success('Pasta criada');
      navigate(`/item/${created.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao criar pasta: ${message}`);
    }
  };

  const [moveOpen, setMoveOpen] = React.useState(false);
  const [renameOpen, setRenameOpen] = React.useState(false);
  const [newNoteOpen, setNewNoteOpen] = React.useState(false);

  const handleDelete = async (id: string) => {
    try {
      await deleteNode(id);
      notifier.success('Item excluido');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao excluir: ${message}`);
    }
  };

  if (!folderId) {
    return (
      <Stack spacing={2}>
        <Typography variant="h4" component="h1">
          Pasta nao encontrada
        </Typography>
        <Typography color="text.secondary">
          A pasta solicitada nao existe ou foi removida.
        </Typography>
      </Stack>
    );
  }

  if (!folder || folder.nodeType !== 'folder') {
    return <EmptyState title="Carregando pasta..." />;
  }

  const handleConfirmRename = async (value: string) => {
    try {
      await renameNode(folderId, value);
      notifier.success('Pasta renomeada');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao renomear: ${message}`);
    } finally {
      setRenameOpen(false);
    }
  };

  const handleConfirmMove = async (parentId?: string) => {
    try {
      await moveNode(folderId, parentId);
      notifier.success('Pasta movida');
      navigate(`/item/${folderId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao mover: ${message}`);
    } finally {
      setMoveOpen(false);
    }
  };

  const handleCreateNote = async (payload: { title?: string; templateId: string }) => {
    try {
      const content = hasFolderTemplate ? undefined : getTemplateContent(payload.templateId);
      const created = await createNote({ parentId: folderId, title: payload.title, content });
      notifier.success('Nota criada');
      setNewNoteOpen(false);
      navigate(`/item/${created.id}`, { state: { focusEditor: true } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao criar nota: ${message}`);
    }
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        {breadcrumbNodes.length > 0 && (
          <Breadcrumbs>
            {breadcrumbNodes.map((node, index) => {
              const isLast = index === breadcrumbNodes.length - 1;
              if (isLast) {
                return (
                  <Typography key={node.id} color="text.primary">
                    {node.title || 'Sem titulo'}
                  </Typography>
                );
              }
              return (
                <Button
                  key={node.id}
                  size="small"
                  onClick={() => navigate(`/item/${node.id}`)}
                  sx={{ textTransform: 'none', minWidth: 0 }}
                >
                  {node.title || 'Sem titulo'}
                </Button>
              );
            })}
          </Breadcrumbs>
        )}
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1}
          alignItems={{ sm: 'center' }}
        >
          <Typography variant="h4" component="h1">
            {folder.title || 'Pasta'}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ ml: { sm: 'auto' } }}>
            <Button variant="outlined" onClick={() => setMoveOpen(true)}>
              Mover
            </Button>
            <Button variant="outlined" onClick={() => setRenameOpen(true)}>
              Renomear
            </Button>
          </Stack>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button variant="contained" onClick={() => setNewNoteOpen(true)}>
            Criar nota
          </Button>
          <Button variant="outlined" onClick={handleCreateFolder}>
            Criar pasta
          </Button>
        </Stack>
      </Stack>

      {subfolders.length === 0 && notes.length === 0 ? (
        <EmptyState
          title="Pasta vazia"
          description="Crie uma nota ou uma subpasta para comecar."
          actionLabel="Criar nota"
          onAction={() => setNewNoteOpen(true)}
        />
      ) : (
        <>
          <ItemList
            title="Pastas"
            items={subfolders}
            onOpen={(id) => navigate(`/item/${id}`)}
            onDelete={handleDelete}
          />
          <ItemList
            title="Notas"
            items={notes}
            onOpen={(id) => navigate(`/item/${id}`)}
            onDelete={handleDelete}
          />
        </>
      )}

      <MoveToDialog
        open={moveOpen}
        nodeId={folderId}
        nodeType="folder"
        currentParentId={folder.parentId}
        nodes={nodes as DataNode[]}
        onClose={() => setMoveOpen(false)}
        onConfirm={handleConfirmMove}
      />

      <RenameDialog
        open={renameOpen}
        initialValue={folder.title ?? ''}
        title="Renomear pasta"
        onClose={() => setRenameOpen(false)}
        onConfirm={handleConfirmRename}
      />

      <NewNoteDialog
        open={newNoteOpen}
        onClose={() => setNewNoteOpen(false)}
        onConfirm={handleCreateNote}
      />
    </Stack>
  );
}
