import React from 'react';
import { Button, Chip, Stack, Typography } from '@mui/material';
import { FolderOpenOutlined } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

import EmptyState from '../components/EmptyState';
import ItemList from '../components/ItemList';
import ListToolbar from '../components/ListToolbar';
import LoadingState from '../components/LoadingState';
import { useNotifier } from '../components/Notifier';
import { useItemsByType } from '../data/hooks';
import { deleteItem } from '../data/repo';
import { matchesItemSearch } from '../data/search';
import type { Item } from '../data/types';
import { useDataStore } from '../store/useDataStore';

export default function ProjectsPage() {
  const navigate = useNavigate();
  const notifier = useNotifier();
  const items = useItemsByType('project');
  const { createQuick, isSeeding } = useDataStore((state) => ({
    createQuick: state.createQuick,
    isSeeding: state.isSeeding,
  }));

  const [search, setSearch] = React.useState('');
  const [visibleCount, setVisibleCount] = React.useState(200);

  const filteredItems = React.useMemo(
    () => items.filter((item) => matchesItemSearch(item, search)),
    [items, search],
  );

  React.useEffect(() => {
    setVisibleCount(200);
  }, [search]);

  const handleCreate = async () => {
    try {
      const id = await createQuick('project');
      notifier.success('Projeto criado');
      navigate(`/item/${id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao criar: ${message}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteItem(id);
      notifier.success('Projeto excluido');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao excluir: ${message}`);
    }
  };

  const renderProjectMeta = (item: Item) => (
    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
      <Typography variant="body2" color="text.secondary">
        Status: {item.status ?? '\u2014'}
      </Typography>
      {item.tags.map((tag) => (
        <Chip key={tag} size="small" label={tag} variant="outlined" />
      ))}
    </Stack>
  );

  const visibleItems = filteredItems.slice(0, visibleCount);
  const hasMore = filteredItems.length > visibleCount;

  return (
    <Stack spacing={2}>
      <ListToolbar
        title="Projetos"
        search={search}
        onSearchChange={setSearch}
        onCreate={handleCreate}
      />
      {isSeeding && <LoadingState message="Carregando dados..." />}
      {filteredItems.length === 0 ? (
        <EmptyState
          icon={<FolderOpenOutlined />}
          title="Nenhum projeto"
          description="Crie um projeto para organizar seu trabalho."
          actionLabel="Novo projeto"
          onAction={handleCreate}
        />
      ) : (
        <ItemList
          items={visibleItems}
          onOpen={(id) => navigate(`/item/${id}`)}
          onDelete={handleDelete}
          rightMeta={renderProjectMeta}
        />
      )}
      {hasMore && (
        <Stack alignItems="flex-start">
          <Button onClick={() => setVisibleCount((prev) => prev + 200)}>Carregar mais</Button>
        </Stack>
      )}
    </Stack>
  );
}
