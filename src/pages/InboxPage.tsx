import React from 'react';
import {
  Button,
  Card,
  CardContent,
  Stack,
  Typography,
} from '@mui/material';
import { useLiveQuery } from 'dexie-react-hooks';

import { useNotifier } from '../components/Notifier';
import { db } from '../data/db';
import type { InboxItemRow } from '../data/types';
import { useSpaceStore } from '../store/useSpaceStore';
import {
  archiveInboxItem,
  convertInboxItemToEvent,
  convertInboxItemToRecord,
  convertInboxItemToTask,
  parseInboxShortcut,
} from '../data/inbox';

export default function InboxPage() {
  const notifier = useNotifier();
  const space = useSpaceStore((state) => state.space);
  const inboxItems =
    useLiveQuery(
      () => db.inbox_items.where('space').equals(space).toArray(),
      [space],
    ) ?? [];

  const openItems = React.useMemo(
    () =>
      inboxItems
        .filter((item) => item.status === 'OPEN')
        .sort((a, b) => b.createdAt - a.createdAt),
    [inboxItems],
  );

  const handleConvertTask = async (item: InboxItemRow) => {
    try {
      await convertInboxItemToTask(item.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao converter: ${message}`);
    }
  };

  const handleConvertEvent = async (item: InboxItemRow) => {
    try {
      await convertInboxItemToEvent(item.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao converter: ${message}`);
    }
  };

  const handleConvertRecord = async (item: InboxItemRow) => {
    try {
      await convertInboxItemToRecord(item.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao converter: ${message}`);
    }
  };

  const handleArchive = async (item: InboxItemRow) => {
    try {
      await archiveInboxItem(item.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao arquivar: ${message}`);
    }
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Typography variant="h4" component="h1">
          Inbox
        </Typography>
        <Typography color="text.secondary">
          {openItems.length} itens aguardando triagem.
        </Typography>
      </Stack>

      {openItems.length === 0 ? (
        <Typography color="text.secondary">Nada na inbox.</Typography>
      ) : (
        <Stack spacing={2}>
          {openItems.map((item) => {
            const parsed = parseInboxShortcut(item.content);
            const label =
              parsed.kind === 'task'
                ? 'Tarefa'
                : parsed.kind === 'event'
                  ? 'Compromisso'
                  : parsed.kind === 'contact'
                    ? 'Contato'
                    : parsed.kind === 'note'
                      ? 'Registro'
                      : null;
            return (
            <Card key={item.id} variant="outlined">
              <CardContent>
                <Stack spacing={1}>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <Typography>{parsed.text}</Typography>
                    {label && (
                      <Typography variant="caption" color="text.secondary">
                        {label}
                      </Typography>
                    )}
                  </Stack>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Button size="small" variant="contained" onClick={() => handleConvertTask(item)}>
                      Virar tarefa
                    </Button>
                    <Button size="small" onClick={() => handleConvertEvent(item)}>
                      Virar compromisso
                    </Button>
                    <Button size="small" onClick={() => handleConvertRecord(item)}>
                      Virar registro
                    </Button>
                    <Button size="small" color="inherit" onClick={() => handleArchive(item)}>
                      Arquivar
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          )})}
        </Stack>
      )}
    </Stack>
  );
}
