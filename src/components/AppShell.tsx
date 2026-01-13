import React from 'react';
import { Box, SpeedDial, SpeedDialAction, SpeedDialIcon, Toolbar } from '@mui/material';
import { v4 as uuidv4 } from 'uuid';
import { useTheme } from '@mui/material/styles';
import { Outlet, useMatch, useNavigate } from 'react-router-dom';
import { Add, CreateNewFolder, EditNote } from '@mui/icons-material';

import LeftNav from './shell/LeftNav';
import SearchDialog from './SearchDialog';
import CommandPalette from './CommandPalette';
import RightContextPanel from './shell/ContextPanel';
import TopBar from './shell/Topbar';
import CaptureDialog from './dialogs/CaptureDialog';
import { useDataStore } from '../store/useDataStore';
import { useSpaceStore } from '../store/useSpaceStore';
import { useTaskSelection } from '../store/useTaskSelection';
import { executeCommand } from '../command/execute';
import { useNotifier } from './Notifier';
import { createInboxItem } from '../data/inbox';
import { appendNoteBlock, createNote, getByTitleExact, setLocalChangeHandler } from '../data/repo';
import { useItem } from '../data/hooks';
import type { Block, NodeType } from '../data/types';
import { getStoredSyncSettings } from '../sync/syncState';
import { initAutoSync, markDirty, scheduleSyncSoon } from '../sync/syncService';
import { getTodayISO } from '../tasks/date';
import { maybeRebuildTaskIndex } from '../tasks/taskIndexRebuild';
import { useIsMobile } from '../app/useIsMobile';
import { runAutoBackupIfDue } from '../data/autoBackup';
import { GIT_SHA } from '../app/buildInfo';
import type { SearchHit } from '../search/useSearch';

const DRAWER_WIDTH = 280;
const COLLAPSED_WIDTH = 72;
const RIGHT_PANEL_WIDTH = 320;

