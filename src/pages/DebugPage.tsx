import React from 'react';
import { Box, Button, List, ListItem, ListItemText, Stack, Typography } from '@mui/material';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

import LoadingState from '../components/LoadingState';
import { useNotifier } from '../components/Notifier';
import { deleteItem, listItems } from '../data/repo';
import type { Item, ItemType } from '../data/types';
import { useDataStore } from '../store/useDataStore';

export default function DebugPage() {
  const navigate = useNavigate();
  const notifier = useNotifier();
  const { createQuick, wipeAll, isReady, isSeeding } = useDataStore((state) => ({
    createQuick: state.createQuick,
    wipeAll: state.wipeAll,
    isReady: state.isReady,
    isSeeding: state.isSeeding,
  }));

  const [items, setItems] = React.useState<Item[]>([]);
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

  const handleCreate = async (type: ItemType) => {
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
      await deleteItem(id);
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
          Debug DB
        </Typography>
        <Stack direction="row" spacing={1} flexWrap="wrap">
          <Button variant="contained" onClick={() => handleCreate('note')} disabled={!isReady}>
            Criar Nota
          </Button>
          <Button variant="contained" onClick={() => handleCreate('task')} disabled={!isReady}>
            Criar Tarefa
          </Button>
          <Button variant="contained" onClick={() => handleCreate('project')} disabled={!isReady}>
            Criar Projeto
          </Button>
          <Button variant="contained" onClick={() => handleCreate('area')} disabled={!isReady}>
            Criar Área
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
                  primary={item.title || 'Sem título'}
                  secondary={`${item.type} \u2022 Atualizado ${format(
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
