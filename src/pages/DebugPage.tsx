import React from 'react';
import { Box, Button, List, ListItem, ListItemText, Stack, Typography } from '@mui/material';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

import LoadingState from '../components/LoadingState';
import { useNotifier } from '../components/Notifier';
import { deleteNode, listItems } from '../data/repo';
import type { Node, NodeType } from '../data/types';
import { useDataStore } from '../store/useDataStore';

const TYPE_LABELS: Record<NodeType, string> = {
  note: 'nota',
  folder: 'pasta',
};

export default function DebugPage() {
  const navigate = useNavigate();
  const notifier = useNotifier();
  const { createQuick, wipeAll, isReady, isSeeding } = useDataStore((state) => ({
    createQuick: state.createQuick,
    wipeAll: state.wipeAll,
    isReady: state.isReady,
    isSeeding: state.isSeeding,
  }));

  const [items, setItems] = React.useState<Node[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);

  const loadItems = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await listItems();
      setItems(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao carregar: ${message}`);
    } finally {
      setIsLoading(false);
    }
  }, [notifier]);

  React.useEffect(() => {
    if (isReady) {
      void loadItems();
    }
  }, [isReady, loadItems]);

  const handleCreate = async (type: NodeType) => {
    try {
      await createQuick(type);
      notifier.success('Item criado');
      await loadItems();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao criar: ${message}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNode(id);
      notifier.success('Item excluido');
      await loadItems();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao excluir: ${message}`);
    }
  };

  const handleWipe = async () => {
    try {
      await wipeAll();
      notifier.success('Banco limpo');
      await loadItems();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao limpar: ${message}`);
    }
  };

  return (
    <Box>
      <Stack spacing={2}>
        <Typography variant="h4" component="h1">
          Depuracao do banco
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button variant="contained" onClick={() => handleCreate('note')} disabled={!isReady}>
            Criar nota
          </Button>
          <Button variant="contained" onClick={() => handleCreate('folder')} disabled={!isReady}>
            Criar pasta
          </Button>
          <Button variant="outlined" color="error" onClick={handleWipe} disabled={!isReady}>
            Apagar tudo (wipe)
          </Button>
          <Button variant="outlined" onClick={loadItems} disabled={!isReady || isLoading}>
            Recarregar lista
          </Button>
        </Stack>
        {isSeeding && (
          <Typography color="text.secondary">Carregando seed inicial...</Typography>
        )}
        {isLoading ? (
          <LoadingState message="Carregando itens..." />
        ) : (
          <List dense>
            {items.map((item) => (
              <ListItem
                key={item.id}
                divider
                secondaryAction={
                  <Stack direction="row" spacing={1}>
                    <Button size="small" onClick={() => navigate(`/item/${item.id}`)}>
                      Abrir
                    </Button>
                    <Button size="small" color="error" onClick={() => handleDelete(item.id)}>
                      Excluir
                    </Button>
                  </Stack>
                }
              >
                <ListItemText
                  primary={item.title || 'Sem titulo'}
                  secondary={`${TYPE_LABELS[item.nodeType]} \u2022 Atualizado ${format(
                    new Date(item.updatedAt),
                    'yyyy-MM-dd HH:mm',
                  )}`}
                />
              </ListItem>
            ))}
          </List>
        )}
      </Stack>
    </Box>
  );
}
