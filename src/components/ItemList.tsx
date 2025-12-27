import React from 'react';
import {
  Box,
  IconButton,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material';
import { MoreVert, Star } from '@mui/icons-material';
import { format } from 'date-fns';

import ConfirmDialog from './ConfirmDialog';
import type { Node, NodeType } from '../data/types';

type ItemListProps = {
  title?: string;
  items: Node[];
  onOpen: (id: string) => void;
  onDelete: (id: string) => Promise<void> | void;
  rightMeta?: (item: Node) => React.ReactNode;
  dense?: boolean;
};

const TYPE_LABELS: Record<NodeType, string> = {
  note: 'nota',
  folder: 'pasta',
};

export default function ItemList({
  title,
  items,
  onOpen,
  onDelete,
  rightMeta,
  dense = true,
}: ItemListProps) {
  const [menuAnchor, setMenuAnchor] = React.useState<null | HTMLElement>(null);
  const [menuItem, setMenuItem] = React.useState<Node | null>(null);
  const [confirmItem, setConfirmItem] = React.useState<Node | null>(null);

  const handleOpenMenu = (event: React.MouseEvent<HTMLButtonElement>, item: Node) => {
    setMenuAnchor(event.currentTarget);
    setMenuItem(item);
  };

  const handleCloseMenu = () => {
    setMenuAnchor(null);
    setMenuItem(null);
  };

  const handleRequestDelete = () => {
    setConfirmItem(menuItem);
    setMenuItem(null);
    handleCloseMenu();
  };

  const handleConfirmDelete = async () => {
    if (!confirmItem) {
      return;
    }
    try {
      await onDelete(confirmItem.id);
    } catch (error) {
      // Avoid unhandled rejections; pages handle user-facing feedback.
      console.error(error);
    } finally {
      setConfirmItem(null);
    }
  };

  const secondaryText = (item: Node) =>
    `${TYPE_LABELS[item.nodeType]} \u2022 Atualizado ${format(new Date(item.updatedAt), 'yyyy-MM-dd HH:mm')}`;

  return (
    <Box>
      {title && (
        <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
          {title}
        </Typography>
      )}
      {items.length === 0 ? (
        <Typography color="text.secondary">Nenhum item encontrado.</Typography>
      ) : (
        <List disablePadding dense={dense}>
          {items.map((item) => {
            const extraMeta = rightMeta?.(item);
            const secondaryContent = extraMeta ? (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, alignItems: 'center' }}>
                <Typography variant="body2" color="text.secondary">
                  {secondaryText(item)}
                </Typography>
                {extraMeta}
              </Box>
            ) : (
              secondaryText(item)
            );

            return (
              <ListItem
                key={item.id}
                divider
                disablePadding
                secondaryAction={
                  <IconButton
                    edge="end"
                    aria-label="Acoes"
                    onClick={(event) => handleOpenMenu(event, item)}
                  >
                    <MoreVert />
                  </IconButton>
                }
              >
                <ListItemButton onClick={() => onOpen(item.id)}>
                  <ListItemText
                    primary={
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {item.favorite && (
                          <Star fontSize="small" sx={{ color: 'warning.main' }} />
                        )}
                        <Typography component="span" variant="body1">
                          {item.title || 'Sem titulo'}
                        </Typography>
                      </Box>
                    }
                    secondary={secondaryContent}
                    primaryTypographyProps={{ component: 'div' }}
                    secondaryTypographyProps={{ component: 'div' }}
                  />
                </ListItemButton>
              </ListItem>
            );
          })}
        </List>
      )}
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleCloseMenu}>
        <MenuItem onClick={handleRequestDelete}>Excluir</MenuItem>
      </Menu>
      <ConfirmDialog
        open={Boolean(confirmItem)}
        title="Excluir item?"
        description="Esta acao nao pode ser desfeita."
        confirmLabel="Excluir"
        confirmColor="error"
        onConfirm={handleConfirmDelete}
        onClose={() => setConfirmItem(null)}
      />
    </Box>
  );
}
