import { Box, ListItemText, Menu, MenuItem, Typography } from '@mui/material';

import type { BlockType } from '../../data/types';

type SlashMenuOption = {
  type: BlockType;
  label: string;
  shortcut: string;
  keywords: string[];
};

const OPTIONS: SlashMenuOption[] = [
  {
    type: 'paragraph',
    label: 'Texto',
    shortcut: '/text',
    keywords: ['texto', 'paragraph', 'text', 'p'],
  },
  {
    type: 'h1',
    label: 'Titulo 1',
    shortcut: '/h1',
    keywords: ['h1', 'titulo 1', 'heading 1'],
  },
  {
    type: 'h2',
    label: 'Titulo 2',
    shortcut: '/h2',
    keywords: ['h2', 'titulo 2', 'heading 2'],
  },
  {
    type: 'h3',
    label: 'Titulo 3',
    shortcut: '/h3',
    keywords: ['h3', 'titulo 3', 'heading 3'],
  },
  {
    type: 'bullet',
    label: 'Lista',
    shortcut: '/list',
    keywords: ['lista', 'bullet', 'ul'],
  },
  {
    type: 'numbered',
    label: 'Lista numerada',
    shortcut: '/num',
    keywords: ['lista numerada', 'numbered', 'ol', 'num'],
  },
  {
    type: 'checklist',
    label: 'Checklist',
    shortcut: '/check',
    keywords: ['check', 'checklist', 'todo'],
  },
  {
    type: 'callout',
    label: 'Callout',
    shortcut: '/callout',
    keywords: ['callout', 'info', 'aviso'],
  },
  {
    type: 'code',
    label: 'Codigo',
    shortcut: '/code',
    keywords: ['code', 'codigo'],
  },
  {
    type: 'divider',
    label: 'Divisor',
    shortcut: '/div',
    keywords: ['divider', 'div', 'divisor', 'linha'],
  },
];

type SlashMenuProps = {
  open: boolean;
  anchorEl: HTMLElement | null;
  query: string;
  onClose: () => void;
  onSelect: (type: BlockType) => void;
};

const matchesQuery = (option: SlashMenuOption, query: string) => {
  if (!query) {
    return true;
  }
  const normalized = query.toLowerCase();
  if (option.label.toLowerCase().includes(normalized)) {
    return true;
  }
  if (option.shortcut.toLowerCase().includes(normalized)) {
    return true;
  }
  return option.keywords.some((keyword) => keyword.includes(normalized));
};

export default function SlashMenu({
  open,
  anchorEl,
  query,
  onClose,
  onSelect,
}: SlashMenuProps) {
  const trimmedQuery = query.trim().toLowerCase();
  const options = OPTIONS.filter((option) => matchesQuery(option, trimmedQuery));

  return (
    <Menu
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      MenuListProps={{ dense: true }}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      transformOrigin={{ vertical: 'top', horizontal: 'left' }}
    >
      {options.length === 0 ? (
        <MenuItem disabled>
          <ListItemText primary="Sem resultados" />
        </MenuItem>
      ) : (
        options.map((option) => (
          <MenuItem key={option.type} onClick={() => onSelect(option.type)}>
            <ListItemText primary={option.label} />
            <Box sx={{ pl: 2 }}>
              <Typography variant="caption" color="text.secondary">
                {option.shortcut}
              </Typography>
            </Box>
          </MenuItem>
        ))
      )}
    </Menu>
  );
}
