import React from 'react';
import {
  AppBar,
  Button,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import { useLocation } from 'react-router-dom';
import {
  Add,
  Brightness4,
  Brightness7,
  EditNote,
  InfoOutlined,
  Menu as MenuIcon,
  Search,
  Settings,
} from '@mui/icons-material';

import { useColorMode } from '../../app/ColorModeContext';
import { getRouteLabelByPathname } from '../../app/routes';
import type { NodeType } from '../../data/types';
import CommandPaletteButton from './CommandPaletteButton';
import QuickAddInput from './QuickAddInput';
import SpaceSwitcher from './SpaceSwitcher';
import SyncStatusChip from './SyncStatusChip';

type TopbarProps = {
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

export default function Topbar({
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
}: TopbarProps) {
  const { mode, toggleColorMode } = useColorMode();
  const location = useLocation();
  const currentLabel = React.useMemo(
    () => getRouteLabelByPathname(location.pathname),
    [location.pathname],
  );
  const [anchorEl, setAnchorEl] = React.useState<null | HTMLElement>(null);

  const menuOpen = Boolean(anchorEl);

  const handleMenuOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const totalOffset = leftWidth + rightWidth;

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
        <Typography variant="h6" component="div" sx={{ whiteSpace: 'nowrap' }}>
          {currentLabel}
        </Typography>
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          sx={{ ml: 2, display: { xs: 'none', lg: 'flex' } }}
        >
          <SpaceSwitcher size="small" />
          <QuickAddInput />
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ ml: 'auto' }}>
          <SyncStatusChip compact={isMobile} />
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
          <CommandPaletteButton onOpen={onOpenPalette} />
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
        </Stack>
      </Toolbar>
    </AppBar>
  );
}
