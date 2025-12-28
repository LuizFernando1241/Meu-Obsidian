import React from 'react';
import { Button, Stack, Typography } from '@mui/material';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';

import EmptyState from '../components/EmptyState';
import ItemList from '../components/ItemList';
import { useNotifier } from '../components/Notifier';
import { listByTag, deleteNode } from '../data/repo';
import type { Node, NoteNode, FolderNode } from '../data/types';

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeTag = (value: string) => value.trim().toLowerCase();

export default function TagPage() {
  const { tag } = useParams();
  const navigate = useNavigate();
  const notifier = useNotifier();
  const rawTag = tag ? safeDecode(tag) : '';
  const normalizedTag = normalizeTag(rawTag);

  const items =
    useLiveQuery(
      () => (normalizedTag ? listByTag(normalizedTag) : []),
      [normalizedTag],
    ) ?? [];

  const notes = React.useMemo(
    () => items.filter((item): item is NoteNode => item.nodeType === 'note'),
    [items],
  );
  const folders = React.useMemo(
    () => items.filter((item): item is FolderNode => item.nodeType === 'folder'),
    [items],
  );

  const handleDelete = async (id: string) => {
    try {
      await deleteNode(id);
      notifier.success('Item excluido');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao excluir: ${message}`);
    }
  };

  if (!normalizedTag) {
    return (
      <Stack spacing={2}>
        <Typography variant="h4" component="h1">
          Tag invalida
        </Typography>
        <Typography color="text.secondary">
          Selecione uma tag valida para continuar.
        </Typography>
        <Button variant="outlined" onClick={() => navigate('/tags')}>
          Voltar para Tags
        </Button>
      </Stack>
    );
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h4" component="h1">
        Tag: {normalizedTag}
      </Typography>
      <Typography color="text.secondary">
        {items.length} item{items.length === 1 ? '' : 's'} com esta tag.
      </Typography>
      {items.length === 0 ? (
        <EmptyState
          title="Nenhum item com esta tag"
          description="Adicione tags nas notas para organiza-las aqui."
        />
      ) : (
        <Stack spacing={2}>
          {folders.length > 0 && (
            <ItemList
              title="Pastas"
              items={folders as Node[]}
              onOpen={(id) => navigate(`/item/${id}`)}
              onDelete={handleDelete}
              dense={false}
            />
          )}
          {notes.length > 0 && (
            <ItemList
              title="Notas"
              items={notes as Node[]}
              onOpen={(id) => navigate(`/item/${id}`)}
              onDelete={handleDelete}
              dense={false}
            />
          )}
        </Stack>
      )}
      <Button variant="outlined" onClick={() => navigate('/tags')}>
        Voltar para Tags
      </Button>
    </Stack>
  );
}
