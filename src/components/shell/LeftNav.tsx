import {
  Box,
  Collapse,
  Divider,
  Dialog,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListItem,
  Menu,
  MenuItem,
  Button,
  Tooltip,
  Toolbar,
  Typography,
} from '@mui/material';
import {
  Add,
  ChevronLeft,
  ChevronRight,
  ExpandLess,
  ExpandMore,
  MoreVert,
  ViewList,
} from '@mui/icons-material';
import { useLiveQuery } from 'dexie-react-hooks';
import React from 'react';
import { NavLink } from 'react-router-dom';

import { GIT_SHA } from '../../app/buildInfo';
import { useCockpitEnabled } from '../../app/featureFlags';
import { NAV_ROUTES } from '../../app/routes';
import { db } from '../../data/db';
import { deleteView, upsertView } from '../../data/repo';
import type { SavedView } from '../../data/types';
import { sortViews } from '../../data/sortViews';
import ConfirmDialog from '../ConfirmDialog';
import { useNotifier } from '../Notifier';
import ViewEditorDialog from '../dialogs/ViewEditorDialog';
import VaultTree from './VaultTree';

type LeftNavProps = {
  isMobile: boolean;
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  drawerWidth: number;
  collapsedWidth: number;
};

const NAV_ORDER_KEY = 'nav_routes_order_v2';
const ADVANCED_OPEN_KEY = 'nav_advanced_open';
const versionLabel = `v-${GIT_SHA}`;

const LEGACY_PRIMARY_KEYS = [
  'focus',
  'today',
  'inbox',
  'projects',
  'notes',
  'review',
];

const LEGACY_ADVANCED_KEYS = ['tasks', 'tags', 'graph', 'trash', 'settings', 'help'];

const COCKPIT_PRIMARY_KEYS = ['home-cockpit', 'focus', 'inbox'];

const COCKPIT_ADVANCED_KEYS = [
  'today',
  'tasks',
  'projects',
  'notes',
  'review',
  'tags',
  'graph',
  'trash',
  'settings',
  'help',
];

const readStored = (key: string) => {
  if (typeof window === 'undefined') {
    return undefined;
  }
  const raw = window.localStorage.getItem(key);
  if (raw === '1') {
    return true;
  }
  if (raw === '0') {
    return false;
  }
  return undefined;
};

const writeStored = (key: string, value: boolean) => {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(key, value ? '1' : '0');
};

const readNavOrder = () => {
  if (typeof window === 'undefined') {
    return [] as string[];
  }
  try {
    const raw = localStorage.getItem(NAV_ORDER_KEY);
    if (!raw) {
      return [] as string[];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [] as string[];
    }
    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [] as string[];
  }
};

const applyNavOrder = (items: typeof NAV_ROUTES, order: string[]) => {
  const byKey = new Map(items.map((item) => [item.key, item]));
  const ordered: typeof NAV_ROUTES = [];
  order.forEach((key) => {
    const item = byKey.get(key);
    if (item) {
      ordered.push(item);
      byKey.delete(key);
    }
  });
  byKey.forEach((item) => ordered.push(item));
  return ordered;
};

const areArraysEqual = (left: string[], right: string[]) =>
  left.length === right.length && left.every((value, index) => value === right[index]);

const buildNavMap = () => new Map(NAV_ROUTES.map((route) => [route.key, route]));

const buildNavList = (keys: string[], byKey: Map<string, (typeof NAV_ROUTES)[number]>) =>
  keys.map((key) => byKey.get(key)).filter(Boolean) as (typeof NAV_ROUTES)[number][];

