import {
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  ListItem,
  Menu,
  MenuItem,
  Tooltip,
  Toolbar,
  Typography,
} from '@mui/material';
import {
  Add,
  ChevronLeft,
  ChevronRight,
  MoreVert,
  ViewList,
} from '@mui/icons-material';
import { useLiveQuery } from 'dexie-react-hooks';
import { NavLink } from 'react-router-dom';

import { GIT_SHA } from '../app/buildInfo';
import { NAV_ROUTES } from '../app/routes';
import { db } from '../data/db';
import { deleteView, upsertView } from '../data/repo';
import type { SavedView } from '../data/types';
import VaultExplorer from './VaultExplorer';
import ConfirmDialog from './ConfirmDialog';
import { useNotifier } from './Notifier';
import ViewEditorDialog from './dialogs/ViewEditorDialog';

type LeftNavProps = {
  isMobile: boolean;
  open: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  drawerWidth: number;
  collapsedWidth: number;
};

const navItems = NAV_ROUTES.filter((route) => route.showInNav !== false);
const versionLabel = `v-${GIT_SHA}`;

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
  const views = useLiveQuery(() => db.views.orderBy('updatedAt').reverse().toArray(), []) ?? [];
  const viewsById = React.useMemo(
    () => new Map(views.map((view) => [view.id, view])),
    [views],
  );
  const [viewDialogOpen, setViewDialogOpen] = React.useState(false);
  const [editingView, setEditingView] = React.useState<SavedView | null>(null);
  const [viewMenuAnchor, setViewMenuAnchor] = React.useState<null | HTMLElement>(null);
  const [viewMenuId, setViewMenuId] = React.useState<string | null>(null);
  const [deleteViewId, setDeleteViewId] = React.useState<string | null>(null);

  const handleNavigate = () => {
    if (isMobile) {
      onClose();
    }
  };

  const handleOpenViewDialog = (view?: SavedView | null) => {
    setEditingView(view ?? null);
    setViewDialogOpen(true);
  };

  const handleSaveView = async (view: SavedView) => {
    try {
      await upsertView(view);
      notifier.success(editingView ? 'View atualizada' : 'View criada');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao salvar view: ${message}`);
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
      notifier.success('View excluida');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      notifier.error(`Erro ao excluir view: ${message}`);
    } finally {
      setDeleteViewId(null);
    }
  };

  const drawerContent = (
    <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Toolbar />
      <Box sx={{ flexGrow: 1, overflowY: 'auto' }}>
        {!collapsed && (
          <VaultExplorer isMobile={isMobile} onNavigate={handleNavigate} />
        )}
        <Divider />
        <List>
          {!collapsed && (
            <Typography
              variant="overline"
              sx={{ px: 2.5, py: 1, display: 'block', color: 'text.secondary' }}
            >
              Views
            </Typography>
          )}
          {navItems.map((item) => {
            const Icon = item.icon;
            const button = (
              <ListItemButton
                key={item.key}
                component={NavLink}
                to={item.path}
                end={item.path === '/'}
                onClick={handleNavigate}
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
                  primary={item.label}
                  primaryTypographyProps={{ noWrap: true }}
                  sx={{ opacity: collapsed ? 0 : 1 }}
                />
              </ListItemButton>
            );

            return collapsed ? (
              <Tooltip key={item.key} title={item.label} placement="right">
                {button}
              </Tooltip>
            ) : (
              button
            );
          })}
        </List>
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
                Minhas Views
              </Typography>
              <IconButton
                size="small"
                aria-label="Nova view"
                onClick={() => handleOpenViewDialog(null)}
              >
                <Add fontSize="small" />
              </IconButton>
            </Box>
            <List dense disablePadding>
              {views.length === 0 ? (
                <ListItem>
                  <ListItemText primary="Nenhuma view ainda." />
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
        title="Excluir view?"
        description="Esta acao nao pode ser desfeita."
        confirmLabel="Excluir"
        confirmColor="error"
        onConfirm={handleConfirmDeleteView}
        onClose={() => setDeleteViewId(null)}
      />
    </Drawer>
  );
}
