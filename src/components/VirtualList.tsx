import React from 'react';
import { Box } from '@mui/material';

type VirtualListProps = {
  itemCount: number;
  itemHeight: number;
  height: number;
  overscan?: number;
  renderItem: (index: number, style: React.CSSProperties) => React.ReactNode;
};

export default function VirtualList({
  itemCount,
  itemHeight,
  height,
  overscan = 6,
  renderItem,
}: VirtualListProps) {
  const [scrollTop, setScrollTop] = React.useState(0);

  const totalHeight = itemCount * itemHeight;
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
  const visibleCount = Math.ceil(height / itemHeight) + overscan * 2;
  const endIndex = Math.min(itemCount - 1, startIndex + visibleCount);

  const handleScroll = (event: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  };

  const items = [];
  for (let i = startIndex; i <= endIndex; i += 1) {
    items.push(
      renderItem(i, {
        position: 'absolute',
        top: i * itemHeight,
        height: itemHeight,
        width: '100%',
      }),
    );
  }

  return (
    <Box
      onScroll={handleScroll}
      sx={{ height, overflowY: 'auto', position: 'relative' }}
    >
      <Box sx={{ height: totalHeight, position: 'relative' }}>{items}</Box>
    </Box>
  );
}
