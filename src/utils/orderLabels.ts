import type { OrderItem } from '@features/dashboard/types';
import i18n from '../i18n';

const AUTO_STOP_REASON_PREFIX = 'auto_stop:';

// Map auto-stop reason codes to translation keys
const AUTO_STOP_REASON_KEYS: Record<string, string> = {
  loss_breach: 'dashboard.orders.card.origin.auto_stop.reason.loss_breach'
};

const RISK_RULE_LABEL_KEYS: Record<string, string> = {
  TP: 'dashboard.orders.card.origin.risk.tp',
  TIME: 'dashboard.orders.card.origin.risk.time',
  SL: 'dashboard.orders.card.origin.risk.sl'
};

const normaliseOrderTag = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const text = value.trim();
  if (!text) {
    return null;
  }
  // Keep generic English for unknown tags; these are rarely shown
  if (text === 'reverse-position') {
    return i18n.t('dashboard.orders.card.origin.tags.reverse_order', 'reverse order');
  }
  if (text === 'close-position') {
    return i18n.t('dashboard.orders.card.origin.tags.close_order', 'close order');
  }
  return text;
};

export const resolveOrderSourceLabel = (order: OrderItem): string => {
  const candidates = [order.orderSource, order.source];
  for (const candidate of candidates) {
    const label = normaliseOrderTag(candidate);
    if (label) {
      return label;
    }
  }
  return '—';
};

export const resolveOrderStrategyLabel = (order: OrderItem): string => {
  const rawSource = order.orderSource ?? order.source ?? '';
  const source = typeof rawSource === 'string' ? rawSource.trim().toLowerCase() : '';
  if (source === 'risk') {
    const ruleCode = (order.ruleId ?? '').toUpperCase();
    switch (ruleCode) {
      case 'TP':
        return `${i18n.t('dashboard.orders.card.origin.risk_prefix')}-${i18n.t('dashboard.orders.card.origin.risk.tp')}`;
      case 'TIME':
        return `${i18n.t('dashboard.orders.card.origin.risk_prefix')}-${i18n.t('dashboard.orders.card.origin.risk.time')}`;
      case 'SL':
      default:
        return `${i18n.t('dashboard.orders.card.origin.risk_prefix')}-${i18n.t('dashboard.orders.card.origin.risk.sl')}`;
    }
  }

  const strategyName = normaliseOrderTag(order.strategyName) ?? normaliseOrderTag(order.strategy);
  if (source === 'strategy') {
    if (strategyName) {
      return `${i18n.t('dashboard.orders.card.origin.strategy_prefix')}-${strategyName}`;
    }
    return i18n.t('dashboard.orders.card.origin.strategy_prefix');
  }

  const candidates = [strategyName, order.ruleId, order.source, order.orderSource];
  for (const candidate of candidates) {
    const label = normaliseOrderTag(candidate);
    if (label) {
      return label;
    }
  }
  return '—';
};

const resolveAutoStopReasonLabel = (notes: OrderItem['notes']): string | null => {
  if (!notes || typeof notes !== 'string') {
    return null;
  }

  if (!notes.includes(AUTO_STOP_REASON_PREFIX)) {
    return null;
  }

  const match = notes.match(/auto_stop:([a-zA-Z0-9_-]+)/);
  if (!match) {
    return null;
  }

  const reasonCode = match[1].trim().toLowerCase();
  const defaultLabel = i18n.t('dashboard.orders.card.origin.auto_stop.default');
  if (!reasonCode) {
    return defaultLabel;
  }

  const key = AUTO_STOP_REASON_KEYS[reasonCode];
  if (key) {
    return i18n.t(key);
  }
  const l = i18n.language === 'zh' ? '（' : '(';
  const r = i18n.language === 'zh' ? '）' : ')';
  return `${defaultLabel}${l}${reasonCode}${r}`;
};

export const resolveOrderOriginLabel = (order: OrderItem): string | null => {
  const rawSource = order.orderSource ?? order.source ?? '';
  const source = typeof rawSource === 'string' ? rawSource.trim().toLowerCase() : '';

  const autoStopReasonLabel = resolveAutoStopReasonLabel(order.notes);

  if (source === 'manual' || source === 'dashboard') {
    const base = i18n.t('dashboard.orders.card.origin.manual');
    if (!autoStopReasonLabel) {
      return base;
    }
    const l = i18n.language === 'zh' ? '（' : '(';
    const r = i18n.language === 'zh' ? '）' : ')';
    return `${base}${l}${autoStopReasonLabel}${r}`;
  }

  const strategyLabel = resolveOrderStrategyLabel(order);
  const baseLabel = strategyLabel === '—' ? null : strategyLabel;

  if (!autoStopReasonLabel) {
    return baseLabel;
  }

  if (baseLabel) {
    const l = i18n.language === 'zh' ? '（' : '(';
    const r = i18n.language === 'zh' ? '）' : ')';
    return `${baseLabel}${l}${autoStopReasonLabel}${r}`;
  }

  return autoStopReasonLabel;
};

