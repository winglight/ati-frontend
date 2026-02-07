import { lazy } from 'react';
import { useRoutes, RouteObject, Navigate, Outlet, useLocation } from 'react-router-dom';
import RouteError from '@components/layout/RouteError';
import DashboardPage from '@pages/DashboardPage';
import LoginPage from '@pages/LoginPage';
import { useAppSelector } from '@store/hooks';
import { isAnonymousAccessAllowed } from '@store/publicSession';
import LoadingIndicator from '@components/layout/LoadingIndicator';

const OrdersPage = lazy(() => import('@pages/OrdersPage'));
const RiskRulesPage = lazy(() => import('@pages/RiskRulesPage'));
const StrategiesPage = lazy(() => import('@pages/StrategiesPage'));
const SettingsPage = lazy(() => import('@pages/SettingsPage'));
const LogsPage = lazy(() => import('@pages/LogsPage'));
const DocumentationPage = lazy(() => import('@pages/DocumentationPage'));
const PnLCalendarPage = lazy(() => import('@pages/pnl-calendar'));
const ModelOpsWorkbenchPage = lazy(() => import('@pages/ModelOpsWorkbench'));
const NewsWorkbenchPage = lazy(() => import('@pages/NewsWorkbench'));
const NewsLlmTradeConfigPage = lazy(() => import('@pages/NewsLlmTrade/ConfigPage'));
const NewsLlmTradeNewsPage = lazy(() => import('@pages/NewsLlmTrade/NewsListPage'));
const NewsLlmTradeLogsPage = lazy(() => import('@pages/NewsLlmTrade/LlmLogsPage'));
const NewsLlmTradeSignalsPage = lazy(() => import('@pages/NewsLlmTrade/TradeSignalsPage'));

const enableTestRoutes = import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_ROUTES === 'true';

const testRoutes: RouteObject[] = [];

if (enableTestRoutes) {
  const StrategyDetailE2EPage = lazy(() => import('@pages/__tests__/StrategyDetailE2EPage'));
  testRoutes.push({
    path: '/__test__/strategy-detail',
    element: <StrategyDetailE2EPage />,
    errorElement: <RouteError />
  });
}

function RequireAuthLayout() {
  const location = useLocation();
  const authStatus = useAppSelector((state) => state.auth.status);
  const authToken = useAppSelector((state) => state.auth.token);
  const allowAnonymous = isAnonymousAccessAllowed();
  const isAuthenticated = allowAnonymous || (authStatus === 'authenticated' && Boolean(authToken));

  if (authStatus === 'loading') {
    return <LoadingIndicator message="正在检查登录状态..." />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}

const baseRoutes: RouteObject[] = [
  {
    path: '/',
    element: <DashboardPage />,
    errorElement: <RouteError />
  },
  {
    path: '/orders',
    element: <OrdersPage />,
    errorElement: <RouteError />
  },
  {
    path: '/risk-rules',
    element: <RiskRulesPage />,
    errorElement: <RouteError />
  },
  {
    path: '/strategies',
    element: <StrategiesPage />,
    errorElement: <RouteError />
  },
  {
    path: '/model-ops',
    element: <ModelOpsWorkbenchPage />,
    errorElement: <RouteError />
  },
  {
    path: '/news-workbench',
    element: <NewsWorkbenchPage />,
    errorElement: <RouteError />
  },
  {
    path: '/news-llm-trade',
    element: <Navigate to="/news-llm-trade/config" replace />,
    errorElement: <RouteError />
  },
  {
    path: '/news-llm-trade/config',
    element: <NewsLlmTradeConfigPage />,
    errorElement: <RouteError />
  },
  {
    path: '/news-llm-trade/news',
    element: <NewsLlmTradeNewsPage />,
    errorElement: <RouteError />
  },
  {
    path: '/news-llm-trade/logs',
    element: <NewsLlmTradeLogsPage />,
    errorElement: <RouteError />
  },
  {
    path: '/news-llm-trade/signals',
    element: <NewsLlmTradeSignalsPage />,
    errorElement: <RouteError />
  },
  {
    path: '/settings',
    element: <SettingsPage />,
    errorElement: <RouteError />
  },
  {
    path: '/logs',
    element: <LogsPage />,
    errorElement: <RouteError />
  },
  {
    path: '/pnl-calendar',
    element: <PnLCalendarPage />,
    errorElement: <RouteError />
  },
  {
    path: '/docs',
    element: <DocumentationPage />,
    errorElement: <RouteError />
  }
  
];

const routes: RouteObject[] = [
  {
    path: '/login',
    element: <LoginPage />,
    errorElement: <RouteError />
  },
  {
    element: <RequireAuthLayout />,
    children: [...baseRoutes, ...testRoutes]
  },
  {
    path: '*',
    element: <RouteError status={404} />
  }
];

export const appRoutes = routes;

export function useAppRoutes() {
  return useRoutes(routes);
}

export default useAppRoutes;
