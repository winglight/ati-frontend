import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useStore } from 'react-redux';
import PageHeader from './components/PageHeader';
import LoadingIndicator from '@components/layout/LoadingIndicator';
import RouteError from '@components/layout/RouteError';
import styles from './PageLayout.module.css';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { loadRiskOverview } from '@store/thunks/loadRiskOverview';
import RiskRulesPanel from '@features/dashboard/components/RiskRulesPanel';
import RiskMetricsPanel from '@features/risk/components/RiskMetricsPanel';
import RiskEventsPanel from '@features/risk/components/RiskEventsPanel';
import type { RootState } from '@store/index';
import { RiskRealtimeClient } from '@services/riskRealtime';
import RiskRuleDetailModal from '@components/modals/RiskRuleDetailModal';
import RiskRuleEditorModal, { type RiskRuleEditorContext } from '@components/modals/RiskRuleEditorModal';
import type { RiskRuleItem } from '@features/dashboard/types';
import { saveRiskRule, type SaveRiskRuleArgs } from '@store/thunks/riskRules';
import { resetRiskRuleSave } from '@store/slices/riskSlice';
import type { UpsertRiskRuleInput } from '@services/riskApi';
import { computeRiskTargets } from '../utils/riskDefaults';
import { toUpsertInputFromRule } from '../utils/riskRules';

function RiskRulesPage() {
  const { t } = useTranslation();
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const token = useAppSelector((state) => state.auth.token);
  const rules = useAppSelector((state) => state.risk.rules);
  const positions = useAppSelector((state) => state.account.positions);
  const riskState = useAppSelector((state) => state.risk);
  const metrics = riskState.metrics;
  const events = riskState.events;
  const status = riskState.status;
  const error = riskState.error;
  const fallbackMode = riskState.fallbackMode;

  const realtimeRef = useRef<RiskRealtimeClient | null>(null);
  const [inspectedRule, setInspectedRule] = useState<RiskRuleItem | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<RiskRuleItem | null>(null);
  const [ruleDraft, setRuleDraft] = useState<Partial<UpsertRiskRuleInput> | null>(null);
  const [ruleContext, setRuleContext] = useState<RiskRuleEditorContext | null>(null);

  useEffect(() => {
    if (!token || status !== 'idle') {
      return;
    }
    void dispatch(loadRiskOverview());
  }, [dispatch, status, token]);

  useEffect(() => {
    if (!editorOpen) {
      return;
    }
    if (riskState.saveStatus === 'succeeded') {
      setEditorOpen(false);
      setEditingRule(null);
      setRuleDraft(null);
      setRuleContext(null);
      dispatch(resetRiskRuleSave());
    }
  }, [dispatch, editorOpen, riskState.saveStatus]);

  useEffect(() => {
    if (!token) {
      return;
    }
    const client = new RiskRealtimeClient({
      dispatch,
      tokenProvider: () => store.getState().auth.token
    });
    realtimeRef.current = client;
    void client.connect();
    return () => {
      realtimeRef.current = null;
      void client.disconnect();
    };
  }, [dispatch, store, token]);

  if (status === 'loading' && rules.length === 0) {
    return <LoadingIndicator message={t('risk_rules.loading')} />;
  }

  if (status === 'failed' && error) {
    return <RouteError status={500} message={error} />;
  }

  const buildContext = (symbol: string | null | undefined): RiskRuleEditorContext | null => {
    if (!symbol) {
      return null;
    }
    const position = positions.find((item) => item.symbol === symbol);
    if (!position) {
      return null;
    }
    const computed = computeRiskTargets({
      symbol: position.symbol,
      avgPrice: position.avgPrice,
      direction: position.direction
    });
    return {
      symbol: position.symbol,
      basePrice: position.avgPrice,
      quantity: position.quantity,
      direction: position.direction,
      multiplier: position.multiplier ?? null,
      leverage: computed?.leverage ?? null,
      recommended: computed
        ? {
            stopLossPrice: computed.stopLossPrice,
            takeProfitPrice: computed.takeProfitPrice,
            stopLossOffset: computed.stopLossOffset,
            takeProfitOffset: computed.takeProfitOffset,
            stopLossRatio: computed.stopLossRatio,
            takeProfitRatio: computed.takeProfitRatio
          }
        : null
    };
  };

  const handleCreateRule = () => {
    dispatch(resetRiskRuleSave());
    setEditingRule(null);
    setRuleDraft(null);
    setRuleContext(null);
    setEditorOpen(true);
  };

  const handleEditRule = (rule: RiskRuleItem) => {
    dispatch(resetRiskRuleSave());
    setEditingRule(rule);
    setRuleDraft(null);
    setRuleContext(buildContext(rule.symbol));
    setEditorOpen(true);
  };

  const handleCloseEditor = () => {
    setEditorOpen(false);
    setEditingRule(null);
    setRuleDraft(null);
    setRuleContext(null);
    dispatch(resetRiskRuleSave());
  };

  const handleToggleRule = (rule: RiskRuleItem) => {
    dispatch(resetRiskRuleSave());
    const payload = toUpsertInputFromRule(rule, { enabled: !rule.enabled });
    void dispatch(saveRiskRule(payload));
  };

  const handleSubmitRule = (payload: SaveRiskRuleArgs) => {
    void dispatch(saveRiskRule(payload));
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title={t('risk_rules.page.title')}
        description={t('risk_rules.page.description')}
        actions={[
          { label: t('risk_rules.actions.add_rule'), variant: 'primary', onClick: handleCreateRule },
          { label: t('risk_rules.actions.bulk_import'), variant: 'outline' }
        ]}
      />
      <div className={styles.gridTwoColumn}>
        <div className={styles.column}>
          <RiskMetricsPanel metrics={metrics} fallbackMode={fallbackMode} />
          <RiskRulesPanel
            rules={rules}
            onViewRule={setInspectedRule}
            onEditRule={handleEditRule}
            onToggleRule={handleToggleRule}
          />
        </div>
        <div className={styles.column}>
          <RiskEventsPanel events={events} />
        </div>
      </div>
      <RiskRuleDetailModal open={Boolean(inspectedRule)} rule={inspectedRule} onClose={() => setInspectedRule(null)} />
      <RiskRuleEditorModal
        open={editorOpen}
        rule={editingRule}
        defaults={ruleDraft}
        context={ruleContext}
        submitting={riskState.saveStatus === 'loading'}
        error={riskState.saveError ?? null}
        onSubmit={handleSubmitRule}
        onClose={handleCloseEditor}
      />
    </div>
  );
}

export default RiskRulesPage;
