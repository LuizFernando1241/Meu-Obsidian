import React from 'react';
import { Button, Chip, Stack } from '@mui/material';
import { NoteOutlined } from '@mui/icons-material';
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

export default function NotesPage() {
  const navigate = useNavigate();
  const notifier = useNotifier();
  const items = useItemsByType('note');
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

  const renderMeta = React.useCallback((item: Item) => {
    if (item.tags.length === 0) {
      return null;
    }
    return (
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        {item.tags.map((tag) => (
          <Chip key={tag} size="small" label={tag} variant="outlined" />
        ))}
      </Stack>
    );
  }, []);

  const handleCreate = async () => {
    try {
      const id = await createQuick('note');
      notifier.success('Nota criada');
      navigate(`/item/${id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao criar: ${message}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteItem(id);
      notifier.success('Nota excluida');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao excluir: ${message}`);
    }
  };

  const visibleItems = filteredItems.slice(0, visibleCount);
  const hasMore = filteredItems.length > visibleCount;

  return (
    <Stack spacing={2}>
      <ListToolbar title="Notas" search={search} onSearchChange={setSearch} onCreate={handleCreate} />
      {isSeeding && <LoadingState message="Carregando dados..." />}
      {filteredItems.length === 0 ? (
        <EmptyState
          icon={<NoteOutlined />}
          title="Nenhuma nota"
          description="Crie a primeira nota para comecar."
          actionLabel="Nova nota"
          onAction={handleCreate}
        />
      ) : (
        <ItemList
          items={visibleItems}
          onOpen={(id) => navigate(`/item/${id}`)}
          onDelete={handleDelete}
          rightMeta={renderMeta}
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
