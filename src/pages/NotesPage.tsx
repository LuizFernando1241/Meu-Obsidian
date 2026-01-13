import React from 'react';
import { Button, Chip, Stack, Typography } from '@mui/material';
import { NoteOutlined } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';

import EmptyState from '../components/EmptyState';
import ItemList from '../components/ItemList';
import ListToolbar from '../components/ListToolbar';
import LoadingState from '../components/LoadingState';
import { useNotifier } from '../components/Notifier';
import { useNodesByType } from '../data/hooks';
import { createNote, deleteNode } from '../data/repo';
import { matchesItemSearch } from '../data/search';
import type { Node } from '../data/types';
import { useDataStore } from '../store/useDataStore';

type RecordCategory = 'vendors' | 'contacts' | 'ideas';

const recordTags = new Set(['registro', 'contato', 'fornecedor', 'ideia', 'decisao']);

const getRecordType = (item: Node) => {
  const props =
    item.props && typeof item.props === 'object'
      ? (item.props as Record<string, unknown>)
      : undefined;
  return props && typeof props.recordType === 'string' ? props.recordType : null;
};

const isRecordItem = (item: Node) => {
  if (item.nodeType !== 'note') {
    return false;
  }
  if (item.tags.some((tag) => recordTags.has(tag))) {
    return true;
  }
  return Boolean(getRecordType(item));
};

const resolveCategory = (item: Node): RecordCategory => {
  const recordType = getRecordType(item);
  if (recordType === 'vendor' || item.tags.includes('fornecedor')) {
    return 'vendors';
  }
  if (recordType === 'contact' || item.tags.includes('contato')) {
    return 'contacts';
  }
  if (recordType === 'idea' || recordType === 'decision' || item.tags.includes('ideia')) {
    return 'ideas';
  }
  return 'ideas';
};

export default function NotesPage() {
  const navigate = useNavigate();
  const notifier = useNotifier();
  const items = useNodesByType('note');
  const isSeeding = useDataStore((state) => state.isSeeding);

  const [search, setSearch] = React.useState('');
  const [visibleCount, setVisibleCount] = React.useState(200);

  const recordItems = React.useMemo(() => items.filter(isRecordItem), [items]);
  const filteredItems = React.useMemo(
    () => recordItems.filter((item) => matchesItemSearch(item, search)),
    [recordItems, search],
  );
  const categories = React.useMemo(() => {
    const grouped: Record<RecordCategory, Node[]> = {
      vendors: [],
      contacts: [],
      ideas: [],
    };
    filteredItems.forEach((item) => {
      grouped[resolveCategory(item)].push(item);
    });
    return grouped;
  }, [filteredItems]);

  React.useEffect(() => {
    setVisibleCount(200);
  }, [search]);

  const renderMeta = React.useCallback((item: Node) => {
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
      const note = await createNote({
        title: 'Novo registro',
        tags: ['registro', 'ideia'],
        props: { recordType: 'idea' },
      });
      notifier.success('Registro criado');
      navigate(`/item/${note.id}`, { state: { focusEditor: true } });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao criar: ${message}`);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteNode(id);
      notifier.success('Nota excluida');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao excluir: ${message}`);
    }
  };

  const hasMore = filteredItems.length > visibleCount;

  return (
    <Stack spacing={2}>
      <ListToolbar
        title="Registros"
        search={search}
        onSearchChange={setSearch}
        onCreate={handleCreate}
        createLabel="Criar registro"
      />
      {isSeeding && <LoadingState message="Carregando dados..." />}
      {filteredItems.length === 0 ? (
        <EmptyState
          icon={<NoteOutlined />}
          title="Nenhum registro"
          description="Crie o primeiro registro para comecar."
          actionLabel="Criar registro"
          onAction={handleCreate}
        />
      ) : (
        <Stack spacing={3}>
          <Stack spacing={1}>
            <Typography variant="h6">Fornecedores</Typography>
            {categories.vendors.length === 0 ? (
              <Typography color="text.secondary">Nenhum fornecedor registrado.</Typography>
            ) : (
              <ItemList
                items={categories.vendors.slice(0, visibleCount)}
                onOpen={(id) => navigate(`/item/${id}`)}
                onDelete={handleDelete}
                rightMeta={renderMeta}
              />
            )}
          </Stack>
          <Stack spacing={1}>
            <Typography variant="h6">Pessoas/Contatos</Typography>
            {categories.contacts.length === 0 ? (
              <Typography color="text.secondary">Nenhum contato registrado.</Typography>
            ) : (
              <ItemList
                items={categories.contacts.slice(0, visibleCount)}
                onOpen={(id) => navigate(`/item/${id}`)}
                onDelete={handleDelete}
                rightMeta={renderMeta}
              />
            )}
          </Stack>
          <Stack spacing={1}>
            <Typography variant="h6">Ideias/Decisoes</Typography>
            {categories.ideas.length === 0 ? (
              <Typography color="text.secondary">Nenhuma ideia registrada.</Typography>
            ) : (
              <ItemList
                items={categories.ideas.slice(0, visibleCount)}
                onOpen={(id) => navigate(`/item/${id}`)}
                onDelete={handleDelete}
                rightMeta={renderMeta}
              />
            )}
          </Stack>
        </Stack>
      )}
      {hasMore && (
        <Stack alignItems="flex-start">
          <Button onClick={() => setVisibleCount((prev) => prev + 200)}>Carregar mais</Button>
        </Stack>
      )}
    </Stack>
  );
}
