import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from '@i18n';
import { useAppSelector } from '@store/hooks';
import Modal from './Modal';
import StrategyDetailPanel from '@features/strategies/components/StrategyDetailPanel';
import type {
  StrategyFallbackMode,
  StrategyItem,
  StrategyMetricsSnapshot,
  StrategyPerformanceSnapshot
} from '@features/dashboard/types';
import styles from './StrategyDetailModal.module.css';
import panelStyles from '@features/strategies/components/StrategyDetailPanel.module.css';
import { PERIOD_OPTIONS } from '@features/strategies/components/StrategyDetailPanel';
import StrategyPerformanceModal from '@features/strategies/components/StrategyPerformanceModal';

interface StrategyDetailModalProps {
  open: boolean;
  strategy: StrategyItem | null;
  metrics: StrategyMetricsSnapshot | null;
  performance: StrategyPerformanceSnapshot | null;
  fallbackMode: StrategyFallbackMode;
  onClose: () => void;
  onDelete?: (strategyId: string) => void;
}

function StrategyDetailModal({
  open,
  strategy,
  metrics,
  performance,
  fallbackMode,
  onClose,
  onDelete
}: StrategyDetailModalProps) {
  const { t } = useTranslation();
  const [selectedPeriod, setSelectedPeriod] = useState<string>('day');
  const [headerExpanded, setHeaderExpanded] = useState<boolean>(false);
  const [performanceModalOpen, setPerformanceModalOpen] = useState<boolean>(false);
  const detail = useAppSelector((state) =>
    strategy?.id ? state.strategies.details[strategy.id] ?? null : null
  );
  const handleDelete = useCallback(() => {
    if (!strategy || !onDelete) {
      return;
    }
    const confirmed = window.confirm(
      t('modals.strategy_detail.confirm_delete', { name: strategy.name })
    );
    if (!confirmed) {
      return;
    }
    onDelete(strategy.id);
  }, [onDelete, strategy, t]);

  const headerTitle = useMemo(() => {
    if (!strategy) {
      return t('modals.strategy_detail.title');
    }
    const name = strategy.name ?? '—';
    const primarySymbol = strategy.symbol ?? '—';
    const secondarySymbolRaw =
      detail?.secondarySymbol ?? (detail?.parameters?.symbol2 as string | number | null | undefined);
    const secondarySymbol =
      typeof secondarySymbolRaw === 'string'
        ? secondarySymbolRaw.trim()
        : secondarySymbolRaw !== null && secondarySymbolRaw !== undefined
          ? String(secondarySymbolRaw)
          : '';
    const symbolLabel = secondarySymbol ? `${primarySymbol} / ${secondarySymbol}` : primarySymbol;
    return `${name} - ${symbolLabel}`;
  }, [detail?.parameters, detail?.secondarySymbol, strategy, t]);

  const headerActions = (
    <div className={styles.headerControls}>
      <label className={panelStyles.metaLabel} htmlFor="strategy-detail-period">
        Interval
      </label>
      <select
        id="strategy-detail-period"
        className={panelStyles.rangeSelect}
        value={selectedPeriod}
        onChange={(event) => setSelectedPeriod(event.target.value)}
      >
        {PERIOD_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className={panelStyles.headerToggleButton}
        onClick={() => setPerformanceModalOpen(true)}
      >
        绩效
      </button>
      <button
        type="button"
        className={panelStyles.headerToggleButton}
        onClick={() => setHeaderExpanded((current) => !current)}
      >
        {headerExpanded ? '收起日志' : '展开日志'}
      </button>
      {strategy && onDelete ? (
        <button
          type="button"
          className={styles.deleteButton}
          onClick={handleDelete}
          aria-label={
            strategy
              ? t('modals.strategy_detail.actions.delete_aria', { name: strategy.name })
              : t('modals.strategy_detail.actions.delete_aria_generic')
          }
        >
          {t('modals.strategy_detail.actions.delete')}
        </button>
      ) : null}
    </div>
  );

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={headerTitle}
        size="xl"
        headerActions={headerActions}
      >
        <div className={styles.content}>
          <StrategyDetailPanel
        strategy={strategy}
        metrics={metrics}
        performance={performance}
        fallbackMode={fallbackMode}
        selectedPeriod={selectedPeriod}
        onSelectedPeriodChange={setSelectedPeriod}
        headerExpanded={headerExpanded}
        active={open}
      />
        </div>
      </Modal>
      <StrategyPerformanceModal
        open={performanceModalOpen}
        onClose={() => setPerformanceModalOpen(false)}
        anchorStrategy={strategy}
      />
    </>
  );
}

export default StrategyDetailModal;
