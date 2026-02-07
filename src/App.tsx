import { Suspense, useEffect } from 'react';
import { useAppRoutes } from '@router';
import AppShell from '@components/layout/AppShell';
import LoadingIndicator from '@components/layout/LoadingIndicator';
import { useTranslation } from 'react-i18next';
import AnalyticsTracker from '@components/AnalyticsTracker';
import { initGA } from './utils/analytics';
import { useAppDispatch } from '@store/hooks';
import { loadStoredSession } from '@store/thunks/auth';

function App() {
  const element = useAppRoutes();
  const { t } = useTranslation();
  const dispatch = useAppDispatch();

  useEffect(() => {
    initGA();
  }, []);

  useEffect(() => {
    void dispatch(loadStoredSession());
  }, [dispatch]);

  return (
    <AppShell>
      <AnalyticsTracker />
      <Suspense fallback={<LoadingIndicator message={t('common.loading_app')} />}> 
        {element}
      </Suspense>
    </AppShell>
  );
}

export default App;