export default function AppShell() {
  const theme = useTheme();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const notifier = useNotifier();
  const { init: initData, createQuick } = useDataStore((state) => ({
    init: state.init,
    createQuick: state.createQuick,
  }));
  const space = useSpaceStore((state) => state.space);
  const { selectedTask, setSelectedTask } = useTaskSelection((state) => ({
    selectedTask: state.selectedTask,
    setSelectedTask: state.setSelectedTask,
  }));
  const itemMatch = useMatch('/item/:id');
  const currentItemId = itemMatch?.params?.id ?? '';
  const currentItem = useItem(currentItemId);

  const [mobileLeftOpen, setMobileLeftOpen] = React.useState(false);
  const [leftCollapsed, setLeftCollapsed] = React.useState(false);
  const [rightOpen, setRightOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [captureOpen, setCaptureOpen] = React.useState(false);
  const [fabOpen, setFabOpen] = React.useState(false);

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

  const openCapture = React.useCallback(() => {
    setSearchOpen(false);
    setPaletteOpen(false);
    setCaptureOpen(true);
  }, []);

  React.useEffect(() => {
    let active = true;
    const run = async () => {
      try {
        await initData();
        if (!active) {
          return;
        }
        let lastNotified = 0;
        const didRun = await maybeRebuildTaskIndex({
          onProgress: ({ processedCount, totalCount }) => {
            if (!active || totalCount === 0) {
              return;
            }
            const progress = processedCount / totalCount;
            if (progress - lastNotified >= 0.25 || progress >= 1) {
              lastNotified = progress;
              notifier.info(`Reindexando tarefas... ${Math.round(progress * 100)}%`);
            }
          },
        });
        if (didRun && active) {
          notifier.success('Indice de tarefas atualizado');
        }
      } catch (error) {
        if (!active) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        notifier.error(`Erro ao reindexar tarefas: ${message}`);
      }
    };
    void run();
    return () => {
      active = false;
    };
  }, [initData, notifier]);

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
    const storedKey = 'mf_build_sha';
    if (typeof window === 'undefined') {
      return;
    }
    const previous = window.localStorage.getItem(storedKey);
    if (previous && previous !== GIT_SHA) {
      notifier.info(`App atualizado para v-${GIT_SHA}`);
    }
    window.localStorage.setItem(storedKey, GIT_SHA);
  }, [notifier]);

  React.useEffect(() => {
    let active = true;
    const run = async () => {
      if (!active) {
        return;
      }
      try {
        await runAutoBackupIfDue();
      } catch {
        // ignore auto-backup errors
      }
    };
    void run();
    const intervalId = setInterval(run, 10 * 60 * 1000);
    return () => {
      active = false;
      clearInterval(intervalId);
    };
  }, []);

  React.useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!target || !(target instanceof HTMLElement)) {
        return false;
      }
      const tag = target.tagName.toLowerCase();
      return tag === 'input' || tag === 'textarea' || target.isContentEditable;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const dialogOpen = Boolean(document.querySelector('[role="dialog"]'));
      if (dialogOpen) {
        return;
      }

      if (event.key === '?' && !isEditableTarget(event.target)) {
        event.preventDefault();
        navigate('/help');
        return;
      }

      const isModifier = event.ctrlKey || event.metaKey;
      if (!isModifier) {
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

      if (key === 'c' && event.shiftKey && !isEditableTarget(event.target)) {
        event.preventDefault();
        openCapture();
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
  }, [createQuick, navigate, notifier, openCapture, openSearch, togglePalette, toggleSearch]);

  const handleSelectSearchResult = (hit: SearchHit) => {
    setSearchOpen(false);
    if (hit.kind === 'task') {
      setSelectedTask(hit.task);
      setRightOpen(true);
      navigate(`/item/${hit.task.noteId}`, {
        state: { highlightBlockId: hit.task.blockId },
      });
      return;
    }
    navigate(`/item/${hit.id}`);
  };

  const handleExecuteCommand = async (
    command: Parameters<typeof executeCommand>[0],
    rawInput: string,
  ) => {
    try {
      if (command.kind === 'open-task') {
        setRightOpen(true);
      }
      await executeCommand(command, navigate, rawInput, { currentItem, selectedTask, space });
      setPaletteOpen(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(message);
    }
  };

  const handleCreate = React.useCallback(
    async (type: NodeType) => {
      try {
        const id = await createQuick(type);
        navigate(`/item/${id}`, {
          state: type === 'note' ? { focusEditor: true } : undefined,
        });
        notifier.success(type === 'folder' ? 'Pasta criada' : 'Nota criada');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        notifier.error(`Erro ao criar: ${message}`);
      }
    },
    [createQuick, navigate, notifier],
  );

  const handleCapture = React.useCallback(
    async (payload: { text: string; logDaily: boolean }) => {
      const now = new Date();
      const block: Block = {
        id: uuidv4(),
        type: 'paragraph',
        text: payload.text,
        createdAt: Date.now(),
      };
      try {
        await createInboxItem(payload.text, space);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        notifier.error(`Erro ao enviar para inbox: ${message}`);
        return;
      }

      if (payload.logDaily) {
        try {
          const title = `Capturas - ${getTodayISO()}`;
          const existing = await getByTitleExact(title);
          if (existing && existing.nodeType === 'note') {
            await appendNoteBlock(existing.id, block);
            navigate(`/item/${existing.id}`, { state: { focusEditor: false } });
          } else {
            const note = await createNote({ title, content: [block] });
            navigate(`/item/${note.id}`, { state: { focusEditor: true } });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          notifier.error(`Inbox salvo, mas falhou o diario: ${message}`);
          setCaptureOpen(false);
          return;
        }
      }

      notifier.success(
        payload.logDaily ? 'Enviado para inbox e diario' : 'Enviado para inbox',
      );
      setCaptureOpen(false);
    },
    [navigate, notifier, space],
  );

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
        onOpenCapture={openCapture}
        onCreate={handleCreate}
        onOpenSettings={() => navigate('/settings')}
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
      <CaptureDialog
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onCapture={handleCapture}
      />
      {isMobile && (
        <SpeedDial
          ariaLabel="Acoes rapidas"
          icon={<SpeedDialIcon />}
          onClose={() => setFabOpen(false)}
          onOpen={() => setFabOpen(true)}
          open={fabOpen}
          sx={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            zIndex: theme.zIndex.drawer + 2,
          }}
        >
          <SpeedDialAction
            icon={<EditNote />}
            tooltipTitle="Capturar"
            onClick={() => {
              setFabOpen(false);
              openCapture();
            }}
          />
          <SpeedDialAction
            icon={<Add />}
            tooltipTitle="Criar nota"
            onClick={() => {
              setFabOpen(false);
              void handleCreate('note');
            }}
          />
          <SpeedDialAction
            icon={<CreateNewFolder />}
            tooltipTitle="Criar pasta"
            onClick={() => {
              setFabOpen(false);
              void handleCreate('folder');
            }}
          />
        </SpeedDial>
      )}
    </Box>
  );
}
