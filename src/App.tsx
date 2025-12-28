import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { EXTRA_ROUTES, NAV_ROUTES, type AppRoute } from './app/routes';
import AppShell from './components/AppShell';
import DebugPage from './pages/DebugPage';
import GraphPage from './pages/GraphPage';
import HelpPage from './pages/HelpPage';
import Home from './pages/Home';
import ItemPage from './pages/ItemPage';
import NotesPage from './pages/NotesPage';
import NotFoundPage from './pages/NotFoundPage';
import OverdueViewPage from './pages/OverdueViewPage';
import QuickNotesPage from './pages/QuickNotesPage';
import RecentPage from './pages/RecentPage';
import SettingsPage from './pages/SettingsPage';
import TagPage from './pages/TagPage';
import TagsIndexPage from './pages/TagsIndexPage';
import TasksViewPage from './pages/TasksViewPage';
import TodayViewPage from './pages/TodayViewPage';

const routesByKey = [...NAV_ROUTES, ...EXTRA_ROUTES].reduce<Record<string, AppRoute>>(
  (acc, route) => {
    acc[route.key] = route;
    return acc;
  },
  {},
);

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route path={routesByKey.home.path} element={<Home />} />
          <Route path={routesByKey.tasks.path} element={<TasksViewPage />} />
          <Route path={routesByKey.today.path} element={<TodayViewPage />} />
          <Route path={routesByKey.overdue.path} element={<OverdueViewPage />} />
          <Route path={routesByKey['quick-notes'].path} element={<QuickNotesPage />} />
          <Route path={routesByKey.recent.path} element={<RecentPage />} />
          <Route path={routesByKey.notes.path} element={<NotesPage />} />
          <Route path={routesByKey.tags.path} element={<TagsIndexPage />} />
          <Route path={routesByKey.graph.path} element={<GraphPage />} />
          <Route path={routesByKey.help.path} element={<HelpPage />} />
          <Route path={routesByKey.tag.path} element={<TagPage />} />
          <Route path={routesByKey.item.path} element={<ItemPage />} />
          <Route path={routesByKey.settings.path} element={<SettingsPage />} />
          <Route path={routesByKey.debug.path} element={<DebugPage />} />
          <Route path={routesByKey['not-found'].path} element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
