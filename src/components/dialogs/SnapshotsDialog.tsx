import React from 'react';
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { Restore } from '@mui/icons-material';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';

import ConfirmDialog from '../ConfirmDialog';
import { useNotifier } from '../Notifier';
import { listSnapshots, restoreSnapshot } from '../../data/repo';
import type { NoteSnapshot } from '../../data/types';

type SnapshotsDialogProps = {
  open: boolean;
  nodeId: string;
  onClose: () => void;
};

const formatTimestamp = (value?: number) =>
  typeof value === 'number' && Number.isFinite(value)
    ? format(new Date(value), 'yyyy-MM-dd HH:mm')
    : '-';

export default function SnapshotsDialog({ open, nodeId, onClose }: SnapshotsDialogProps) {
  const notifier = useNotifier();
  const snapshots =
    useLiveQuery(() => (open && nodeId ? listSnapshots(nodeId) : []), [open, nodeId]) ?? [];
  const [restoreTarget, setRestoreTarget] = React.useState<NoteSnapshot | null>(null);

  React.useEffect(() => {
    if (!open) {
      setRestoreTarget(null);
    }
  }, [open]);

  const handleRestore = async () => {
    if (!restoreTarget) {
      return;
    }
    try {
      await restoreSnapshot(restoreTarget.id);
      notifier.success('Snapshot restaurado');
      setRestoreTarget(null);
      onClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao restaurar snapshot: ${message}`);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Historico da nota</DialogTitle>
      <DialogContent>
        {snapshots.length === 0 ? (
          <Typography color="text.secondary" sx={{ mt: 1 }}>
            Nenhum snapshot salvo ainda.
          </Typography>
        ) : (
          <List dense disablePadding>
            {snapshots.map((snapshot) => (
              <ListItem
                key={snapshot.id}
                divider
                secondaryAction={
                  <Tooltip title="Restaurar">
                    <IconButton
                      edge="end"
                      size="small"
                      onClick={() => setRestoreTarget(snapshot)}
                    >
                      <Restore fontSize="small" />
                    </IconButton>
                  </Tooltip>
                }
              >
                <ListItemText
                  primary={snapshot.title || 'Sem titulo'}
                  secondary={
                    <Stack spacing={0.5}>
                      <Typography variant="caption" color="text.secondary">
                        Salvo {formatTimestamp(snapshot.createdAt)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        Atualizado {formatTimestamp(snapshot.updatedAt)}
                      </Typography>
                    </Stack>
                  }
                  primaryTypographyProps={{ component: 'div' }}
                  secondaryTypographyProps={{ component: 'div' }}
                />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Fechar</Button>
      </DialogActions>
      <ConfirmDialog
        open={Boolean(restoreTarget)}
        title="Restaurar snapshot?"
        description="A versao atual sera salva e substituida por este snapshot."
        confirmLabel="Restaurar"
        confirmColor="primary"
        onConfirm={handleRestore}
        onClose={() => setRestoreTarget(null)}
      />
    </Dialog>
  );
}
