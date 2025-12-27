import React from 'react';
import { Box, Toolbar, useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { Outlet, useMatch, useNavigate } from 'react-router-dom';

import LeftNav from './LeftNav';
import SearchDialog from './SearchDialog';
import CommandPalette from './CommandPalette';
import RightContextPanel from './RightContextPanel';
import TopBar from './TopBar';
import { useDataStore } from '../store/useDataStore';
import { executeCommand } from '../command/execute';
import { useNotifier } from './Notifier';
import { setLocalChangeHandler } from '../data/repo';
import { useItem } from '../data/hooks';
import { getStoredSyncSettings } from '../sync/syncState';
import { initAutoSync, markDirty, scheduleSyncSoon } from '../sync/syncService';

const DRAWER_WIDTH = 280;
const COLLAPSED_WIDTH = 72;
const RIGHT_PANEL_WIDTH = 320;

export default function AppShell() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const notifier = useNotifier();
  const { init: initData, createQuick } = useDataStore((state) => ({
    init: state.init,
    createQuick: state.createQuick,
  }));
  const itemMatch = useMatch('/item/:id');
  const currentItemId = itemMatch?.params?.id ?? '';
  const currentItem = useItem(currentItemId);

  const [mobileLeftOpen, setMobileLeftOpen] = React.useState(false);
  const [leftCollapsed, setLeftCollapsed] = React.useState(false);
  const [rightOpen, setRightOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  const leftWidth = isMobile ? 0 : leftCollapsed ? COLLAPSED_WIDTH : DRAWER_WIDTH;
  const rightWidth = isMobile ? 0 : rightOpen ? RIGHT_PANEL_WIDTH : 0;

  const handleLeftToggle = () => setMobileLeftOpen((prev) => !prev);
  const handleLeftClose = () => setMobileLeftOpen(false);

  const handleRightToggle = () => setRightOpen((prev) => !prev);
  const handleRightClose = () => setRightOpen(false);

  const openSearch = React.useCallback(() => {
    setPaletteOpen(false);
    setSearchOpen(true);
  }, []);

  const toggleSearch = React.useCallback(() => {
    setPaletteOpen(false);
    setSearchOpen((prev) => !prev);
  }, []);

  const openPalette = React.useCallback(() => {
    setSearchOpen(false);
    setPaletteOpen(true);
  }, []);

  const togglePalette = React.useCallback(() => {
    setSearchOpen(false);
    setPaletteOpen((prev) => !prev);
  }, []);

  React.useEffect(() => {
    void initData();
  }, [initData]);

  React.useEffect(() => {
    initAutoSync(() => getStoredSyncSettings());
    setLocalChangeHandler(() => {
      markDirty();
      scheduleSyncSoon();
    });
    return () => {
      setLocalChangeHandler(null);
    };
  }, []);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isModifier = event.ctrlKey || event.metaKey;
      if (!isModifier) {
        return;
      }

      const dialogOpen = Boolean(document.querySelector('[role="dialog"]'));
      if (dialogOpen) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'p') {
        event.preventDefault();
        toggleSearch();
        return;
      }

      if (key === 'k') {
        event.preventDefault();
        togglePalette();
        return;
      }

      if (key === '/') {
        event.preventDefault();
        openSearch();
        return;
      }

      if (key === 'n') {
        event.preventDefault();
        const type = event.shiftKey ? 'folder' : 'note';
        void createQuick(type)
          .then((id) => {
            navigate(`/item/${id}`);
            notifier.success(type === 'folder' ? 'Pasta criada' : 'Nota criada');
          })
          .catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            notifier.error(`Erro ao criar: ${message}`);
          });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [createQuick, navigate, notifier, openSearch, togglePalette, toggleSearch]);

  const handleSelectSearchResult = (id: string) => {
    setSearchOpen(false);
    navigate(`/item/${id}`);
  };

  const handleExecuteCommand = async (
    command: Parameters<typeof executeCommand>[0],
    rawInput: string,
  ) => {
    await executeCommand(command, navigate, rawInput, { currentItem });
    setPaletteOpen(false);
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <TopBar
        isMobile={isMobile}
        leftWidth={leftWidth}
        rightWidth={rightWidth}
        onOpenLeftNav={handleLeftToggle}
        onToggleRightPanel={handleRightToggle}
        onOpenSearch={openSearch}
        onOpenPalette={openPalette}
      />
      <LeftNav
        isMobile={isMobile}
        open={mobileLeftOpen}
        onClose={handleLeftClose}
        collapsed={!isMobile && leftCollapsed}
        onToggleCollapse={() => setLeftCollapsed((prev) => !prev)}
        drawerWidth={DRAWER_WIDTH}
        collapsedWidth={COLLAPSED_WIDTH}
      />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 1.5, md: 3 },
          ml: isMobile ? 0 : `${leftWidth}px`,
          mr: isMobile ? 0 : `${rightWidth}px`,
          transition: theme.transitions.create(['margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.shortest,
          }),
        }}
      >
        <Toolbar />
        <Outlet />
      </Box>
      <RightContextPanel
        isMobile={isMobile}
        open={rightOpen}
        onClose={handleRightClose}
        width={RIGHT_PANEL_WIDTH}
      />
      <SearchDialog
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={handleSelectSearchResult}
      />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onExecute={handleExecuteCommand}
      />
    </Box>
  );
}