export default function LeftNav({
  isMobile,
  open,
  onClose,
  collapsed,
  onToggleCollapse,
  drawerWidth,
  collapsedWidth,
}: LeftNavProps) {
  const notifier = useNotifier();
  const width = collapsed ? collapsedWidth : drawerWidth;
  const rawViews = useLiveQuery(() => db.views.toArray(), []) ?? [];
  const views = React.useMemo(() => sortViews([...rawViews]), [rawViews]);
  const viewsById = React.useMemo(
    () => new Map(views.map((view) => [view.id, view])),
    [views],
  );
  const navByKey = React.useMemo(() => buildNavMap(), []);
  const [cockpitEnabled] = useCockpitEnabled();
  const [viewDialogOpen, setViewDialogOpen] = React.useState(false);
  const [editingView, setEditingView] = React.useState<SavedView | null>(null);
  const [viewMenuAnchor, setViewMenuAnchor] = React.useState<null | HTMLElement>(null);
  const [viewMenuId, setViewMenuId] = React.useState<string | null>(null);
  const [deleteViewId, setDeleteViewId] = React.useState<string | null>(null);
  const [navOrder, setNavOrder] = React.useState<string[]>(readNavOrder);
  const [draggingNavKey, setDraggingNavKey] = React.useState<string | null>(null);
  const [dropNavKey, setDropNavKey] = React.useState<string | null>(null);
  const [dropNavPosition, setDropNavPosition] = React.useState<'above' | 'below' | null>(
    null,
  );
  const [advancedOpen, setAdvancedOpen] = React.useState(
    () => readStored(ADVANCED_OPEN_KEY) ?? false,
  );
  const [advancedDialogOpen, setAdvancedDialogOpen] = React.useState(false);

  const primaryItems = React.useMemo(() => {
    const keys = cockpitEnabled ? COCKPIT_PRIMARY_KEYS : LEGACY_PRIMARY_KEYS;
    return buildNavList(keys, navByKey);
  }, [cockpitEnabled, navByKey]);
  const advancedItems = React.useMemo(() => {
    const keys = cockpitEnabled ? COCKPIT_ADVANCED_KEYS : LEGACY_ADVANCED_KEYS;
    return buildNavList(keys, navByKey);
  }, [cockpitEnabled, navByKey]);

  const navItems = React.useMemo(() => {
    if (cockpitEnabled) {
      return primaryItems;
    }
    return applyNavOrder(primaryItems, navOrder);
  }, [cockpitEnabled, navOrder, primaryItems]);

  React.useEffect(() => {
    if (collapsed) {
      setAdvancedOpen(false);
    }
  }, [collapsed]);

  React.useEffect(() => {
    if (cockpitEnabled) {
      setAdvancedOpen(false);
    }
  }, [cockpitEnabled]);

  React.useEffect(() => {
    if (cockpitEnabled) {
      return;
    }
    const normalizedOrder = applyNavOrder(primaryItems, navOrder).map((item) => item.key);
    if (!areArraysEqual(normalizedOrder, navOrder)) {
      setNavOrder(normalizedOrder);
    }
  }, [cockpitEnabled, navOrder, primaryItems]);

  React.useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(navOrder));
  }, [navOrder]);

  React.useEffect(() => {
    writeStored(ADVANCED_OPEN_KEY, advancedOpen);
  }, [advancedOpen]);

  const handleNavigate = () => {
    if (isMobile) {
      onClose();
    }
  };

  const handleDialogNavigate = () => {
    setAdvancedDialogOpen(false);
    handleNavigate();
  };

  const handleOpenViewDialog = (view?: SavedView | null) => {
    setEditingView(view ?? null);
    setViewDialogOpen(true);
  };

  const handleSaveView = async (view: SavedView) => {
    try {
      await upsertView(view);
      notifier.success(editingView ? 'Visao atualizada' : 'Visao criada');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao salvar visao: ${message}`);
    } finally {
      setViewDialogOpen(false);
      setEditingView(null);
    }
  };

  const handleOpenViewMenu = (event: React.MouseEvent<HTMLButtonElement>, id: string) => {
    event.stopPropagation();
    setViewMenuAnchor(event.currentTarget);
    setViewMenuId(id);
  };

  const handleCloseViewMenu = () => {
    setViewMenuAnchor(null);
    setViewMenuId(null);
  };

  const handleEditView = () => {
    if (!viewMenuId) {
      return;
    }
    const view = viewsById.get(viewMenuId);
    handleCloseViewMenu();
    if (view) {
      handleOpenViewDialog(view);
    }
  };

  const handleDeleteViewRequest = () => {
    if (!viewMenuId) {
      return;
    }
    setDeleteViewId(viewMenuId);
    handleCloseViewMenu();
  };

  const handleConfirmDeleteView = async () => {
    if (!deleteViewId) {
      return;
    }
    try {
      await deleteView(deleteViewId);
      notifier.success('Visao excluida');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao excluir visao: ${message}`);
    } finally {
      setDeleteViewId(null);
    }
  };

  const clearDragState = React.useCallback(() => {
    setDraggingNavKey(null);
    setDropNavKey(null);
    setDropNavPosition(null);
  }, []);

  const getDragNavKey = React.useCallback(
    (event: React.DragEvent) =>
      draggingNavKey ||
      event.dataTransfer.getData('application/x-nav-key') ||
      event.dataTransfer.getData('text/plain') ||
      '',
    [draggingNavKey],
  );

  const handleNavDragStart = React.useCallback((event: React.DragEvent, key: string) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', key);
    event.dataTransfer.setData('application/x-nav-key', key);
    setDraggingNavKey(key);
    setDropNavKey(key);
    setDropNavPosition(null);
  }, []);

  const handleNavDragOver = React.useCallback(
    (event: React.DragEvent, key: string) => {
      const activeKey = getDragNavKey(event);
      if (!activeKey || activeKey === key) {
        return;
      }
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
      const nextPosition = event.clientY < rect.top + rect.height / 2 ? 'above' : 'below';
      setDropNavKey(key);
      setDropNavPosition(nextPosition);
    },
    [getDragNavKey],
  );

  const handleNavDrop = React.useCallback(
    (event: React.DragEvent, key: string) => {
      const activeKey = getDragNavKey(event);
      event.preventDefault();
      event.stopPropagation();
      clearDragState();
      if (!activeKey || activeKey === key) {
        return;
      }
      const dragged = navItems.find((item) => item.key === activeKey);
      if (!dragged) {
        return;
      }
      const next = navItems.filter((item) => item.key !== activeKey);
      const targetIndex = next.findIndex((item) => item.key === key);
      const insertIndex =
        targetIndex >= 0
          ? targetIndex + (dropNavPosition === 'below' ? 1 : 0)
          : next.length;
      next.splice(insertIndex, 0, dragged);
      setNavOrder(next.map((item) => item.key));
    },
    [clearDragState, dropNavPosition, getDragNavKey, navItems],
  );

  const handleNavListDrop = React.useCallback(
    (event: React.DragEvent) => {
      const activeKey = getDragNavKey(event);
      event.preventDefault();
      clearDragState();
      if (!activeKey) {
        return;
      }
      const dragged = navItems.find((item) => item.key === activeKey);
      if (!dragged) {
        return;
      }
      const next = navItems.filter((item) => item.key !== activeKey);
      next.push(dragged);
      setNavOrder(next.map((item) => item.key));
    },
    [clearDragState, getDragNavKey, navItems],
  );

  const getNavLabel = React.useCallback(
    (item: (typeof NAV_ROUTES)[number]) => {
      if (cockpitEnabled && item.key === 'notes') {
        return 'Registros/Arquivo';
      }
      return item.label;
    },
    [cockpitEnabled],
  );

  const renderNavList = (
    items: (typeof NAV_ROUTES)[number][],
    {
      draggable,
    }: {
      draggable?: boolean;
    } = {},
  ) => (
    <List
      onDragOver={(event) => {
        if (!draggable || !draggingNavKey) {
          return;
        }
        event.preventDefault();
      }}
      onDrop={draggable ? handleNavListDrop : undefined}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const label = getNavLabel(item);
        const isDropTarget = dropNavKey === item.key;
        const showIndicator =
          draggable && isDropTarget && (dropNavPosition === 'above' || dropNavPosition === 'below');
        const indicatorPosition = dropNavPosition === 'below' ? 'bottom' : 'top';
        const button = (
          <ListItemButton
            key={item.key}
            component={NavLink}
            to={item.path}
            end={item.path === '/'}
            onClick={handleNavigate}
            draggable={draggable}
            onDragStart={draggable ? (event) => handleNavDragStart(event, item.key) : undefined}
            onDragEnd={draggable ? clearDragState : undefined}
            onDragOver={draggable ? (event) => handleNavDragOver(event, item.key) : undefined}
            onDrop={draggable ? (event) => handleNavDrop(event, item.key) : undefined}
            sx={{
              minHeight: 48,
              px: collapsed ? 1.5 : 2.5,
              justifyContent: collapsed ? 'center' : 'flex-start',
              '&.active, &[aria-current="page"]': {
                bgcolor: 'action.selected',
                '& .MuiListItemIcon-root': { color: 'text.primary' },
              },
            }}
          >
            <ListItemIcon
              sx={{
                minWidth: 0,
                mr: collapsed ? 0 : 2,
                justifyContent: 'center',
              }}
            >
              {Icon ? <Icon /> : null}
            </ListItemIcon>
            <ListItemText
              primary={label}
              primaryTypographyProps={{ noWrap: true }}
              sx={{ opacity: collapsed ? 0 : 1 }}
            />
          </ListItemButton>
        );

        return collapsed ? (
          <ListItem key={item.key} disablePadding sx={{ position: 'relative' }}>
            {showIndicator && (
              <Box
                sx={{
                  position: 'absolute',
                  left: collapsed ? 8 : 16,
                  right: 12,
                  height: 2,
                  bgcolor: 'primary.main',
                  borderRadius: 1,
                  [indicatorPosition]: 0,
                }}
              />
            )}
            <Tooltip title={label} placement="right">
              {button}
            </Tooltip>
          </ListItem>
        ) : (
          <ListItem key={item.key} disablePadding sx={{ position: 'relative' }}>
            {showIndicator && (
              <Box
                sx={{
                  position: 'absolute',
                  left: 16,
                  right: 12,
                  height: 2,
                  bgcolor: 'primary.main',
                  borderRadius: 1,
                  [indicatorPosition]: 0,
                }}
              />
            )}
            {button}
          </ListItem>
        );
      })}
    </List>
  );

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar />
      <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
        {!collapsed && (
          <VaultTree isMobile={isMobile} onNavigate={handleNavigate} />
        )}
        <Divider />
        {!collapsed && (
          <Typography
            variant="overline"
            sx={{ px: 2.5, py: 1, display: 'block', color: 'text.secondary' }}
          >
            Navegacao
          </Typography>
        )}
        {renderNavList(navItems, { draggable: !cockpitEnabled })}
        <Divider />
        <List disablePadding>
          <ListItemButton
            onClick={() => {
              if (cockpitEnabled) {
                setAdvancedDialogOpen(true);
              } else {
                setAdvancedOpen((prev) => !prev);
              }
            }}
            sx={{
              minHeight: 48,
              px: collapsed ? 1.5 : 2.5,
              justifyContent: collapsed ? 'center' : 'space-between',
            }}
          >
            {!collapsed && (
              <ListItemText
                primary={cockpitEnabled ? 'Mais' : 'Avancado'}
                primaryTypographyProps={{ noWrap: true }}
              />
            )}
            {collapsed ? (
              <Tooltip title={cockpitEnabled ? 'Mais' : 'Avancado'} placement="right">
                <Box>
                  {cockpitEnabled ? <MoreVert /> : advancedOpen ? <ExpandLess /> : <ExpandMore />}
                </Box>
              </Tooltip>
            ) : (
              <>{cockpitEnabled ? <MoreVert /> : advancedOpen ? <ExpandLess /> : <ExpandMore />}</>
            )}
          </ListItemButton>
        </List>
        {!cockpitEnabled && (
          <Collapse in={advancedOpen} timeout="auto" unmountOnExit>
          {renderNavList(advancedItems)}
          {!collapsed && (
            <>
              <Divider />
              <Box
                sx={{
                  px: 2.5,
                  py: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Typography variant="overline" color="text.secondary">
                  Minhas visoes
                </Typography>
                <IconButton
                  size="small"
                  aria-label="Criar visao"
                  onClick={() => handleOpenViewDialog(null)}
                >
                  <Add fontSize="small" />
                </IconButton>
              </Box>
              <List dense disablePadding>
                {views.length === 0 ? (
                  <ListItem>
                    <ListItemText primary="Nenhuma visao ainda." />
                  </ListItem>
                ) : (
                  views.map((view) => (
                    <ListItem
                      key={view.id}
                      disablePadding
                      secondaryAction={
                        <IconButton
                          edge="end"
                          aria-label="Acoes"
                          size="small"
                          onClick={(event) => handleOpenViewMenu(event, view.id)}
                        >
                          <MoreVert fontSize="small" />
                        </IconButton>
                      }
                    >
                      <ListItemButton
                        component={NavLink}
                        to={`/view/${view.id}`}
                        onClick={handleNavigate}
                        sx={{
                          minHeight: 44,
                          px: 2.5,
                          '&.active, &[aria-current="page"]': {
                            bgcolor: 'action.selected',
                            '& .MuiListItemIcon-root': { color: 'text.primary' },
                          },
                        }}
                      >
                        <ListItemIcon sx={{ minWidth: 0, mr: 2 }}>
                          <ViewList fontSize="small" />
                        </ListItemIcon>
                        <ListItemText
                          primary={view.name}
                          primaryTypographyProps={{ noWrap: true }}
                        />
                      </ListItemButton>
                    </ListItem>
                  ))
                )}
              </List>
            </>
          )}
          </Collapse>
        )}
      </Box>
      {!isMobile && (
        <>
          <Divider />
          <List>
            <ListItemButton
              onClick={onToggleCollapse}
              sx={{
                minHeight: 48,
                px: collapsed ? 1.5 : 2.5,
                justifyContent: collapsed ? 'center' : 'flex-start',
              }}
            >
              <ListItemIcon
                sx={{
                  minWidth: 0,
                  mr: collapsed ? 0 : 2,
                  justifyContent: 'center',
                }}
              >
                {collapsed ? <ChevronRight /> : <ChevronLeft />}
              </ListItemIcon>
              <ListItemText
                primary={collapsed ? 'Expandir' : 'Recolher'}
                primaryTypographyProps={{ noWrap: true }}
                sx={{ opacity: collapsed ? 0 : 1 }}
              />
            </ListItemButton>
          </List>
        </>
      )}
      <Divider />
      <Box
        sx={{
          px: collapsed ? 1.5 : 2.5,
          py: 1,
          display: 'flex',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        {collapsed ? (
          <Tooltip title={versionLabel} placement="right">
            <Typography variant="caption" color="text.secondary">
              v
            </Typography>
          </Tooltip>
        ) : (
          <Typography variant="caption" color="text.secondary">
            {versionLabel}
          </Typography>
        )}
      </Box>
    </Box>
  );

  return (
    <Drawer
      variant={isMobile ? 'temporary' : 'permanent'}
      open={isMobile ? open : true}
      onClose={onClose}
      ModalProps={{ keepMounted: true }}
      PaperProps={{ sx: { width, overflowX: 'hidden' } }}
    >
      {drawerContent}
      <Dialog
        open={advancedDialogOpen}
        onClose={() => setAdvancedDialogOpen(false)}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle>Mais</DialogTitle>
        <DialogContent dividers>
          <List disablePadding>
            {advancedItems.map((item) => {
              const Icon = item.icon;
              const label = getNavLabel(item);
              return (
                <ListItem key={item.key} disablePadding>
                  <ListItemButton
                    component={NavLink}
                    to={item.path}
                    end={item.path === '/'}
                    onClick={handleDialogNavigate}
                    sx={{
                      minHeight: 48,
                      px: 2,
                      '&.active, &[aria-current="page"]': {
                        bgcolor: 'action.selected',
                        '& .MuiListItemIcon-root': { color: 'text.primary' },
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 0, mr: 2 }}>
                      {Icon ? <Icon /> : null}
                    </ListItemIcon>
                    <ListItemText primary={label} primaryTypographyProps={{ noWrap: true }} />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
          <Divider sx={{ my: 2 }} />
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              mb: 1,
            }}
          >
            <Typography variant="overline" color="text.secondary">
              Minhas visoes
            </Typography>
            <Button size="small" onClick={() => handleOpenViewDialog(null)}>
              Criar visao
            </Button>
          </Box>
          <List dense disablePadding>
            {views.length === 0 ? (
              <ListItem>
                <ListItemText primary="Nenhuma visao ainda." />
              </ListItem>
            ) : (
              views.map((view) => (
                <ListItem key={view.id} disablePadding>
                  <ListItemButton
                    component={NavLink}
                    to={`/view/${view.id}`}
                    onClick={handleDialogNavigate}
                    sx={{
                      minHeight: 44,
                      px: 2,
                      '&.active, &[aria-current="page"]': {
                        bgcolor: 'action.selected',
                        '& .MuiListItemIcon-root': { color: 'text.primary' },
                      },
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 0, mr: 2 }}>
                      <ViewList fontSize="small" />
                    </ListItemIcon>
                    <ListItemText primary={view.name} primaryTypographyProps={{ noWrap: true }} />
                  </ListItemButton>
                </ListItem>
              ))
            )}
          </List>
        </DialogContent>
      </Dialog>
      <ViewEditorDialog
        open={viewDialogOpen}
        mode={editingView ? 'edit' : 'create'}
        initialView={editingView}
        onClose={() => setViewDialogOpen(false)}
        onSave={handleSaveView}
      />
      <Menu
        anchorEl={viewMenuAnchor}
        open={Boolean(viewMenuAnchor)}
        onClose={handleCloseViewMenu}
      >
        <MenuItem onClick={handleEditView}>Editar</MenuItem>
        <MenuItem onClick={handleDeleteViewRequest}>Excluir</MenuItem>
      </Menu>
      <ConfirmDialog
        open={Boolean(deleteViewId)}
        title="Excluir visao?"
        description="Esta acao nao pode ser desfeita."
        confirmLabel="Excluir"
        confirmColor="error"
        onConfirm={handleConfirmDeleteView}
        onClose={() => setDeleteViewId(null)}
      />
    </Drawer>
  );
}
