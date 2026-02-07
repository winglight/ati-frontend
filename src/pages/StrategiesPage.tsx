import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'react-redux';
import LoadingIndicator from '@components/layout/LoadingIndicator';
import RouteError from '@components/layout/RouteError';
import StrategyDetailPanel from '@features/strategies/components/StrategyDetailPanel';
import StrategyListCard from '@features/strategies/components/StrategyListCard';
import StrategyEditorModal from '@components/modals/StrategyEditorModal';
import { StrategyRealtimeClient } from '@services/strategyRealtime';
import useOrdersRealtime from '../hooks/useOrdersRealtime';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import type { RootState } from '@store/index';
import {
  loadStrategies,
  loadStrategyMetrics,
  loadStrategyPerformanceSummary,
  loadStrategyTemplates,
  loadStrategyFiles,
  startStrategy,
  stopStrategy,
  createStrategy,
  updateStrategy,
  type SaveStrategyArgs
} from '@store/thunks/strategies';
import { resetStrategySave, selectStrategy } from '@store/slices/strategiesSlice';
import type { StrategyItem, StrategyPerformanceSnapshot } from '@features/dashboard/types';
import PageHeader from './components/PageHeader';
import headerStyles from './components/PageHeader.module.css';
import { DOM_KEYWORDS, KLINE_KEYWORDS, SCREENER_KEYWORDS, includesKeyword } from '@features/strategies/components/strategyKeywords';
import styles from './PageLayout.module.css';

