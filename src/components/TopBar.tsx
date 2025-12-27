import React from 'react';
import {
  AppBar,
  Button,
  IconButton,
  Menu,
  MenuItem,
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
  ErrorOutline,
  InfoOutlined,
  Menu as MenuIcon,
  Search,
} from '@mui/icons-material';

import { useColorMode } from '../app/ColorModeContext';
import { getRouteLabelByPathname } from '../app/routes';
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
};

export default function TopBar({
  isMobile,
  leftWidth,
  rightWidth,
  onOpenLeftNav,
  onToggleRightPanel,
  onOpenSearch,
  onOpenPalette,
}: TopBarProps) {
  const { mode, toggleColorMode } = useColorMode();
  const location = useLocation();
  const currentLabel = React.useMemo(
    () => getRouteLabelByPathname(location.pathname),
    [location.pathname],
  );
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);
  const [syncState, setSyncState] = React.useState(getSyncState());

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
        <Menu id="create-menu" anchorEl={anchorEl} open={menuOpen} onClose={handleMenuClose}>
          <MenuItem onClick={handleMenuClose}>Nota</MenuItem>
          <MenuItem onClick={handleMenuClose}>Pasta</MenuItem>
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
              {syncState.status === 'error' && syncState.lastError && (
                <Typography variant="body2">{syncState.lastError}</Typography>
              )}
            </>
          }
        >
          <IconButton color="inherit" onClick={() => void syncNowManual()} aria-label="Sync agora">
            {statusIcon}
          </IconButton>
        </Tooltip>
        <IconButton color="inherit" onClick={toggleColorMode} aria-label="Alternar tema">
          {mode === 'dark' ? <Brightness7 /> : <Brightness4 />}
        </IconButton>
        <IconButton
          color="inherit"
          onClick={onToggleRightPanel}
          aria-label="Alternar painel de contexto"
        >
          <InfoOutlined />
        </IconButton>
      </Toolbar>
    </AppBar>
  );
}
