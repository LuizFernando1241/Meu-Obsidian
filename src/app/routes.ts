import type { SvgIconComponent } from '@mui/icons-material';
import {
  CheckBoxOutlined,
  DeleteOutline,
  EventBusyOutlined,
  FactCheckOutlined,
  HelpOutline,
  HomeOutlined,
  HubOutlined,
  LocalOfferOutlined,
  NoteOutlined,
  SettingsOutlined,
  TodayOutlined,
} from '@mui/icons-material';

export type AppRoute = {
  key: string;
  label: string;
  path: string;
  icon?: SvgIconComponent;
  showInNav?: boolean;
};

export const NAV_ROUTES: AppRoute[] = [
  { key: 'home', label: 'Home', path: '/', icon: HomeOutlined, showInNav: true },
  { key: 'review', label: 'Revisao', path: '/review', icon: FactCheckOutlined, showInNav: true },
  { key: 'tasks', label: 'Tarefas', path: '/tasks', icon: CheckBoxOutlined, showInNav: true },
  { key: 'today', label: 'Hoje', path: '/today', icon: TodayOutlined, showInNav: true },
  { key: 'overdue', label: 'Atrasadas', path: '/overdue', icon: EventBusyOutlined, showInNav: true },
  { key: 'notes', label: 'Notas', path: '/notes', icon: NoteOutlined, showInNav: true },
  { key: 'trash', label: 'Lixeira', path: '/trash', icon: DeleteOutline, showInNav: true },
  { key: 'tags', label: 'Tags', path: '/tags', icon: LocalOfferOutlined, showInNav: true },
  { key: 'graph', label: 'Grafo', path: '/graph', icon: HubOutlined, showInNav: true },
  {
    key: 'help',
    label: 'Ajuda / Atalhos',
    path: '/help',
    icon: HelpOutline,
    showInNav: true,
  },
  {
    key: 'settings',
    label: 'Configuracoes',
    path: '/settings',
    icon: SettingsOutlined,
    showInNav: true,
  },
];

export const EXTRA_ROUTES: AppRoute[] = [
  { key: 'debug', label: 'Debug', path: '/debug', showInNav: false },
  { key: 'tag', label: 'Tag', path: '/tags/:tag', showInNav: false },
  { key: 'item', label: 'Item', path: '/item/:id', showInNav: false },
  { key: 'view', label: 'View', path: '/view/:id', showInNav: false },
  { key: 'not-found', label: 'Nao encontrado', path: '*', showInNav: false },
];

const ROUTES_BY_KEY = [...NAV_ROUTES, ...EXTRA_ROUTES].reduce<Record<string, AppRoute>>(
  (acc, route) => {
    acc[route.key] = route;
    return acc;
  },
  {},
);

const safeDecode = (value: string) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

export const getRouteLabelByPathname = (pathname: string) => {
  const normalized = pathname.split('?')[0].split('#')[0] || '/';

  if (normalized === '/' || normalized === '') {
    return ROUTES_BY_KEY.home?.label ?? 'Home';
  }

  const segments = normalized.split('/').filter(Boolean);
  const [first, second] = segments;

  if (first === 'tags') {
    if (second) {
      return `${ROUTES_BY_KEY.tags?.label ?? 'Tags'} / ${safeDecode(second)}`;
    }
    return ROUTES_BY_KEY.tags?.label ?? 'Tags';
  }

  if (first === 'item') {
    return ROUTES_BY_KEY.item?.label ?? 'Item';
  }

  if (first === 'view') {
    return ROUTES_BY_KEY.view?.label ?? 'View';
  }

  if (first === 'debug') {
    return ROUTES_BY_KEY.debug?.label ?? 'Debug';
  }

  const navMatch = NAV_ROUTES.find((route) => route.path === `/${first}`);
  if (navMatch) {
    return navMatch.label;
  }

  return ROUTES_BY_KEY['not-found']?.label ?? 'Nao encontrado';
};
