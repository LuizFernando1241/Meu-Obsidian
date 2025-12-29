import React from 'react';
import {
  Box,
  Button,
  ButtonBase,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
} from '@mui/material';
import { Add, ChevronLeft, ChevronRight } from '@mui/icons-material';
import { format } from 'date-fns';

import type { Node } from '../../data/types';
import { toISODate } from '../../tasks/date';
import { getMonthMatrix, isValidISODate } from '../../views/calendarDate';
import { useIsMobile } from '../../app/useIsMobile';

type MonthState = {
  year: number;
  month: number;
};

type ViewCalendarProps = {
  nodes: Node[];
  month: MonthState;
  onMonthChange: (year: number, month: number) => void;
  onOpen: (nodeId: string) => void;
  onCreateNote: (dueISO: string) => void;
  weekStartsOn?: 0 | 1;
  showUndated?: boolean;
};

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];

const rotateLabels = (weekStartsOn: 0 | 1) =>
  weekStartsOn === 0 ? DAY_LABELS : [...DAY_LABELS.slice(1), DAY_LABELS[0]];

const getDueISO = (node: Node) => {
  const props = node.props as Record<string, unknown> | undefined;
  const due = typeof props?.due === 'string' ? props.due : '';
  return due && isValidISODate(due) ? due : '';
};

export default function ViewCalendar({
  nodes,
  month,
  onMonthChange,
  onOpen,
  onCreateNote,
  weekStartsOn = 0,
  showUndated = true,
}: ViewCalendarProps) {
  const isMobile = useIsMobile();
  const [dayDialogISO, setDayDialogISO] = React.useState<string | null>(null);
  const [dayDialogItems, setDayDialogItems] = React.useState<Node[]>([]);

  const weeks = React.useMemo(
    () => getMonthMatrix(month.year, month.month, weekStartsOn),
    [month.year, month.month, weekStartsOn],
  );

  const grouped = React.useMemo(() => {
    const map = new Map<string, Node[]>();
    nodes.forEach((node) => {
      const dueISO = getDueISO(node);
      if (!dueISO) {
        return;
      }
      const list = map.get(dueISO) ?? [];
      list.push(node);
      map.set(dueISO, list);
    });
    return map;
  }, [nodes]);

  const undatedItems = React.useMemo(
    () => nodes.filter((node) => !getDueISO(node)),
    [nodes],
  );

  const handlePrevMonth = () => {
    const date = new Date(month.year, month.month - 1, 1);
    onMonthChange(date.getFullYear(), date.getMonth());
  };

  const handleNextMonth = () => {
    const date = new Date(month.year, month.month + 1, 1);
    onMonthChange(date.getFullYear(), date.getMonth());
  };

  const handleToday = () => {
    const today = new Date();
    onMonthChange(today.getFullYear(), today.getMonth());
  };

  const handleOpenDayDialog = (iso: string, items: Node[]) => {
    setDayDialogISO(iso);
    setDayDialogItems(items);
  };

  const todayISO = toISODate(new Date());
  const monthLabel = format(new Date(month.year, month.month, 1), 'MMMM yyyy');
  const dayLabels = rotateLabels(weekStartsOn);

  const visibleCount = isMobile ? 2 : 3;

  return (
    <Stack spacing={2}>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
        <Stack direction="row" spacing={1} alignItems="center">
          <IconButton onClick={handlePrevMonth} size="small" aria-label="Mes anterior">
            <ChevronLeft fontSize="small" />
          </IconButton>
          <IconButton onClick={handleNextMonth} size="small" aria-label="Proximo mes">
            <ChevronRight fontSize="small" />
          </IconButton>
          <Button size="small" variant="outlined" onClick={handleToday}>
            Hoje
          </Button>
        </Stack>
        <Typography variant="h6">{monthLabel}</Typography>
        <Box />
      </Stack>

      <Box sx={{ overflowX: 'auto' }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: isMobile
              ? 'repeat(7, minmax(48px, 1fr))'
              : 'repeat(7, minmax(120px, 1fr))',
            gap: 1,
            minWidth: isMobile ? 0 : 840,
          }}
        >
          {dayLabels.map((label) => (
            <Box key={label} sx={{ px: 1 }}>
              <Typography variant="caption" color="text.secondary">
                {label}
              </Typography>
            </Box>
          ))}
          {weeks.flat().map((day) => {
            const items = grouped.get(day.iso) ?? [];
            const isToday = day.iso === todayISO;

            return (
              <Box
                key={day.iso}
                sx={{
                  border: '1px solid',
                  borderColor: isToday ? 'primary.main' : 'divider',
                  borderRadius: 1,
                  p: 1,
                  minHeight: isMobile ? 88 : 120,
                  bgcolor: day.inMonth ? 'background.paper' : 'action.hover',
                }}
              >
                <Stack spacing={0.5}>
                  <Stack direction="row" alignItems="center" justifyContent="space-between">
                    <Typography
                      variant="caption"
                      color={day.inMonth ? 'text.primary' : 'text.secondary'}
                    >
                      {day.date.getDate()}
                    </Typography>
                    <IconButton
                      size="small"
                      aria-label="Criar nota"
                      onClick={() => onCreateNote(day.iso)}
                    >
                      <Add fontSize="small" />
                    </IconButton>
                  </Stack>
                  <Stack spacing={0.5}>
                    {items.slice(0, visibleCount).map((node) => (
                      <ButtonBase
                        key={node.id}
                        onClick={() => onOpen(node.id)}
                        sx={{ textAlign: 'left', width: '100%' }}
                      >
                        <Typography variant="caption" noWrap>
                          {node.title || 'Sem titulo'}
                        </Typography>
                      </ButtonBase>
                    ))}
                    {items.length > visibleCount && (
                      <ButtonBase
                        onClick={() => handleOpenDayDialog(day.iso, items)}
                        sx={{ textAlign: 'left' }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          +{items.length - visibleCount} itens
                        </Typography>
                      </ButtonBase>
                    )}
                  </Stack>
                </Stack>
              </Box>
            );
          })}
        </Box>
      </Box>

      {showUndated && (
        <Stack spacing={1}>
          <Typography variant="subtitle1">Sem data</Typography>
          {undatedItems.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              Nenhum item sem data.
            </Typography>
          ) : (
            <Stack spacing={0.5}>
              {undatedItems.map((node) => (
                <ButtonBase
                  key={node.id}
                  onClick={() => onOpen(node.id)}
                  sx={{ textAlign: 'left' }}
                >
                  <Typography variant="body2">{node.title || 'Sem titulo'}</Typography>
                </ButtonBase>
              ))}
            </Stack>
          )}
        </Stack>
      )}

      <Dialog
        open={Boolean(dayDialogISO)}
        onClose={() => setDayDialogISO(null)}
        fullWidth
        maxWidth="sm"
        fullScreen={isMobile}
      >
        <DialogTitle>Itens do dia {dayDialogISO}</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ mt: 1 }}>
            {dayDialogItems.map((node) => (
              <ButtonBase
                key={node.id}
                onClick={() => {
                  onOpen(node.id);
                  setDayDialogISO(null);
                }}
                sx={{ textAlign: 'left' }}
              >
                <Typography variant="body2">{node.title || 'Sem titulo'}</Typography>
              </ButtonBase>
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDayDialogISO(null)}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
