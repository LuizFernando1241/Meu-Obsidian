import React from 'react';
import {
  Button,
  ButtonBase,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { format } from 'date-fns';
import {
  CloudDone,
  CloudOff,
  CloudSync,
  ErrorOutline,
} from '@mui/icons-material';

import { getSyncState, subscribeSyncState } from '../../sync/syncState';
import { syncNowManual } from '../../sync/syncService';

type SyncStatusChipProps = {
  compact?: boolean;
};

const formatRelative = (timestamp?: number) => {
  if (!timestamp) {
    return 'nunca';
  }
  const diffMs = Date.now() - timestamp;
  if (diffMs < 30 * 1000) {
    return 'agora';
  }
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 60) {
    return `ha ${diffMin} min`;
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return `ha ${diffHours} h`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return `ha ${diffDays} d`;
};

const getSyncHint = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes('401') || normalized.includes('403') || normalized.includes('bad credentials')) {
    return 'Verifique o token do GitHub.';
  }
  if (normalized.includes('404') || normalized.includes('not found')) {
    return 'Confira o Gist ID e o nome do arquivo.';
  }
  if (normalized.includes('network') || normalized.includes('offline') || normalized.includes('failed to fetch')) {
    return 'Parece que voce esta offline.';
  }
  return 'Revise suas configuracoes de sincronizacao.';
};

export default function SyncStatusChip({ compact = false }: SyncStatusChipProps) {
  const [syncState, setSyncState] = React.useState(getSyncState());
  const [syncErrorOpen, setSyncErrorOpen] = React.useState(false);

  React.useEffect(() => subscribeSyncState(setSyncState), []);

  const lastSyncLabel = syncState.lastSyncAt
    ? format(new Date(syncState.lastSyncAt), 'yyyy-MM-dd HH:mm')
    : 'Nunca';
  const lastSuccessRelative = formatRelative(syncState.lastSuccessfulSyncAt);

  const statusLabel = (() => {
    switch (syncState.status) {
      case 'syncing':
        return 'Sincronizando';
      case 'synced':
        return 'Sincronizado';
      case 'offline':
        return 'Offline';
      case 'error':
        return 'Erro';
      default:
        return 'Aguardando';
    }
  })();
  const statusColor =
    syncState.status === 'error'
      ? 'error'
      : syncState.status === 'synced'
        ? 'success'
        : syncState.status === 'syncing'
          ? 'info'
          : syncState.status === 'offline'
            ? 'warning'
            : 'default';

  const statusIcon = (() => {
    switch (syncState.status) {
      case 'syncing':
        return <CloudSync fontSize="small" />;
      case 'synced':
        return <CloudDone fontSize="small" />;
      case 'offline':
        return <CloudOff fontSize="small" />;
      case 'error':
        return <ErrorOutline fontSize="small" />;
      default:
        return <CloudSync fontSize="small" />;
    }
  })();

  const handleStatusClick = () => {
    if (syncState.status === 'error' && syncState.lastError) {
      setSyncErrorOpen(true);
      return;
    }
    void syncNowManual();
  };

  return (
    <>
      <Tooltip
        title={
          <>
            <Typography variant="body2">{`Status: ${statusLabel}`}</Typography>
            <Typography variant="body2">{`Ultimo: ${lastSyncLabel}`}</Typography>
            {syncState.status === 'error' && syncState.lastError?.message && (
              <Typography variant="body2">{syncState.lastError.message}</Typography>
            )}
          </>
        }
      >
        <ButtonBase
          onClick={handleStatusClick}
          aria-label="Status de sincronizacao"
          sx={{
            textAlign: 'left',
            px: 1,
            py: 0.5,
            borderRadius: 1,
            bgcolor: 'action.hover',
            display: 'flex',
            alignItems: 'center',
            gap: 1,
          }}
        >
          <Chip
            size="small"
            label={statusLabel}
            color={statusColor as 'default' | 'success' | 'info' | 'warning' | 'error'}
            variant={syncState.status === 'synced' ? 'filled' : 'outlined'}
            icon={statusIcon}
          />
          {!compact && (
            <Typography variant="caption" color="text.secondary">
              Ultimo: {lastSuccessRelative}
            </Typography>
          )}
        </ButtonBase>
      </Tooltip>
      <Dialog open={syncErrorOpen} onClose={() => setSyncErrorOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Erro de sincronizacao</DialogTitle>
        <DialogContent>
          <Stack spacing={1} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              {syncState.lastError?.message ?? 'Falha desconhecida.'}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {getSyncHint(syncState.lastError?.message ?? '')}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Ultima tentativa: {formatRelative(syncState.lastAttemptAt)}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Ultimo sucesso: {formatRelative(syncState.lastSuccessfulSyncAt)}
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSyncErrorOpen(false)}>Fechar</Button>
          <Button
            variant="contained"
            onClick={() => {
              setSyncErrorOpen(false);
              void syncNowManual();
            }}
          >
            Tentar novamente
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
