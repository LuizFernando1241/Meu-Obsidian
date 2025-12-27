import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { EXTRA_ROUTES, NAV_ROUTES, type AppRoute } from './app/routes';
import AppShell from './components/AppShell';
import AreasPage from './pages/AreasPage';
import DebugPage from './pages/DebugPage';
import GraphPage from './pages/GraphPage';
import Home from './pages/Home';
import ItemPage from './pages/ItemPage';
import NotesPage from './pages/NotesPage';
import NotFoundPage from './pages/NotFoundPage';
import ProjectsPage from './pages/ProjectsPage';
import SettingsPage from './pages/SettingsPage';
import TagPage from './pages/TagPage';
import TagsIndexPage from './pages/TagsIndexPage';
import TasksPage from './pages/TasksPage';
import TodayPage from './pages/TodayPage';

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
          <Route path={routesByKey.today.path} element={<TodayPage />} />
          <Route path={routesByKey.notes.path} element={<NotesPage />} />
          <Route path={routesByKey.projects.path} element={<ProjectsPage />} />
          <Route path={routesByKey.areas.path} element={<AreasPage />} />
          <Route path={routesByKey.tasks.path} element={<TasksPage />} />
          <Route path={routesByKey.tags.path} element={<TagsIndexPage />} />
          <Route path={routesByKey.graph.path} element={<GraphPage />} />
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
