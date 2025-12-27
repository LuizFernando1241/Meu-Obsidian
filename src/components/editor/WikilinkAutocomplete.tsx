import {
  List,
  ListItemButton,
  ListItemText,
  Popover,
  Typography,
} from '@mui/material';

import type { Node, NodeType } from '../../data/types';

const TYPE_LABELS: Record<NodeType, string> = {
  note: 'Nota',
  folder: 'Pasta',
};

type WikilinkAutocompleteProps = {
  open: boolean;
  anchorEl: HTMLElement | null;
  query: string;
  results: Node[];
  highlightedIndex: number;
  onSelect: (item: Node) => void;
  onCreateNew: (title: string) => void;
  onClose: () => void;
};

export default function WikilinkAutocomplete({
  open,
  anchorEl,
  query,
  results,
  highlightedIndex,
  onSelect,
  onCreateNew,
  onClose,
}: WikilinkAutocompleteProps) {
  const trimmedQuery = query.trim();

  return (
    <Popover
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      PaperProps={{ sx: { minWidth: 240, maxWidth: 360 } }}
    >
      <List dense disablePadding>
        {results.length === 0 ? (
          <ListItemButton
            selected={highlightedIndex === 0}
            onClick={() => onCreateNew(trimmedQuery)}
            disabled={!trimmedQuery}
          >
            <ListItemText
              primary={`Criar nota: ${trimmedQuery || '...'}`}
              secondary="Nova nota rápida"
            />
          </ListItemButton>
        ) : (
          results.map((item, index) => (
            <ListItemButton
              key={item.id}
              selected={highlightedIndex === index}
              onClick={() => onSelect(item)}
            >
              <ListItemText
                primary={item.title || 'Sem título'}
                secondary={
                  <Typography variant="caption" color="text.secondary">
                    {TYPE_LABELS[item.nodeType]}
                  </Typography>
                }
              />
            </ListItemButton>
          ))
        )}
      </List>
    </Popover>
  );
}
