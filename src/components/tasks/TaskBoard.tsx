import { Box, Paper, Stack, Typography } from '@mui/material';

import type { Item, TaskStatus } from '../../data/types';
import TaskCard from './TaskCard';

type TaskBoardProps = {
  tasks: Item[];
  onOpen: (id: string) => void;
  onUpdateStatus: (id: string, status: TaskStatus) => void;
};

const COLUMNS: Array<{ status: TaskStatus; label: string }> = [
  { status: 'todo', label: 'A Fazer' },
  { status: 'doing', label: 'Fazendo' },
  { status: 'done', label: 'Feito' },
];

const getStatus = (task: Item): TaskStatus => (task.status ?? 'todo') as TaskStatus;

export default function TaskBoard({ tasks, onOpen, onUpdateStatus }: TaskBoardProps) {
  return (
    <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 1 }}>
      {COLUMNS.map((column) => {
        const columnTasks = tasks.filter((task) => getStatus(task) === column.status);
        return (
          <Box key={column.status} sx={{ minWidth: 280, flex: 1 }}>
            <Paper variant="outlined" sx={{ p: 1.5, mb: 1 }}>
              <Stack direction="row" spacing={1} alignItems="baseline">
                <Typography variant="subtitle1">{column.label}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {columnTasks.length} tarefa{columnTasks.length === 1 ? '' : 's'}
                </Typography>
              </Stack>
            </Paper>
            <Stack spacing={1}>
              {columnTasks.length === 0 ? (
                <Typography variant="body2" color="text.secondary" sx={{ px: 1 }}>
                  Sem tarefas.
                </Typography>
              ) : (
                columnTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onOpen={onOpen}
                    onUpdateStatus={onUpdateStatus}
                  />
                ))
              )}
            </Stack>
          </Box>
        );
      })}
    </Box>
  );
}
