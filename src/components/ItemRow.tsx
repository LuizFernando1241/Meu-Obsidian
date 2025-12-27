import React from 'react';
import { Box, ListItem, ListItemButton, ListItemText } from '@mui/material';

import type { Item } from '../data/types';

type ItemRowProps = {
  item: Item;
  onOpen: (id: string) => void;
  secondary?: React.ReactNode;
  leftIcon?: React.ReactNode;
  rightActions?: React.ReactNode;
  divider?: boolean;
};

export default function ItemRow({
  item,
  onOpen,
  secondary,
  leftIcon,
  rightActions,
  divider = true,
}: ItemRowProps) {
  return (
    <ListItem disablePadding divider={divider}>
      <ListItemButton
        onClick={() => onOpen(item.id)}
        sx={{ flexGrow: 1, pr: rightActions ? 1 : 2 }}
      >
        {leftIcon && (
          <Box sx={{ mr: 1, display: 'flex', alignItems: 'center' }}>
            {leftIcon}
          </Box>
        )}
        <ListItemText
          primary={item.title || 'Sem titulo'}
          secondary={secondary}
          primaryTypographyProps={{ component: 'div' }}
          secondaryTypographyProps={{ component: 'div' }}
        />
      </ListItemButton>
      {rightActions && (
        <Box sx={{ pr: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
          {rightActions}
        </Box>
      )}
    </ListItem>
  );
}

