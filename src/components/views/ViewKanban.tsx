import React from 'react';
import {
  Box,
  ButtonBase,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { MoreVert } from '@mui/icons-material';

import type { Node } from '../../data/types';
import { useIsMobile } from '../../app/useIsMobile';

type ViewKanbanProps = {
  nodes: Node[];
  columns: string[];
  includeEmptyStatus: boolean;
  onOpen: (nodeId: string) => void;
  onMove: (nodeId: string, newStatus: string | null) => void;
};

type ColumnConfig = {
  id: string;
  label: string;
  statusValue: string | null;
};

const EMPTY_COLUMN_ID = '__empty__';

const STATUS_LABELS: Record<string, string> = {
  idea: 'Idea',
  active: 'Active',
  waiting: 'Waiting',
  done: 'Done',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

const formatStatusLabel = (value: string) => {
  const normalized = value.trim();
  if (!normalized) {
    return 'Sem status';
  }
  return STATUS_LABELS[normalized] ?? normalized;
};

const formatPriorityLabel = (value: string) =>
  PRIORITY_LABELS[value] ?? value;

const getPropValue = (props: Record<string, unknown> | undefined, key: string) =>
  typeof props?.[key] === 'string' ? (props?.[key] as string) : '';

export default function ViewKanban({
  nodes,
  columns,
  includeEmptyStatus,
  onOpen,
  onMove,
}: ViewKanbanProps) {
  const isMobile = useIsMobile();
  const [draggingId, setDraggingId] = React.useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = React.useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = React.useState<HTMLElement | null>(null);
  const [menuNodeId, setMenuNodeId] = React.useState<string | null>(null);

  const columnConfigs = React.useMemo<ColumnConfig[]>(() => {
    const normalized = columns.map((entry) => entry.trim()).filter(Boolean);
    const unique = Array.from(new Set(normalized));
    const configs: ColumnConfig[] = unique.map((value) => ({
      id: value,
      label: formatStatusLabel(value),
      statusValue: value,
    }));
    if (includeEmptyStatus) {
      configs.unshift({
        id: EMPTY_COLUMN_ID,
        label: 'Sem status',
        statusValue: null,
      });
    }
    return configs;
  }, [columns, includeEmptyStatus]);

  const columnOrder = React.useMemo(
    () => columnConfigs.map((column) => column.id),
    [columnConfigs],
  );

  const columnMap = React.useMemo(() => {
    const map = new Map<string, Node[]>();
    columnOrder.forEach((columnId) => map.set(columnId, []));

    nodes.forEach((node) => {
      const props = node.props as Record<string, unknown> | undefined;
      const rawStatus = getPropValue(props, 'status').trim();
      const hasStatus = Boolean(rawStatus);
      let columnId: string | undefined;

      if (hasStatus && map.has(rawStatus)) {
        columnId = rawStatus;
      } else if (includeEmptyStatus) {
        columnId = EMPTY_COLUMN_ID;
      } else {
        columnId = columnOrder[0];
      }

      if (columnId && !map.has(columnId)) {
        map.set(columnId, []);
      }
      if (columnId) {
        map.get(columnId)?.push(node);
      }
    });

    return map;
  }, [columnOrder, includeEmptyStatus, nodes]);

  const handleDragStart = (event: React.DragEvent<HTMLDivElement>, nodeId: string) => {
    event.dataTransfer.setData('text/plain', nodeId);
    event.dataTransfer.effectAllowed = 'move';
    setDraggingId(nodeId);
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>, columnId: string) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverColumn(columnId);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>, column: ColumnConfig) => {
    event.preventDefault();
    const nodeId = event.dataTransfer.getData('text/plain');
    setDragOverColumn(null);
    if (!nodeId) {
      return;
    }
    onMove(nodeId, column.statusValue);
  };

  const handleOpenMenu = (event: React.MouseEvent<HTMLButtonElement>, nodeId: string) => {
    event.stopPropagation();
    setMenuAnchor(event.currentTarget);
    setMenuNodeId(nodeId);
  };

  const handleCloseMenu = () => {
    setMenuAnchor(null);
    setMenuNodeId(null);
  };

  const handleMoveFromMenu = (status: string | null) => {
    if (!menuNodeId) {
      return;
    }
    onMove(menuNodeId, status);
    handleCloseMenu();
  };

  const columnWidth = isMobile ? 220 : 260;

  return (
    <Box sx={{ overflowX: 'auto', pb: 1 }}>
      <Stack
        direction="row"
        spacing={2}
        sx={{ minWidth: columnWidth * Math.max(2, columnConfigs.length) }}
      >
        {columnConfigs.map((column) => {
          const list = columnMap.get(column.id) ?? [];
          const isDragOver = dragOverColumn === column.id;

          return (
            <Paper
              key={column.id}
              variant="outlined"
              onDragOver={(event) => handleDragOver(event, column.id)}
              onDragLeave={() =>
                setDragOverColumn((prev) => (prev === column.id ? null : prev))
              }
              onDrop={(event) => handleDrop(event, column)}
              sx={{
                minWidth: columnWidth,
                flex: `0 0 ${columnWidth}px`,
                p: 1.5,
                bgcolor: isDragOver ? 'action.hover' : 'background.paper',
                borderColor: isDragOver ? 'primary.main' : 'divider',
              }}
            >
              <Stack spacing={1}>
                <Stack direction="row" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle2">{column.label}</Typography>
                  <Chip size="small" label={String(list.length)} />
                </Stack>
                <Stack spacing={1}>
                  {list.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                      Sem itens.
                    </Typography>
                  ) : (
                    list.map((node) => {
                      const props = node.props as Record<string, unknown> | undefined;
                      const due = getPropValue(props, 'due');
                      const priority = getPropValue(props, 'priority');
                      const tags = Array.isArray(node.tags) ? node.tags : [];
                      const isDragging = draggingId === node.id;

                      return (
                        <Paper
                          key={node.id}
                          variant="outlined"
                          draggable={!isMobile}
                          onDragStart={
                            isMobile ? undefined : (event) => handleDragStart(event, node.id)
                          }
                          onDragEnd={isMobile ? undefined : handleDragEnd}
                          sx={{
                            p: 1.25,
                            opacity: isDragging ? 0.6 : 1,
                            cursor: isMobile ? 'default' : 'grab',
                          }}
                        >
                          <Stack spacing={1}>
                            <Stack direction="row" alignItems="center" spacing={1}>
                              <ButtonBase
                                onClick={() => onOpen(node.id)}
                                sx={{ textAlign: 'left', flex: 1 }}
                              >
                                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                  {node.title || 'Sem titulo'}
                                </Typography>
                              </ButtonBase>
                              <IconButton
                                size="small"
                                aria-label="Mover para"
                                onClick={(event) => handleOpenMenu(event, node.id)}
                              >
                                <MoreVert fontSize="small" />
                              </IconButton>
                            </Stack>
                            <Stack direction="row" spacing={1} flexWrap="wrap">
                              {priority && (
                                <Chip
                                  size="small"
                                  label={formatPriorityLabel(priority)}
                                  variant="outlined"
                                />
                              )}
                              {due && <Chip size="small" label={`Venc ${due}`} />}
                            </Stack>
                            {tags.length > 0 && (
                              <Stack direction="row" spacing={0.5} flexWrap="wrap">
                                {tags.slice(0, 4).map((tag) => (
                                  <Chip key={tag} size="small" label={tag} variant="outlined" />
                                ))}
                              </Stack>
                            )}
                          </Stack>
                        </Paper>
                      );
                    })
                  )}
                </Stack>
              </Stack>
            </Paper>
          );
        })}
      </Stack>
      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={handleCloseMenu}>
        {columnConfigs.map((column) => (
          <MenuItem
            key={column.id}
            onClick={() => handleMoveFromMenu(column.statusValue)}
          >
            {column.label}
          </MenuItem>
        ))}
      </Menu>
    </Box>
  );
}
