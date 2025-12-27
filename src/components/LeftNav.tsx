import {
  Box,
  Divider,
  Drawer,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Toolbar,
  Typography,
} from '@mui/material';
import {
  ChevronLeft,
  ChevronRight,
} from '@mui/icons-material';
import { NavLink } from 'react-router-dom';

import { NAV_ROUTES } from '../app/routes';
import VaultExplorer from './VaultExplorer';

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

export default function LeftNav({
  isMobile,
  open,
  onClose,
  collapsed,
  onToggleCollapse,
  drawerWidth,
  collapsedWidth,
}: LeftNavProps) {
  const width = collapsed ? collapsedWidth : drawerWidth;

  const handleNavigate = () => {
    if (isMobile) {
      onClose();
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
    </Drawer>
  );
}
