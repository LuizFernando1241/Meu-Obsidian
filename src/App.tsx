import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { EXTRA_ROUTES, NAV_ROUTES, type AppRoute } from './app/routes';
import AppShell from './components/AppShell';
import DebugPage from './pages/DebugPage';
import GraphPage from './pages/GraphPage';
import HelpPage from './pages/HelpPage';
import Home from './pages/Home';
import FocusPage from './pages/FocusPage';
import ItemPage from './pages/ItemPage';
import NotesPage from './pages/NotesPage';
import NotFoundPage from './pages/NotFoundPage';
import OverdueViewPage from './pages/OverdueViewPage';
import BacklogPage from './pages/BacklogPage';
import InboxPage from './pages/InboxPage';
import ProjectsPage from './pages/ProjectsPage';
import ReviewPage from './pages/ReviewPage';
import SettingsPage from './pages/SettingsPage';
import TagPage from './pages/TagPage';
import TagsIndexPage from './pages/TagsIndexPage';
import TasksViewPage from './pages/TasksViewPage';
import TodayViewPage from './pages/TodayViewPage';
import TrashPage from './pages/TrashPage';
import ViewPage from './pages/ViewPage';
import WeekPage from './pages/WeekPage';

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
          <Route path={routesByKey.focus.path} element={<FocusPage />} />
          <Route path={routesByKey.review.path} element={<ReviewPage />} />
          <Route path={routesByKey.tasks.path} element={<TasksViewPage />} />
          <Route path={routesByKey.today.path} element={<TodayViewPage />} />
          <Route path={routesByKey.week.path} element={<WeekPage />} />
          <Route path={routesByKey.backlog.path} element={<BacklogPage />} />
          <Route path={routesByKey.inbox.path} element={<InboxPage />} />
          <Route path={routesByKey.projects.path} element={<ProjectsPage />} />
          <Route path={routesByKey.overdue.path} element={<OverdueViewPage />} />
          <Route path={routesByKey.notes.path} element={<NotesPage />} />
          <Route path={routesByKey.trash.path} element={<TrashPage />} />
          <Route path={routesByKey.tags.path} element={<TagsIndexPage />} />
          <Route path={routesByKey.graph.path} element={<GraphPage />} />
          <Route path={routesByKey.help.path} element={<HelpPage />} />
          <Route path={routesByKey.tag.path} element={<TagPage />} />
          <Route path={routesByKey.item.path} element={<ItemPage />} />
          <Route path={routesByKey.view.path} element={<ViewPage />} />
          <Route path={routesByKey.settings.path} element={<SettingsPage />} />
          <Route path={routesByKey.debug.path} element={<DebugPage />} />
          <Route path={routesByKey['not-found'].path} element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
