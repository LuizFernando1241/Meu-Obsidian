import React from 'react';
import {
  IconButton,
  List,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  DeleteForeverOutlined,
  DescriptionOutlined,
  FolderOutlined,
  RestoreFromTrashOutlined,
} from '@mui/icons-material';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import ItemRow from '../components/ItemRow';
import { useNotifier } from '../components/Notifier';
import { db } from '../data/db';
import { getDeletedAt, isSoftDeleted } from '../data/deleted';
import { deleteNodePermanently, restoreNode } from '../data/repo';
import type { Node } from '../data/types';

const TYPE_LABELS: Record<Node['nodeType'], string> = {
  note: 'nota',
  folder: 'pasta',
};

const formatDeletedAt = (node: Node) => {
  const deletedAt = getDeletedAt(node);
  if (!deletedAt) {
    return 'data desconhecida';
  }
  return format(new Date(deletedAt), 'yyyy-MM-dd HH:mm');
};

const getIconForNode = (node: Node) =>
  node.nodeType === 'folder' ? <FolderOutlined fontSize="small" /> : <DescriptionOutlined fontSize="small" />;

export default function TrashPage() {
  const navigate = useNavigate();
  const notifier = useNotifier();
  const items = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const deletedItems = React.useMemo(
    () => items.filter((item): item is Node => isSoftDeleted(item)),
    [items],
  );
  const sorted = React.useMemo(
    () =>
      [...deletedItems].sort(
        (a, b) => (getDeletedAt(b) ?? 0) - (getDeletedAt(a) ?? 0),
      ),
    [deletedItems],
  );
  const [deleteTarget, setDeleteTarget] = React.useState<Node | null>(null);

  const handleRestore = async (node: Node) => {
    try {
      await restoreNode(node.id);
      notifier.success('Item restaurado');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao restaurar: ${message}`);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    try {
      await deleteNodePermanently(deleteTarget.id);
      notifier.success('Item removido');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao excluir definitivamente: ${message}`);
    } finally {
      setDeleteTarget(null);
    }
  };

  return (
    <Stack spacing={2}>
      <Stack spacing={0.5}>
        <Typography variant="h4" component="h1">
          Lixeira
        </Typography>
        <Typography color="text.secondary">
          {sorted.length} item{sorted.length === 1 ? '' : 's'} na lixeira.
        </Typography>
      </Stack>
      {sorted.length === 0 ? (
        <EmptyState
          title="Lixeira vazia"
          description="Itens excluidos aparecem aqui para restaurar."
        />
      ) : (
        <List disablePadding>
          {sorted.map((item) => (
            <ItemRow
              key={item.id}
              item={item}
              leftIcon={getIconForNode(item)}
              onOpen={(id) => navigate(`/item/${id}`)}
              secondary={`${TYPE_LABELS[item.nodeType]} \u2022 Excluido em ${formatDeletedAt(item)}`}
              rightActions={
                <>
                  <Tooltip title="Restaurar">
                    <IconButton
                      size="small"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleRestore(item);
                      }}
                    >
                      <RestoreFromTrashOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Excluir definitivamente">
                    <IconButton
                      size="small"
                      onClick={(event) => {
                        event.stopPropagation();
                        setDeleteTarget(item);
                      }}
                    >
                      <DeleteForeverOutlined fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </>
              }
            />
          ))}
        </List>
      )}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Excluir definitivamente?"
        description="Esta acao nao pode ser desfeita."
        confirmLabel="Excluir"
        confirmColor="error"
        onConfirm={handleConfirmDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </Stack>
  );
}
