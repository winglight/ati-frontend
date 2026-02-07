import clsx from 'clsx';
import PanelCard, { PanelAction } from './PanelCard';
import { useTranslation } from '@i18n';
import styles from './RiskRulesPanel.module.css';
import type { RiskRuleItem } from '../types';

interface RiskRulesPanelProps {
  rules: RiskRuleItem[];
  onViewRule: (rule: RiskRuleItem) => void;
  onEditRule?: (rule: RiskRuleItem) => void;
  onToggleRule?: (rule: RiskRuleItem) => void;
  onRefresh?: () => void;
}

const formatNumber = (value?: number | null, digits = 2): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }
  return value.toFixed(digits);
};

const formatPercent = (value?: number | null): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '-';
  }
  return `${(value * 100).toFixed(1)}%`;
};

const formatPositionLimit = (limit: RiskRuleItem['positionLimit']): string => {
  if (!limit) {
    return '-';
  }
  const parts: string[] = [];
  if (typeof limit.maxNet === 'number') {
    parts.push(`净 ${limit.maxNet}`);
  }
  if (typeof limit.maxLong === 'number') {
    parts.push(`多 ${limit.maxLong}`);
  }
  if (typeof limit.maxShort === 'number') {
    parts.push(`空 ${limit.maxShort}`);
  }
  return parts.length ? parts.join(' / ') : '-';
};

const formatLastEvent = (timestamp?: string | null): string => {
  if (!timestamp) {
    return '—';
  }
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString();
};

const formatRuleTypeLabel = (rule: RiskRuleItem): string => {
  if (rule.type === 'atr_trailing') {
    return 'ATR 跟踪';
  }
  return rule.type === 'trailing' ? '价格跟踪' : '固定';
};

function RiskRulesPanel({ rules, onViewRule, onEditRule, onToggleRule, onRefresh }: RiskRulesPanelProps) {
  const { t } = useTranslation();
  const actions: PanelAction[] = [onRefresh ? { label: t('dashboard.risk_rules.actions.refresh'), onClick: onRefresh } : null].filter(Boolean) as PanelAction[];

  return (
    <PanelCard title={t('dashboard.risk_rules.title')} actions={actions}>
      <div className={styles.tableScroller}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t('dashboard.risk_rules.columns.symbol')}</th>
              <th>{t('dashboard.risk_rules.columns.status')}</th>
              <th>{t('dashboard.risk_rules.columns.type')}</th>
              <th>{t('dashboard.risk_rules.columns.position_limit')}</th>
              <th>{t('dashboard.risk_rules.columns.stop_loss_offset')}</th>
              <th>{t('dashboard.risk_rules.columns.take_profit_offset')}</th>
              <th>{t('dashboard.risk_rules.columns.trailing_params')}</th>
              <th>{t('dashboard.risk_rules.columns.latest_event')}</th>
              <th>{t('dashboard.risk_rules.columns.events_count')}</th>
              <th>{t('dashboard.risk_rules.columns.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td>
                  <button type="button" className={styles.ruleButton} onClick={() => onViewRule(rule)}>
                    {rule.symbol ?? t('dashboard.risk_rules.global')}
                  </button>
                </td>
                <td className={rule.enabled ? styles.enabled : styles.disabled}>
                  {rule.enabled ? t('dashboard.risk_rules.status.enabled') : t('dashboard.risk_rules.status.disabled')}
                </td>
                <td>{formatRuleTypeLabel(rule)}</td>
                <td>{formatPositionLimit(rule.positionLimit)}</td>
                <td>{formatNumber(rule.stopLossOffset)}</td>
                <td>{formatNumber(rule.takeProfitOffset)}</td>
                <td>
                  {rule.type === 'trailing'
                    ? [formatNumber(rule.trailingDistance), formatPercent(rule.trailingPercent)]
                        .filter((value) => value !== '-')
                        .join(' / ') || '—'
                    : rule.type === 'atr_trailing'
                      ? [
                          formatNumber(rule.trailingDistance),
                          formatPercent(rule.trailingPercent),
                          rule.atrMultiplier != null && !Number.isNaN(rule.atrMultiplier)
                            ? `ATR×${formatNumber(rule.atrMultiplier)}`
                            : '-' 
                        ]
                          .filter((value) => value && value !== '-')
                          .join(' / ') || '—'
                      : '—'}
                </td>
                <td>{formatLastEvent(rule.metrics?.lastEventAt)}</td>
                <td>{rule.metrics?.events ?? 0}</td>
                <td>
                  <div className={styles.rowActions}>
                    <button type="button" className={styles.actionButton} onClick={() => onViewRule(rule)}>
                      详情
                    </button>
                    {onEditRule ? (
                      <button type="button" className={styles.actionButton} onClick={() => onEditRule(rule)}>
                        编辑
                      </button>
                    ) : null}
                    {onToggleRule ? (
                      <button
                        type="button"
                        className={clsx(
                          styles.actionButton,
                          rule.enabled ? styles.toggleDisable : styles.toggleEnable
                        )}
                        onClick={() => onToggleRule(rule)}
                      >
                        {rule.enabled ? t('dashboard.risk_rules.actions.disable') : t('dashboard.risk_rules.actions.enable')}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PanelCard>
  );
}

export default RiskRulesPanel;
