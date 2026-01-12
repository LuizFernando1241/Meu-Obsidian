import React from 'react';
import {
  Button,
  Card,
  CardContent,
  Stack,
  Typography,
} from '@mui/material';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';

import { useNotifier } from '../components/Notifier';
import { db } from '../data/db';
import type { InboxItemRow } from '../data/types';
import { useSpaceStore } from '../store/useSpaceStore';
import {
  archiveInboxItem,
  convertInboxItemToNote,
  convertInboxItemToTask,
} from '../data/inbox';

export default function InboxPage() {
  const notifier = useNotifier();
  const navigate = useNavigate();
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
      const result = await convertInboxItemToTask(item.id);
      if (result?.noteId) {
        navigate(`/item/${result.noteId}`, {
          state: result.blockId ? { highlightBlockId: result.blockId } : undefined,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao converter: ${message}`);
    }
  };

  const handleConvertNote = async (item: InboxItemRow) => {
    try {
      const note = await convertInboxItemToNote(item.id);
      if (note?.id) {
        navigate(`/item/${note.id}`, { state: { focusEditor: true } });
      }
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
          {openItems.map((item) => (
            <Card key={item.id} variant="outlined">
              <CardContent>
                <Stack spacing={1}>
                  <Typography>{item.content}</Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap">
                    <Button size="small" variant="contained" onClick={() => handleConvertTask(item)}>
                      Converter em tarefa
                    </Button>
                    <Button size="small" onClick={() => handleConvertNote(item)}>
                      Converter em nota
                    </Button>
                    <Button size="small" color="inherit" onClick={() => handleArchive(item)}>
                      Arquivar
                    </Button>
                  </Stack>
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
