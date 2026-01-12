import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  Add,
  Bolt,
  Description,
  Folder,
  HelpOutline,
  Home,
  Hub,
  Inbox,
  LocalOffer,
  Settings,
  TaskAlt,
  ViewList,
} from '@mui/icons-material';

import { getStaticCommands, type Command } from '../command/commands';
import { parseInput } from '../command/parser';
import type { NodeType } from '../data/types';
import { useTaskSelection } from '../store/useTaskSelection';
import { useSearchIndex, type SearchHit } from '../search/useSearch';

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  onExecute: (command: Command, rawInput: string) => void;
};

type CommandEntry = {
  command: Command;
  icon: React.ReactNode;
};

const TYPE_LABELS: Record<NodeType, string> = {
  note: 'Nota',
  folder: 'Pasta',
};

const typeIcon = (type: NodeType) => {
  switch (type) {
    case 'folder':
      return <Folder fontSize="small" />;
    case 'note':
    default:
      return <Description fontSize="small" />;
  }
};

const navIcon = (path: string) => {
  switch (path) {
    case '/':
      return <Home fontSize="small" />;
    case '/focus':
      return <Bolt fontSize="small" />;
    case '/backlog':
      return <ViewList fontSize="small" />;
    case '/inbox':
      return <Inbox fontSize="small" />;
    case '/tasks':
      return <TaskAlt fontSize="small" />;
    case '/notes':
      return <Description fontSize="small" />;
    case '/tags':
      return <LocalOffer fontSize="small" />;
    case '/graph':
      return <Hub fontSize="small" />;
    case '/help':
    case '/help#shortcuts':
      return <HelpOutline fontSize="small" />;
    case '/settings':
      return <Settings fontSize="small" />;
    default:
      return <Home fontSize="small" />;
  }
};

export default function CommandPalette({ open, onClose, onExecute }: CommandPaletteProps) {
  const { search, getSnippet } = useSearchIndex();
  const selectedTask = useTaskSelection((state) => state.selectedTask);
  const [query, setQuery] = React.useState('');
  const [highlighted, setHighlighted] = React.useState(0);

  const staticCommands = React.useMemo(() => getStaticCommands(), []);
  const parsed = React.useMemo(() => parseInput(query), [query]);
  const searchQuery = React.useMemo(() => query.trim(), [query]);

  const results = React.useMemo<SearchHit[]>(() => {
    if (!searchQuery) {
      return [];
    }
    return search(searchQuery).slice(0, 12);
  }, [search, searchQuery]);

  const commandEntries = React.useMemo<CommandEntry[]>(() => {
    const entries: CommandEntry[] = [];

    if (!query.trim()) {
      staticCommands.create.forEach((command) => {
        if (command.kind !== 'create') {
          return;
        }
        entries.push({
          command,
          icon: <Add fontSize="small" />,
        });
      });
      if (selectedTask) {
        staticCommands.taskActions.forEach((command) => {
          if (command.kind !== 'task-action') {
            return;
          }
          entries.push({
            command,
            icon: <TaskAlt fontSize="small" />,
          });
        });
      }
      staticCommands.nav.forEach((command) => {
        if (command.kind !== 'nav') {
          return;
        }
        entries.push({
          command,
          icon: navIcon(command.path),
        });
      });
      return entries;
    }

    results.forEach((result) => {
      if (result.kind === 'task') {
        const subtitleParts = [
          result.noteTitle ? `Nota: ${result.noteTitle}` : undefined,
          result.notePath ? `Pasta: ${result.notePath}` : undefined,
        ].filter(Boolean);
        entries.push({
          command: {
            kind: 'open-task',
            task: result.task,
            title: result.title || 'Sem titulo',
            subtitle: subtitleParts.join(' \u2022 ') || undefined,
          },
          icon: <TaskAlt fontSize="small" />,
        });
        return;
      }

      const snippet = getSnippet(result.id, searchQuery);
      const typeLabel = TYPE_LABELS[result.type];
      const subtitle = snippet ? `${typeLabel} \u2022 ${snippet}` : typeLabel;
      entries.push({
        command: {
          kind: 'open',
          id: result.id,
          title: result.title || 'Sem titulo',
          subtitle,
        },
        icon: typeIcon(result.type),
      });
    });

    staticCommands.create.forEach((command) => {
      if (command.kind !== 'create') {
        return;
      }
      const title = `${command.title}: ${parsed.cleanTitle}`;
      const subtitleParts: string[] = [];
      if (parsed.tags.length > 0) {
        subtitleParts.push(`tags ${parsed.tags.map((tag) => `#${tag}`).join(' ')}`);
      }
      entries.push({
        command: {
          ...command,
          title,
          subtitle: subtitleParts.join(' \u2022 ') || undefined,
        },
        icon: <Add fontSize="small" />,
      });
    });

    return entries;
  }, [query, staticCommands, results, parsed, getSnippet, searchQuery, selectedTask]);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setHighlighted(0);
      return;
    }
    setHighlighted(0);
  }, [open, query]);

  React.useEffect(() => {
    if (highlighted >= commandEntries.length) {
      setHighlighted(0);
    }
  }, [commandEntries.length, highlighted]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }

    if (commandEntries.length === 0) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlighted((prev) => (prev + 1) % commandEntries.length);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((prev) => (prev - 1 + commandEntries.length) % commandEntries.length);
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const entry = commandEntries[highlighted];
      if (entry) {
        onExecute(entry.command, query);
      }
    }
  };

  const handleSelect = (entry: CommandEntry) => {
    onExecute(entry.command, query);
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Paleta de comandos</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          <TextField
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Digite para buscar, criar ou navegar..."
            fullWidth
          />
          {commandEntries.length === 0 ? (
            <Typography color="text.secondary">Nenhuma acao disponivel.</Typography>
          ) : (
            <List disablePadding>
              {commandEntries.map((entry, index) => (
                <ListItemButton
                  key={`${entry.command.kind}-${entry.command.title}-${index}`}
                  selected={index === highlighted}
                  onClick={() => handleSelect(entry)}
                >
                  <ListItemIcon>{entry.icon}</ListItemIcon>
                  <ListItemText
                    primary={entry.command.title}
                    secondary={entry.command.subtitle}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </Stack>
      </DialogContent>
    </Dialog>
  );
}
