import type { RiskRuleItem } from '@features/dashboard/types';
import type { UpsertRiskRuleInput } from '@services/riskApi';

const clonePositionLimit = (
  source: RiskRuleItem['positionLimit']
): UpsertRiskRuleInput['positionLimit'] => {
  if (!source) {
    return null;
  }
  const { maxNet, maxLong, maxShort } = source;
  const normalized = {
    maxNet: maxNet ?? null,
    maxLong: maxLong ?? null,
    maxShort: maxShort ?? null
  };
  if (normalized.maxNet == null && normalized.maxLong == null && normalized.maxShort == null) {
    return null;
  }
  return normalized;
};

const cloneLossLimit = (
  source: RiskRuleItem['lossLimit']
): UpsertRiskRuleInput['lossLimit'] => {
  if (!source) {
    return null;
  }
  const { maxUnrealized, maxUnrealizedPct } = source;
  const normalized = {
    maxUnrealized: maxUnrealized ?? null,
    maxUnrealizedPct: maxUnrealizedPct ?? null
  };
  if (normalized.maxUnrealized == null && normalized.maxUnrealizedPct == null) {
    return null;
  }
  return normalized;
};

const cloneAtrConfig = (
  source: RiskRuleItem['atrConfig'],
  atrMultiplier?: number | null
): UpsertRiskRuleInput['atrConfig'] => {
  if (!source) {
    return null;
  }
  const normalized = {
    lookback: source.lookback ?? null,
    barMinutes: source.barMinutes ?? null,
    streamInterval: source.streamInterval ?? null,
    updateThrottle: source.updateThrottle ?? null,
    multiplierSl: source.multiplierSl ?? atrMultiplier ?? null,
    multiplierTp: source.multiplierTp ?? null,
    deltaThreshold: source.deltaThreshold ?? null
  };
  if (
    normalized.lookback == null &&
    normalized.barMinutes == null &&
    normalized.streamInterval == null &&
    normalized.updateThrottle == null &&
    normalized.multiplierSl == null &&
    normalized.multiplierTp == null &&
    normalized.deltaThreshold == null
  ) {
    return null;
  }
  return normalized;
};

export const toUpsertInputFromRule = (
  rule: RiskRuleItem,
  overrides: Partial<UpsertRiskRuleInput> = {}
): UpsertRiskRuleInput => {
  const type = overrides.type ?? rule.type;
  const symbol = overrides.symbol ?? rule.symbol ?? null;
  const enabled = overrides.enabled ?? rule.enabled;
  const stopLossOffset =
    type === 'fixed'
      ? overrides.stopLossOffset ?? rule.stopLossOffset ?? null
      : overrides.stopLossOffset ?? null;
  const takeProfitOffset =
    type === 'fixed'
      ? overrides.takeProfitOffset ?? rule.takeProfitOffset ?? null
      : overrides.takeProfitOffset ?? null;
  const trailingDistance =
    type !== 'fixed'
      ? overrides.trailingDistance ?? rule.trailingDistance ?? null
      : overrides.trailingDistance ?? null;
  const trailingPercent =
    type !== 'fixed'
      ? overrides.trailingPercent ?? rule.trailingPercent ?? null
      : overrides.trailingPercent ?? null;

  return {
    ruleId: rule.id,
    dbId: overrides.dbId ?? rule.dbId ?? null,
    symbol,
    enabled,
    type,
    stopLossOffset,
    takeProfitOffset,
    trailingDistance,
    trailingPercent,
    maxTimeSpan: overrides.maxTimeSpan ?? rule.maxTimeSpan ?? null,
    positionLimit: overrides.positionLimit ?? clonePositionLimit(rule.positionLimit),
    lossLimit: overrides.lossLimit ?? cloneLossLimit(rule.lossLimit),
    notes: overrides.notes ?? rule.notes ?? null,
    atrConfig:
      type === 'atr_trailing'
        ? overrides.atrConfig ?? cloneAtrConfig(rule.atrConfig, rule.atrMultiplier)
        : type === 'trailing'
          ? overrides.atrConfig ?? cloneAtrConfig(rule.atrConfig)
          : overrides.atrConfig ?? null
  };
};
