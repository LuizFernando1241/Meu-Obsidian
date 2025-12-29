import React from 'react';
import {
  Box,
  ButtonBase,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from '@mui/material';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';

import { getGlobalSchema } from '../../data/repo';
import { buildDefaultSchema } from '../../data/schemaDefaults';
import type { Node, SavedViewSort } from '../../data/types';
import type { PathInfo } from '../../vault/pathCache';
import { useIsMobile } from '../../app/useIsMobile';
import DateField from '../DateField';

type ViewTableProps = {
  nodes: Node[];
  pathCache: Map<string, PathInfo>;
  onOpen: (nodeId: string) => void;
  onUpdateProps: (nodeId: string, partialProps: Record<string, unknown>) => void;
  sortState?: SavedViewSort;
  onSortChange: (next: SavedViewSort) => void;
  compact?: boolean;
};

const STATUS_LABELS: Record<string, string> = {
  idea: 'Ideia',
  active: 'Ativo',
  waiting: 'Aguardando',
  done: 'Concluido',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baixa',
  medium: 'Media',
  high: 'Alta',
};

const formatStatusLabel = (value: string) => STATUS_LABELS[value] ?? value;
const formatPriorityLabel = (value: string) => PRIORITY_LABELS[value] ?? value;

const DEFAULT_STATUS_OPTIONS = [
  { value: '', label: '-' },
  { value: 'idea', label: formatStatusLabel('idea') },
  { value: 'active', label: formatStatusLabel('active') },
  { value: 'waiting', label: formatStatusLabel('waiting') },
  { value: 'done', label: formatStatusLabel('done') },
];

const DEFAULT_PRIORITY_OPTIONS = [
  { value: '', label: '-' },
  { value: 'low', label: formatPriorityLabel('low') },
  { value: 'medium', label: formatPriorityLabel('medium') },
  { value: 'high', label: formatPriorityLabel('high') },
];

const TYPE_LABELS: Record<Node['nodeType'], string> = {
  note: 'Nota',
  folder: 'Pasta',
};

const getPropValue = (props: Record<string, unknown> | undefined, key: string) =>
  typeof props?.[key] === 'string' ? (props?.[key] as string) : '';

const formatUpdated = (value?: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? format(new Date(value), 'yyyy-MM-dd')
    : '-';

const getDisplayPath = (pathText?: string) => {
  if (!pathText) {
    return 'Raiz';
  }
  const parts = pathText.split('/').map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1) {
    return 'Raiz';
  }
  return parts.slice(0, -1).join('/');
};

export default function ViewTable({
  nodes,
  pathCache,
  onOpen,
  onUpdateProps,
  sortState,
  onSortChange,
  compact = false,
}: ViewTableProps) {
  const isMobile = useIsMobile();
  const storedSchema = useLiveQuery(() => getGlobalSchema(), []);
  const fallbackSchema = React.useMemo(() => buildDefaultSchema(Date.now()), []);
  const schema = storedSchema ?? fallbackSchema;
  const statusOptions = React.useMemo(() => {
    const prop = schema.properties.find((entry) => entry.key === 'status');
    if (!prop?.options || prop.options.length === 0) {
      return DEFAULT_STATUS_OPTIONS;
    }
    return [
      { value: '', label: '-' },
      ...prop.options.map((option) => ({
        value: option,
        label: formatStatusLabel(option),
      })),
    ];
  }, [schema]);
  const priorityOptions = React.useMemo(() => {
    const prop = schema.properties.find((entry) => entry.key === 'priority');
    if (!prop?.options || prop.options.length === 0) {
      return DEFAULT_PRIORITY_OPTIONS;
    }
    return [
      { value: '', label: '-' },
      ...prop.options.map((option) => ({
        value: option,
        label: formatPriorityLabel(option),
      })),
    ];
  }, [schema]);
  const handleSort = (by: SavedViewSort['by']) => {
    const isActive = sortState?.by === by;
    const nextDir = isActive && sortState?.dir === 'asc' ? 'desc' : 'asc';
    onSortChange({ by, dir: nextDir });
  };

  const compactMode = compact || isMobile;
  const showType = !isMobile;
  const showUpdated = !isMobile;
  const tableMinWidth = isMobile ? 640 : 880;

  return (
    <Box sx={{ overflowX: 'auto' }}>
      <Table size={compactMode ? 'small' : 'medium'} sx={{ minWidth: tableMinWidth }}>
        <TableHead>
          <TableRow>
            <TableCell sortDirection={sortState?.by === 'title' ? sortState.dir : false}>
              <TableSortLabel
                active={sortState?.by === 'title'}
                direction={sortState?.by === 'title' ? sortState.dir : 'asc'}
                onClick={() => handleSort('title')}
              >
                Titulo
              </TableSortLabel>
            </TableCell>
            {showType && (
              <TableCell sortDirection={sortState?.by === 'type' ? sortState.dir : false}>
                <TableSortLabel
                  active={sortState?.by === 'type'}
                  direction={sortState?.by === 'type' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('type')}
                >
                  Tipo
                </TableSortLabel>
              </TableCell>
            )}
            <TableCell sortDirection={sortState?.by === 'path' ? sortState.dir : false}>
              <TableSortLabel
                active={sortState?.by === 'path'}
                direction={sortState?.by === 'path' ? sortState.dir : 'asc'}
                onClick={() => handleSort('path')}
              >
                Caminho
              </TableSortLabel>
            </TableCell>
            <TableCell sortDirection={sortState?.by === 'status' ? sortState.dir : false}>
              <TableSortLabel
                active={sortState?.by === 'status'}
                direction={sortState?.by === 'status' ? sortState.dir : 'asc'}
                onClick={() => handleSort('status')}
              >
                Status
              </TableSortLabel>
            </TableCell>
            <TableCell sortDirection={sortState?.by === 'priority' ? sortState.dir : false}>
              <TableSortLabel
                active={sortState?.by === 'priority'}
                direction={sortState?.by === 'priority' ? sortState.dir : 'asc'}
                onClick={() => handleSort('priority')}
              >
                Prioridade
              </TableSortLabel>
            </TableCell>
            <TableCell sortDirection={sortState?.by === 'due' ? sortState.dir : false}>
              <TableSortLabel
                active={sortState?.by === 'due'}
                direction={sortState?.by === 'due' ? sortState.dir : 'asc'}
                onClick={() => handleSort('due')}
              >
                Vencimento
              </TableSortLabel>
            </TableCell>
            {showUpdated && (
              <TableCell sortDirection={sortState?.by === 'updatedAt' ? sortState.dir : false}>
                <TableSortLabel
                  active={sortState?.by === 'updatedAt'}
                  direction={sortState?.by === 'updatedAt' ? sortState.dir : 'asc'}
                  onClick={() => handleSort('updatedAt')}
                >
                  Atualizado
                </TableSortLabel>
              </TableCell>
            )}
          </TableRow>
        </TableHead>
        <TableBody>
          {nodes.map((node) => {
            const props = node.props as Record<string, unknown> | undefined;
            const status = getPropValue(props, 'status');
            const priority = getPropValue(props, 'priority');
            const due = getPropValue(props, 'due');
            const pathText = getDisplayPath(pathCache.get(node.id)?.pathText);

            return (
              <TableRow key={node.id} hover>
                <TableCell sx={{ minWidth: isMobile ? 160 : 200 }}>
                  <ButtonBase
                    onClick={() => onOpen(node.id)}
                    sx={{ display: 'block', textAlign: 'left', width: '100%' }}
                  >
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {node.title || 'Sem titulo'}
                    </Typography>
                  </ButtonBase>
                </TableCell>
                {showType && (
                  <TableCell sx={{ minWidth: 120 }}>
                    <Typography variant="body2">{TYPE_LABELS[node.nodeType]}</Typography>
                  </TableCell>
                )}
                <TableCell sx={{ minWidth: isMobile ? 160 : 200 }}>
                  <Typography variant="body2" color="text.secondary" noWrap>
                    {pathText}
                  </Typography>
                </TableCell>
                <TableCell sx={{ minWidth: isMobile ? 120 : 140 }}>
                  <TextField
                    select
                    size="small"
                    value={status}
                    onChange={(event) =>
                      onUpdateProps(node.id, { status: event.target.value || undefined })
                    }
                    fullWidth
                  >
                    {statusOptions.map((option) => (
                      <MenuItem key={option.value || 'empty'} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </TableCell>
                <TableCell sx={{ minWidth: isMobile ? 120 : 140 }}>
                  <TextField
                    select
                    size="small"
                    value={priority}
                    onChange={(event) =>
                      onUpdateProps(node.id, { priority: event.target.value || undefined })
                    }
                    fullWidth
                  >
                    {priorityOptions.map((option) => (
                      <MenuItem key={option.value || 'empty'} value={option.value}>
                        {option.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </TableCell>
                <TableCell sx={{ minWidth: isMobile ? 130 : 150 }}>
                  <DateField
                    size="small"
                    value={due}
                    onCommit={(next) =>
                      onUpdateProps(node.id, { due: next || undefined })
                    }
                    fullWidth
                  />
                </TableCell>
                {showUpdated && (
                  <TableCell sx={{ minWidth: 140 }}>
                    <Typography variant="body2" color="text.secondary">
                      {formatUpdated(node.updatedAt)}
                    </Typography>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Box>
  );
}
