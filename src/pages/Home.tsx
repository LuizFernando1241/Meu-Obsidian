import React from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  Grid,
  List,
  Stack,
  Typography,
} from '@mui/material';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';

import EmptyState from '../components/EmptyState';
import ItemRow from '../components/ItemRow';
import { useChildren, useFavoriteItems, useRecentItems } from '../data/hooks';
import type { Node, NodeType } from '../data/types';

const TYPE_LABELS: Record<NodeType, string> = {
  note: 'Nota',
  folder: 'Pasta',
};

export default function Home() {
  const navigate = useNavigate();
  const recent = useRecentItems(10);
  const favorites = useFavoriteItems();
  const rootItems = useChildren(undefined);

  const rootFolders = React.useMemo(
    () => rootItems.filter((item) => item.nodeType === 'folder'),
    [rootItems],
  );

  const handleOpenItem = React.useCallback(
    (id: string) => {
      navigate(`/item/${id}`);
    },
    [navigate],
  );

  const renderItemSecondary = (item: Node) =>
    `${TYPE_LABELS[item.nodeType]} \u2022 ${format(new Date(item.updatedAt), 'yyyy-MM-dd')}`;

  const renderItems = (items: Node[], emptyLabel: string) =>
    items.length === 0 ? (
      <EmptyState title={emptyLabel} />
    ) : (
      <List dense disablePadding>
        {items.map((item) => (
          <ItemRow
            key={item.id}
            item={item}
            onOpen={handleOpenItem}
            secondary={renderItemSecondary(item)}
          />
        ))}
      </List>
    );

  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">
        Mecflux Personal OS
      </Typography>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title="Pastas na raiz" />
            <CardContent>{renderItems(rootFolders, 'Nenhuma pasta ainda.')}</CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title="Recentes" />
            <CardContent>{renderItems(recent, 'Nenhum item recente.')}</CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} md={6}>
          <Card>
            <CardHeader title="Favoritos" />
            <CardContent>{renderItems(favorites, 'Nenhum favorito ainda.')}</CardContent>
          </Card>
        </Grid>
      </Grid>
    </Stack>
  );
}