export const resolveOrderActionStatus = (order: OrderItem): string => {
  const normalizeTag = (value: unknown): string | null => {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    return trimmed.toLowerCase();
  };

  const raw = order.raw && typeof order.raw === 'object' ? (order.raw as Record<string, unknown>) : null;
  const rawPayload =
    raw && typeof raw.raw_payload === 'object' && raw.raw_payload
      ? (raw.raw_payload as Record<string, unknown>)
      : null;

  const sources = [
    order.source,
    order.orderSource,
    order.strategyName,
    order.strategy,
    raw?.source,
    raw?.order_source,
    raw?.strategy_name,
    raw?.strategy,
    rawPayload?.source,
    rawPayload?.strategy_name,
    rawPayload?.strategy
  ]
    .map(normalizeTag)
    .filter((value): value is string => Boolean(value));
  const notes = (order.notes ?? '').toLowerCase();

  const labelOpen = i18n.language === 'zh' ? '开仓' : 'Entry';
  const labelClose = i18n.language === 'zh' ? '平仓' : 'Exit';
  const labelExit = i18n.language === 'zh' ? '退出' : 'Exit';
  const labelTakeProfit = i18n.language === 'zh' ? '止盈' : 'Take Profit';
  const labelStopLoss = i18n.language === 'zh' ? '止损' : 'Stop Loss';
  const labelTimeout = i18n.language === 'zh' ? '超时' : 'Timeout';
  const labelRiskPrefix = i18n.t('dashboard.orders.card.origin.risk_prefix');

  if (notes.includes('strategy_exit_take_profit')) {
    return `${labelExit}-${labelTakeProfit}`;
  }
  if (notes.includes('strategy_exit_stop_loss')) {
    return `${labelExit}-${labelStopLoss}`;
  }
  if (notes.includes('strategy_exit_timeout')) {
    return `${labelExit}-${labelTimeout}`;
  }

  // Handle custom strategy stop loss notes (e.g. buy_the_dip_exit_sl)
  if (notes.includes('strategy_exit') && (notes.includes('_sl') || notes.includes('stop_loss'))) {
    return `${labelClose}-${labelStopLoss}`;
  }

  // Handle custom strategy take profit notes (e.g. buy_the_dip_exit_tp)
  if (notes.includes('strategy_exit') && (notes.includes('_tp') || notes.includes('take_profit'))) {
    return `${labelClose}-${labelTakeProfit}`;
  }

  const isRiskByNotes =
    notes.includes('risk.') ||
    notes.includes('loss_breach') ||
    notes.includes('loss_duration_breach') ||
    notes.includes('unrealized_loss_threshold') ||
    notes.includes('unrealized_loss_duration_threshold');

  if (sources.includes('risk') || isRiskByNotes) {
    const ruleCode = (order.ruleId ?? '').trim().toUpperCase();
    let ruleLabelKey = RISK_RULE_LABEL_KEYS.SL;
    if (ruleCode && RISK_RULE_LABEL_KEYS[ruleCode]) {
      ruleLabelKey = RISK_RULE_LABEL_KEYS[ruleCode];
    } else if (notes.includes('loss_duration_breach') || notes.includes('unrealized_loss_duration_threshold')) {
      ruleLabelKey = RISK_RULE_LABEL_KEYS.TIME;
    } else if (notes.includes('loss_breach') || notes.includes('unrealized_loss_threshold')) {
      ruleLabelKey = RISK_RULE_LABEL_KEYS.SL;
    }
    const ruleLabel = i18n.t(ruleLabelKey);
    return `${labelRiskPrefix}-${ruleLabel}`;
  }

  if (notes.includes('strategy_exit')) {
    return labelClose;
  }
  if (notes.includes('strategy_entry')) {
    return labelOpen;
  }

  const isCloseTag = (value: string): boolean => {
    const normalized = value.replace(/_/g, '-').replace(/\s+/g, ' ').trim();
    if (
      normalized === 'close' ||
      normalized === 'close order' ||
      normalized === 'close-position' ||
      normalized === 'close_order' ||
      normalized === 'closeposition'
    ) {
      return true;
    }
    return normalized.startsWith('close order') || normalized.startsWith('close-position');
  };

  const isReverseTag = (value: string): boolean => {
    const normalized = value.replace(/_/g, '-').replace(/\s+/g, ' ').trim();
    if (
      normalized === 'reverse' ||
      normalized === 'reverse order' ||
      normalized === 'reverse-position' ||
      normalized === 'reverse_order' ||
      normalized === 'reverseposition'
    ) {
      return true;
    }
    return normalized.startsWith('reverse order') || normalized.startsWith('reverse-position');
  };

  if (sources.some((source) => isCloseTag(source) || isReverseTag(source))) {
    return labelClose;
  }
  return labelOpen;
};