function StrategiesPage() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();

  const strategies = useAppSelector((state) => state.strategies.items);
  const status = useAppSelector((state) => state.strategies.status);
  const error = useAppSelector((state) => state.strategies.error);
  const selectedId = useAppSelector((state) => state.strategies.selectedId);
  const metricsMap = useAppSelector((state) => state.strategies.metrics);
  const performanceState = useAppSelector((state) => state.strategies.performance);
  const operations = useAppSelector((state) => state.strategies.operations);
  const operationErrors = useAppSelector((state) => state.strategies.operationErrors);
  const fallbackMode = useAppSelector((state) => state.strategies.fallbackMode);
  const strategyTemplates = useAppSelector((state) => state.strategies.templates);
  const templatesStatus = useAppSelector((state) => state.strategies.templatesStatus);
  const strategyFiles = useAppSelector((state) => state.strategies.files);
  const filesStatus = useAppSelector((state) => state.strategies.filesStatus);
  const strategySaveStatus = useAppSelector((state) => state.strategies.saveStatus);
  const strategySaveError = useAppSelector((state) => state.strategies.saveError ?? null);
  const token = useAppSelector((state) => state.auth.token);
  const realtimeClientId = useAppSelector((state) => state.realtime.clientId ?? null);

  const realtimeRef = useRef<StrategyRealtimeClient | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<StrategyItem | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<'__ALL__' | 'DOM' | 'Bar' | 'AI' | 'Screener'>('__ALL__');

  const performanceMap = useMemo<Record<string, StrategyPerformanceSnapshot | null>>(() => {
    const result: Record<string, StrategyPerformanceSnapshot | null> = {};
    for (const [id, periods] of Object.entries(performanceState)) {
      if (!periods) {
        result[id] = null;
        continue;
      }
      const preferred = periods['day'] ?? Object.values(periods).find((snapshot) => snapshot) ?? null;
      result[id] = preferred ?? null;
    }
    return result;
  }, [performanceState]);

  useEffect(() => {
    if (status === 'idle' && token) {
      void dispatch(loadStrategies());
    }
  }, [dispatch, status, token]);

  const sortedStrategies = useMemo(() => {
    const priority: Partial<Record<StrategyItem['status'], number>> = {
      running: 0,
      starting: 1,
      stopped: 2,
      error: 3
    };

    return [...strategies].sort((a, b) => {
      const priorityA = priority[a.status] ?? Number.POSITIVE_INFINITY;
      const priorityB = priority[b.status] ?? Number.POSITIVE_INFINITY;

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      return a.name.localeCompare(b.name);
    });
  }, [strategies]);

  const resolveStrategyKind = (strategy: StrategyItem): 'DOM' | 'Bar' | 'AI' | 'Screener' | null => {
    if (typeof strategy.isKlineStrategy === 'boolean') {
      return strategy.isKlineStrategy ? 'Bar' : 'DOM';
    }
    const candidates: string[] = [];
    if (typeof strategy.templateId === 'string') candidates.push(strategy.templateId);
    if (typeof strategy.dataSource === 'string') candidates.push(strategy.dataSource);
    if (typeof strategy.filePath === 'string') candidates.push(strategy.filePath);
    if (Array.isArray(strategy.tags)) {
      candidates.push(
        ...strategy.tags.filter((tag): tag is string => typeof tag === 'string' && !!tag.trim())
      );
    }
    for (const raw of candidates) {
      const normalized = raw.trim().toLowerCase();
      if (!normalized) continue;
      if (includesKeyword(normalized, DOM_KEYWORDS)) return 'DOM';
      if (includesKeyword(normalized, KLINE_KEYWORDS)) return 'Bar';
      if (includesKeyword(normalized, SCREENER_KEYWORDS)) return 'Screener';
      if (normalized.includes('ai') || normalized.includes('ml') || normalized.includes('model')) return 'AI';
    }
    return null;
  };

  const isScreenerStrategy = (strategy: StrategyItem | null): boolean => {
    if (!strategy) {
      return false;
    }
    if (strategy.templateId?.toLowerCase() === 'screener') {
      return true;
    }
    if (strategy.screenerProfile) {
      return true;
    }
    return resolveStrategyKind(strategy) === 'Screener';
  };

  const visibleStrategies = useMemo(() => {
    if (selectedFilter === '__ALL__') {
      return sortedStrategies;
    }
    return sortedStrategies.filter((s) => resolveStrategyKind(s) === selectedFilter);
  }, [sortedStrategies, selectedFilter]);

  useEffect(() => {
    if (sortedStrategies.length > 0 && !selectedId) {
      dispatch(selectStrategy(sortedStrategies[0].id));
    }
  }, [dispatch, selectedId, sortedStrategies]);

  // 移除父页面对选中策略的摘要与指标的自动加载，统一由详情面板按需加载

  useEffect(() => {
    if (!token) {
      return;
    }
    if (realtimeRef.current || realtimeClientId) {
      return;
    }
    const client = new StrategyRealtimeClient({
      dispatch,
      tokenProvider: () => store.getState().auth.token,
      stateProvider: () => store.getState()
    });
    realtimeRef.current = client;
    void client.connect();
    return () => {
      if (realtimeRef.current === client) {
        realtimeRef.current = null;
      }
      void client.disconnect();
    };
  }, [dispatch, store, token, realtimeClientId]);

  useEffect(() => {
    if (!editorOpen) {
      return;
    }
    if (templatesStatus === 'idle') {
      void dispatch(loadStrategyTemplates());
    }
  }, [dispatch, editorOpen, templatesStatus]);

  useEffect(() => {
    if (!editorOpen) {
      return;
    }
    if (filesStatus === 'idle') {
      void dispatch(loadStrategyFiles());
    }
  }, [dispatch, editorOpen, filesStatus]);

  useEffect(() => {
    if (!editorOpen) {
      return;
    }
    if (strategySaveStatus === 'succeeded') {
      setEditorOpen(false);
      setEditingStrategy(null);
      dispatch(resetStrategySave());
      void dispatch(loadStrategies());
    }
  }, [dispatch, editorOpen, strategySaveStatus]);

  const selectedStrategy = useMemo(
    () => strategies.find((strategy) => strategy.id === selectedId) ?? null,
    [strategies, selectedId]
  );

  useOrdersRealtime({ enabled: true });

  const editorStrategy = useMemo(() => {
    if (!editingStrategy) {
      return null;
    }
    return strategies.find((strategy) => strategy.id === editingStrategy.id) ?? editingStrategy;
  }, [editingStrategy, strategies]);

  const selectedMetrics = selectedId
    ? metricsMap[selectedId] ?? selectedStrategy?.metricsSnapshot ?? null
    : null;
  const selectedPerformance = selectedId
    ? performanceMap[selectedId] ?? selectedStrategy?.performanceSnapshot ?? null
    : null;

  if ((status === 'loading' && strategies.length === 0) || (status === 'idle' && !token)) {
    return <LoadingIndicator message={t('strategies.loading')} />;
  }

  if (status === 'failed') {
    return <RouteError status={500} message={error ?? t('strategies.error_load_failed')} />;
  }

  const handleOpenCreate = () => {
    dispatch(resetStrategySave());
    setEditingStrategy(null);
    setEditorOpen(true);
  };

  const handleOpenEdit = (strategyId?: string) => {
    const strategyToEdit =
      (strategyId ? strategies.find((strategy) => strategy.id === strategyId) ?? null : null) ??
      selectedStrategy;

    if (!strategyToEdit) {
      return;
    }
    dispatch(resetStrategySave());
    setEditingStrategy(strategyToEdit);
    setEditorOpen(true);
  };

  const handleCloseEditor = () => {
    setEditorOpen(false);
    setEditingStrategy(null);
    dispatch(resetStrategySave());
  };

  const handleSubmitStrategy = (payload: SaveStrategyArgs) => {
    if (payload.id) {
      void dispatch(updateStrategy(payload));
    } else {
      void dispatch(createStrategy(payload));
    }
  };

  const handleRefreshStrategyTemplates = () => {
    void dispatch(loadStrategyTemplates());
  };

  const handleRefreshStrategyFiles = () => {
    void dispatch(loadStrategyFiles());
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('strategies.page.title')}
        description={t('strategies.page.description')}
        headerMeta={
          <div>
            <button
              type="button"
              className={`${headerStyles.tag} ${selectedFilter === '__ALL__' ? headerStyles.tagSelected : ''}`}
              onClick={() => setSelectedFilter('__ALL__')}
            >
              {t('strategies.filters.all')}
            </button>
            {['DOM', 'Bar', 'AI', 'Screener'].map((label) => (
              <button
                key={label}
                type="button"
                className={`${headerStyles.tag} ${selectedFilter === (label as 'DOM' | 'Bar' | 'AI' | 'Screener') ? headerStyles.tagSelected : ''}`}
                onClick={() => setSelectedFilter(label as 'DOM' | 'Bar' | 'AI' | 'Screener')}
              >
                {label}
              </button>
            ))}
          </div>
        }
        actions={[
          {
            label: t('strategies.actions.add'),
            variant: 'primary',
            onClick: handleOpenCreate
          },
          {
            label: t('strategies.actions.edit_current'),
            variant: 'outline',
            onClick: handleOpenEdit,
            disabled: !selectedStrategy
          },
          {
            label: t('strategies.actions.refresh_list'),
            variant: 'primary',
            onClick: () => {
              void dispatch(loadStrategies());
            }
          },
          {
            label: t('strategies.actions.reload_metrics'),
            variant: 'outline',
            disabled: !selectedId || isScreenerStrategy(selectedStrategy),
            onClick: () => {
              if (!selectedId || isScreenerStrategy(selectedStrategy)) {
                return;
              }
              void dispatch(loadStrategyPerformanceSummary({ strategyId: selectedId, period: 'day', page: 1, pageSize: 10 }));
              void dispatch(loadStrategyMetrics({ strategyId: selectedId, period: 'day' }));
            }
          }
        ]}
      />
      <div className={styles.gridTwoColumn}>
        <StrategyListCard
          strategies={visibleStrategies}
          selectedId={selectedId}
          operations={operations}
          operationErrors={operationErrors}
          metricsById={metricsMap}
          performanceById={performanceMap}
          onSelect={(id) => dispatch(selectStrategy(id))}
          onStart={(id) => {
            void dispatch(startStrategy({ strategyId: id }));
          }}
          onStop={(id) => {
            void dispatch(stopStrategy({ strategyId: id }));
          }}
          onEdit={handleOpenEdit}
        />
        <StrategyDetailPanel
          strategy={selectedStrategy}
          metrics={selectedMetrics}
          performance={selectedPerformance}
          fallbackMode={fallbackMode}
          active={false}
        />
      </div>
      <StrategyEditorModal
        open={editorOpen}
        strategy={editorStrategy}
        templates={strategyTemplates}
        templatesLoading={templatesStatus === 'loading'}
        files={strategyFiles}
        filesLoading={filesStatus === 'loading'}
        submitting={strategySaveStatus === 'loading'}
        error={strategySaveError}
        onRefreshTemplates={handleRefreshStrategyTemplates}
        onRefreshFiles={handleRefreshStrategyFiles}
        onSubmit={handleSubmitStrategy}
        onClose={handleCloseEditor}
      />
    </div>
  );
}

export default StrategiesPage;
