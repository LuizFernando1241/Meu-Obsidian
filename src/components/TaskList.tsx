import {
  Box,
  ButtonBase,
  Checkbox,
  Chip,
  List,
  ListItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';

import type { IndexedTask } from '../tasks/taskIndex';

type TaskListProps = {
  tasks: IndexedTask[];
  emptyMessage?: string;
  onToggle: (task: IndexedTask, checked: boolean) => void;
  onOpenNote: (noteId: string, blockId: string) => void;
  onUpdateDue: (task: IndexedTask, due: string | null) => void;
};

const formatText = (text: string) => (text.trim() ? text : 'Checklist');

export default function TaskList({
  tasks,
  emptyMessage = 'Sem tarefas.',
  onToggle,
  onOpenNote,
  onUpdateDue,
}: TaskListProps) {
  if (tasks.length === 0) {
    return <Typography color="text.secondary">{emptyMessage}</Typography>;
  }

  return (
    <List disablePadding>
      {tasks.map((task) => (
        <ListItem key={`${task.noteId}:${task.blockId}`} divider alignItems="flex-start">
          <Checkbox
            checked={task.checked}
            onChange={(event) => onToggle(task, event.target.checked)}
            sx={{ mt: 0.5 }}
          />
          <Stack spacing={1} sx={{ flex: 1, minWidth: 0 }}>
            <ButtonBase
              onClick={() => onOpenNote(task.noteId, task.blockId)}
              sx={{ textAlign: 'left', width: '100%', display: 'block' }}
            >
              <Typography
                variant="body1"
                sx={{
                  textDecoration: task.checked ? 'line-through' : 'none',
                  color: task.checked ? 'text.secondary' : 'text.primary',
                  wordBreak: 'break-word',
                }}
              >
                {formatText(task.text)}
              </Typography>
            </ButtonBase>
            <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
              <Chip
                label={task.noteTitle}
                size="small"
                onClick={() => onOpenNote(task.noteId, task.blockId)}
              />
              <Box sx={{ minWidth: { xs: '100%', sm: 160 } }}>
                <TextField
                  label="Vencimento"
                  type="date"
                  size="small"
                  value={task.due ?? ''}
                  onChange={(event) => {
                    const value = event.target.value;
                    onUpdateDue(task, value ? value : null);
                  }}
                  InputLabelProps={{ shrink: true }}
                  fullWidth
                />
              </Box>
            </Stack>
          </Stack>
        </ListItem>
      ))}
    </List>
  );
}
