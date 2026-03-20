import { createHashRouter } from 'react-router-dom';
import { AppLayout } from './AppLayout';
import { HistoryPage } from '../features/history/pages/HistoryPage';
import { NewTestSessionPage } from '../features/sessions/pages/NewTestSessionPage';
import { SessionDetailPage } from '../features/sessions/pages/SessionDetailPage';
import { WorkflowRunnerPage } from '../features/workflow/pages/WorkflowRunnerPage';
import { DashboardPage } from '../features/dashboard/pages/DashboardPage';

export const appRouter = createHashRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <WorkflowRunnerPage />,
      },
      {
        path: 'history',
        element: <HistoryPage />,
      },
      {
        path: 'sessions/new',
        element: <NewTestSessionPage />,
      },
      {
        path: 'sessions/:sessionId',
        element: <SessionDetailPage />,
      },
      {
        path: 'runner',
        element: <WorkflowRunnerPage />,
      },
      {
        path: 'dashboard',
        element: <DashboardPage />,
      },
    ],
  },
]);
