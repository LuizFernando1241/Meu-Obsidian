import React from 'react';
import { Box, Chip, Stack, Typography } from '@mui/material';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';

import EmptyState from '../components/EmptyState';
import { db } from '../data/db';
import { filterActiveNodes } from '../data/deleted';
import type { Node } from '../data/types';

type TagStat = {
  label: string;
  count: number;
};

const normalizeTag = (value: string) => value.trim().toLowerCase();

const collectTags = (items: Node[]): TagStat[] => {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    if (!Array.isArray(item.tags)) {
      return;
    }
    item.tags.forEach((tag) => {
      const normalized = normalizeTag(tag);
      if (!normalized) {
        return;
      }
      counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => a.label.localeCompare(b.label));
};

export default function TagsIndexPage() {
  const navigate = useNavigate();
  const allItems = useLiveQuery(() => db.items.toArray(), []) ?? [];
  const items = React.useMemo(() => filterActiveNodes(allItems), [allItems]);
  const tags = React.useMemo(() => collectTags(items), [items]);

  const handleTagClick = (value: string) => {
    navigate(`/tags/${encodeURIComponent(value)}`);
  };

  return (
    <Box>
      <Stack spacing={2}>
        <Typography variant="h4" component="h1">
          Tags
        </Typography>
        <Typography color="text.secondary">
          Explore por etiquetas para filtrar suas notas.
        </Typography>
        {tags.length === 0 ? (
          <EmptyState
            title="Nenhuma tag cadastrada"
            description="Adicione tags nas notas para organizar."
          />
        ) : (
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {tags.map((tag) => (
              <Chip
                key={tag.label}
                label={`${tag.label} (${tag.count})`}
                clickable
                onClick={() => handleTagClick(tag.label)}
                variant="outlined"
              />
            ))}
          </Box>
        )}
      </Stack>
    </Box>
  );
}
