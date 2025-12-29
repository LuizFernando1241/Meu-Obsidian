import React from 'react';
import {
  AppBar,
  Button,
  ButtonBase,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import { format } from 'date-fns';
import { useLocation } from 'react-router-dom';
import {
  Add,
  Bolt,
  Brightness4,
  Brightness7,
  CloudDone,
  CloudOff,
  CloudSync,
  EditNote,
  ErrorOutline,
  InfoOutlined,
  Menu as MenuIcon,
  Search,
  Settings,
} from '@mui/icons-material';

import { useColorMode } from '../app/ColorModeContext';
import { getRouteLabelByPathname } from '../app/routes';
import type { NodeType } from '../data/types';
import { getSyncState, subscribeSyncState } from '../sync/syncState';
import { syncNowManual } from '../sync/syncService';

type TopBarProps = {
  isMobile: boolean;
  leftWidth: number;
  rightWidth: number;
  onOpenLeftNav: () => void;
  onToggleRightPanel: () => void;
  onOpenSearch: () => void;
  onOpenPalette: () => void;
  onOpenCapture: () => void;
  onCreate: (type: NodeType) => void | Promise<void>;
  onOpenSettings: () => void;
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

export default function TopBar({
  isMobile,
  leftWidth,
  rightWidth,
  onOpenLeftNav,
  onToggleRightPanel,
  onOpenSearch,
  onOpenPalette,
  onOpenCapture,
  onCreate,
  onOpenSettings,
}: TopBarProps) {
  const { mode, toggleColorMode } = useColorMode();
  const location = useLocation();
  const currentLabel = React.useMemo(
    () => getRouteLabelByPathname(location.pathname),
    [location.pathname],
  );
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [syncState, setSyncState] = React.useState(getSyncState());
  const [syncErrorOpen, setSyncErrorOpen] = React.useState(false);

  const menuOpen = Boolean(anchorEl);

  React.useEffect(() => subscribeSyncState(setSyncState), []);

  const handleMenuOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const totalOffset = leftWidth + rightWidth;
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
    <AppBar
      position="fixed"
      color="default"
      sx={{
        zIndex: (theme) => theme.zIndex.drawer + 1,
        width: isMobile ? '100%' : `calc(100% - ${totalOffset}px)`,
        ml: isMobile ? 0 : `${leftWidth}px`,
      }}
    >
      <Toolbar sx={{ gap: 1 }}>
        {isMobile && (
          <IconButton color="inherit" edge="start" onClick={onOpenLeftNav} aria-label="Abrir menu">
            <MenuIcon />
          </IconButton>
        )}
        <Typography variant="h6" component="div" sx={{ flexGrow: 1, whiteSpace: 'nowrap' }}>
          {currentLabel}
        </Typography>
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
          />
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
            Ultimo: {lastSuccessRelative}
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'block', sm: 'none' } }}>
            {lastSuccessRelative}
          </Typography>
        </ButtonBase>
        {isMobile ? (
          <IconButton color="inherit" onClick={onOpenCapture} aria-label="Capturar">
            <EditNote />
          </IconButton>
        ) : (
          <Button color="inherit" startIcon={<EditNote />} onClick={onOpenCapture}>
            Capturar
          </Button>
        )}
        {isMobile ? (
          <IconButton
            color="inherit"
            onClick={handleMenuOpen}
            aria-label="Criar"
            aria-controls={menuOpen ? 'create-menu' : undefined}
            aria-haspopup="true"
            aria-expanded={menuOpen ? 'true' : undefined}
          >
            <Add />
          </IconButton>
        ) : (
          <Button
            color="inherit"
            startIcon={<Add />}
            onClick={handleMenuOpen}
            aria-controls={menuOpen ? 'create-menu' : undefined}
            aria-haspopup="true"
            aria-expanded={menuOpen ? 'true' : undefined}
          >
            Criar
          </Button>
        )}
        <Menu id="create-menu" anchorEl={anchorEl} open={menuOpen} onClose={handleMenuClose}>
          <MenuItem
            onClick={() => {
              handleMenuClose();
              void onCreate('note');
            }}
          >
            Criar nota
          </MenuItem>
          <MenuItem
            onClick={() => {
              handleMenuClose();
              void onCreate('folder');
            }}
          >
            Criar pasta
          </MenuItem>
        </Menu>
        <IconButton color="inherit" onClick={onOpenSearch} aria-label="Buscar">
          <Search />
        </IconButton>
        <IconButton color="inherit" onClick={onOpenPalette} aria-label="Paleta de comandos">
          <Bolt />
        </IconButton>
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
          <IconButton
            color="inherit"
            onClick={() => void syncNowManual()}
            aria-label="Sincronizar agora"
          >
            {statusIcon}
          </IconButton>
        </Tooltip>
        <IconButton color="inherit" onClick={toggleColorMode} aria-label="Alternar tema">
          {mode === 'dark' ? <Brightness7 /> : <Brightness4 />}
        </IconButton>
        <IconButton color="inherit" onClick={onOpenSettings} aria-label="Configuracoes">
          <Settings />
        </IconButton>
        <IconButton
          color="inherit"
          onClick={onToggleRightPanel}
          aria-label="Alternar painel de contexto"
        >
          <InfoOutlined />
        </IconButton>
      </Toolbar>
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
    </AppBar>
  );
}
