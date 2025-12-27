import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemText,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';

import { useDebouncedCallback } from '../app/useDebouncedCallback';
import LoadingState from './LoadingState';
import type { NodeType } from '../data/types';
import { useSearchIndex, type SearchHit, type TypeFilter } from '../search/useSearch';

type SearchDialogProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (id: string) => void;
};

const TYPE_LABELS: Record<NodeType, string> = {
  note: 'Notas',
  folder: 'Pastas',
};

export default function SearchDialog({ open, onClose, onSelect }: SearchDialogProps) {
  const { search, getSnippet, ready } = useSearchIndex();
  const [queryInput, setQueryInput] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>('all');
  const [highlighted, setHighlighted] = React.useState(0);

  const results = React.useMemo<SearchHit[]>(
    () => search(query, typeFilter),
    [query, search, typeFilter],
  );

  const { debounced: debouncedQuery, cancel: cancelDebounce } = useDebouncedCallback(
    (value: string) => setQuery(value),
    200,
  );

  React.useEffect(() => cancelDebounce, [cancelDebounce]);

  React.useEffect(() => {
    if (!open) {
      setQueryInput('');
      setQuery('');
      setTypeFilter('all');
      setHighlighted(0);
      cancelDebounce();
      return;
    }
    setHighlighted(0);
  }, [open, query, typeFilter, cancelDebounce]);

  React.useEffect(() => {
    if (highlighted >= results.length) {
      setHighlighted(0);
    }
  }, [highlighted, results.length]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (results.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((prev) => (prev + 1) % results.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((prev) => (prev - 1 + results.length) % results.length);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selected = results[highlighted];
      if (selected) {
        onSelect(selected.id);
      }
    }
  };

  const handleSelect = (id: string) => {
    onSelect(id);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Busca global</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <TextField
            autoFocus
            value={queryInput}
            onChange={(event) => {
              const value = event.target.value;
              setQueryInput(value);
              debouncedQuery(value);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar por titulo, texto, tags..."
            fullWidth
          />
          <Tabs
            value={typeFilter}
            onChange={(_, value) => setTypeFilter(value as TypeFilter)}
            variant="scrollable"
            allowScrollButtonsMobile
          >
            <Tab value="all" label="Todos" />
            <Tab value="note" label="Notas" />
            <Tab value="folder" label="Pastas" />
          </Tabs>
          {!ready ? (
            <LoadingState message="Indexando itens..." />
          ) : queryInput.trim().length === 0 ? (
            <Typography color="text.secondary">Digite para buscar.</Typography>
          ) : results.length === 0 ? (
            <Typography color="text.secondary">Nenhum resultado encontrado.</Typography>
          ) : (
            <List disablePadding>
              {results.map((result, index) => {
                const snippet = getSnippet(result.id, query);
                const typeLabel = TYPE_LABELS[result.type];
                const pathLabel = result.pathText || 'Raiz';
                const secondary = (
                  <Stack spacing={0.25}>
                    <Typography variant="body2" color="text.secondary">
                      {`${typeLabel} \u2022 ${pathLabel}`}
                    </Typography>
                    {snippet && (
                      <Typography variant="body2" color="text.secondary">
                        {snippet}
                      </Typography>
                    )}
                  </Stack>
                );

                return (
                  <ListItemButton
                    key={result.id}
                    selected={index === highlighted}
                    onClick={() => handleSelect(result.id)}
                  >
                    <ListItemText
                      primary={result.title || 'Sem titulo'}
                      secondary={secondary}
                      primaryTypographyProps={{ component: 'div' }}
                      secondaryTypographyProps={{ component: 'div' }}
                    />
                  </ListItemButton>
                );
              })}
            </List>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
