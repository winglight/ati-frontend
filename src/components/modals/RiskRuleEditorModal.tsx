import { FormEvent, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import Modal from './Modal';
import styles from './RiskRuleEditorModal.module.css';
import type { RiskRuleItem } from '@features/dashboard/types';
import type { UpsertRiskRuleInput } from '@services/riskApi';
import { formatPriceWithTick } from '@features/dashboard/utils/priceFormatting';
import { computeExpectedPnl, priceFromDirectionalOffset } from '../../utils/riskDefaults';

export interface RiskRuleRecommendations {
  stopLossPrice?: number | null;
  takeProfitPrice?: number | null;
  stopLossOffset?: number | null;
  takeProfitOffset?: number | null;
  stopLossRatio?: number | null;
  takeProfitRatio?: number | null;
}

export interface RiskRuleEditorContext {
  symbol?: string | null;
  basePrice?: number | null;
  quantity?: number | null;
  direction?: 'long' | 'short' | null;
  leverage?: number | null;
  multiplier?: number | null;
  recommended?: RiskRuleRecommendations | null;
}

interface RiskRuleEditorModalProps {
  open: boolean;
  rule: RiskRuleItem | null;
  submitting: boolean;
  error?: string | null;
  defaults?: Partial<UpsertRiskRuleInput> | null;
  context?: RiskRuleEditorContext | null;
  onSubmit: (values: UpsertRiskRuleInput) => void;
  onClose: () => void;
}

type RiskRuleFormType = UpsertRiskRuleInput['type'];

interface NumericGroupState {
  maxNet: string;
  maxLong: string;
  maxShort: string;
}

type LossLimitMode = 'amount' | 'percent';

interface LossLimitState {
  mode: LossLimitMode;
  amount: string;
  percent: string;
}

interface AtrConfigState {
  lookback: string;
  barMinutes: string;
  streamInterval: string;
  updateThrottle: string;
  multiplierSl: string;
  multiplierTp: string;
  deltaThreshold: string;
}

interface FormState {
  symbol: string;
  enabled: boolean;
  type: RiskRuleFormType;
  stopLossOffset: string;
  takeProfitOffset: string;
  trailingDistance: string;
  trailingPercent: string;
  maxTimeSpan: string;
  positionLimit: NumericGroupState;
  lossLimit: LossLimitState;
  atrConfig: AtrConfigState;
  notes: string;
}

const DEFAULT_ATR_CONFIG: AtrConfigState = {
  lookback: '14',
  barMinutes: '5',
  streamInterval: '5',
  updateThrottle: '30',
  multiplierSl: '1',
  multiplierTp: '2',
  deltaThreshold: '0.25'
};

const DEFAULT_FIXED_STOP_LOSS_OFFSET = -5;
const DEFAULT_FIXED_TAKE_PROFIT_OFFSET = 10;
const DEFAULT_TRAILING_DISTANCE = '5';
const DEFAULT_TRAILING_PERCENT = '0.02';
const DEFAULT_MAX_TIME_SPAN = '0';

const DEFAULT_POSITION_LIMIT: NumericGroupState = {
  maxNet: '0',
  maxLong: '0',
  maxShort: '0'
};

const DEFAULT_LOSS_LIMIT: LossLimitState = {
  mode: 'amount',
  amount: '0',
  percent: '0.02'
};

const parseNullableNumber = (value: string): number | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number(trimmed);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return parsed;
};

const isPositiveFiniteNumber = (value: number | null | undefined): value is number => {
  return value != null && Number.isFinite(value) && value > 0;
};

const formatCurrency = (value: number | null): string => {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
};

const formatOffsetInputValue = (value: number | string | null | undefined): string => {
  if (value == null || value === '') {
    return '';
  }
  const numeric = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(numeric)) {
    return '';
  }
  return numeric.toFixed(2);
};

const formatPriceValue = (value: number | null, symbol: string | null | undefined): string => {
  if (value == null || Number.isNaN(value)) {
    return '—';
  }
  return formatPriceWithTick(value, symbol);
};

const formatSignedOffset = (value: number | null | undefined): string | null => {
  if (value == null || Number.isNaN(value)) {
    return null;
  }
  if (Math.abs(value) < 0.005) {
    return '0.00';
  }
  const formatted = Math.abs(value).toFixed(2);
  return value > 0 ? `+${formatted}` : `-${formatted}`;
};

const formatRatioPercent = (value: number | null | undefined): string | null => {
  if (value == null || Number.isNaN(value)) {
    return null;
  }
  return `${(value * 100).toFixed(2)}%`;
};

const formatLeverage = (value: number | null | undefined): string | null => {
  if (value == null || Number.isNaN(value)) {
    return null;
  }
  const digits = value >= 10 ? 0 : value >= 5 ? 1 : 2;
  const numeric = Number(value.toFixed(digits));
  return `${numeric}x`;
};

const createInitialState = (
  rule: RiskRuleItem | null,
  defaults?: Partial<UpsertRiskRuleInput> | null
): FormState => {
  const lossLimitAmount =
    rule?.lossLimit?.maxUnrealized != null
      ? String(rule.lossLimit.maxUnrealized)
      : defaults?.lossLimit?.maxUnrealized != null
        ? String(defaults.lossLimit.maxUnrealized)
        : DEFAULT_LOSS_LIMIT.amount;

  const lossLimitPercent =
    rule?.lossLimit?.maxUnrealizedPct != null
      ? String(rule.lossLimit.maxUnrealizedPct)
      : defaults?.lossLimit?.maxUnrealizedPct != null
        ? String(defaults.lossLimit.maxUnrealizedPct)
        : DEFAULT_LOSS_LIMIT.percent;

  let lossLimitMode: LossLimitMode = DEFAULT_LOSS_LIMIT.mode;
  if (rule?.lossLimit?.maxUnrealized != null) {
    lossLimitMode = 'amount';
  } else if (rule?.lossLimit?.maxUnrealizedPct != null) {
    lossLimitMode = 'percent';
  } else if (defaults?.lossLimit?.maxUnrealized != null) {
    lossLimitMode = 'amount';
  } else if (defaults?.lossLimit?.maxUnrealizedPct != null) {
    lossLimitMode = 'percent';
  } else {
    const amountNumber = parseNullableNumber(lossLimitAmount);
    const percentNumber = parseNullableNumber(lossLimitPercent);
    if (!isPositiveFiniteNumber(amountNumber) && isPositiveFiniteNumber(percentNumber)) {
      lossLimitMode = 'percent';
    }
  }

  return {
    symbol: rule?.symbol ?? defaults?.symbol ?? '',
    enabled: rule?.enabled ?? defaults?.enabled ?? true,
    type: rule?.type ?? defaults?.type ?? 'fixed',
    stopLossOffset:
      rule?.stopLossOffset != null
        ? formatOffsetInputValue(rule.stopLossOffset)
        : defaults?.stopLossOffset != null
          ? formatOffsetInputValue(defaults.stopLossOffset)
          : formatOffsetInputValue(DEFAULT_FIXED_STOP_LOSS_OFFSET),
    takeProfitOffset:
      rule?.takeProfitOffset != null
        ? formatOffsetInputValue(rule.takeProfitOffset)
        : defaults?.takeProfitOffset != null
          ? formatOffsetInputValue(defaults.takeProfitOffset)
          : formatOffsetInputValue(DEFAULT_FIXED_TAKE_PROFIT_OFFSET),
    trailingDistance:
      rule?.trailingDistance != null
        ? String(rule.trailingDistance)
        : defaults?.trailingDistance != null
          ? String(defaults.trailingDistance)
          : DEFAULT_TRAILING_DISTANCE,
    trailingPercent:
      rule?.trailingPercent != null
        ? String(rule.trailingPercent)
        : defaults?.trailingPercent != null
          ? String(defaults.trailingPercent)
          : DEFAULT_TRAILING_PERCENT,
    maxTimeSpan: rule?.maxTimeSpan ?? defaults?.maxTimeSpan ?? DEFAULT_MAX_TIME_SPAN,
    positionLimit: {
      maxNet:
        rule?.positionLimit?.maxNet != null
          ? String(rule.positionLimit.maxNet)
          : defaults?.positionLimit?.maxNet != null
            ? String(defaults.positionLimit.maxNet)
            : DEFAULT_POSITION_LIMIT.maxNet,
      maxLong:
        rule?.positionLimit?.maxLong != null
          ? String(rule.positionLimit.maxLong)
          : defaults?.positionLimit?.maxLong != null
            ? String(defaults.positionLimit.maxLong)
            : DEFAULT_POSITION_LIMIT.maxLong,
      maxShort:
        rule?.positionLimit?.maxShort != null
          ? String(rule.positionLimit.maxShort)
          : defaults?.positionLimit?.maxShort != null
            ? String(defaults.positionLimit.maxShort)
            : DEFAULT_POSITION_LIMIT.maxShort
    },
    lossLimit: {
      mode: lossLimitMode,
      amount: lossLimitAmount,
      percent: lossLimitPercent
    },
    atrConfig: {
      lookback:
        rule?.atrConfig?.lookback != null
          ? String(rule.atrConfig.lookback)
          : defaults?.atrConfig?.lookback != null
            ? String(defaults.atrConfig.lookback)
            : DEFAULT_ATR_CONFIG.lookback,
      barMinutes:
        rule?.atrConfig?.barMinutes != null
          ? String(rule.atrConfig.barMinutes)
          : defaults?.atrConfig?.barMinutes != null
            ? String(defaults.atrConfig.barMinutes)
            : DEFAULT_ATR_CONFIG.barMinutes,
      streamInterval:
        rule?.atrConfig?.streamInterval != null
          ? String(rule.atrConfig.streamInterval)
          : defaults?.atrConfig?.streamInterval != null
            ? String(defaults.atrConfig.streamInterval)
            : DEFAULT_ATR_CONFIG.streamInterval,
      updateThrottle:
        rule?.atrConfig?.updateThrottle != null
          ? String(rule.atrConfig.updateThrottle)
          : defaults?.atrConfig?.updateThrottle != null
            ? String(defaults.atrConfig.updateThrottle)
            : DEFAULT_ATR_CONFIG.updateThrottle,
      multiplierSl:
        rule?.atrConfig?.multiplierSl != null
          ? String(rule.atrConfig.multiplierSl)
          : defaults?.atrConfig?.multiplierSl != null
            ? String(defaults.atrConfig.multiplierSl)
            : DEFAULT_ATR_CONFIG.multiplierSl,
      multiplierTp:
        rule?.atrConfig?.multiplierTp != null
          ? String(rule.atrConfig.multiplierTp)
          : defaults?.atrConfig?.multiplierTp != null
            ? String(defaults.atrConfig.multiplierTp)
            : DEFAULT_ATR_CONFIG.multiplierTp,
      deltaThreshold:
        rule?.atrConfig?.deltaThreshold != null
          ? String(rule.atrConfig.deltaThreshold)
          : defaults?.atrConfig?.deltaThreshold != null
            ? String(defaults.atrConfig.deltaThreshold)
            : DEFAULT_ATR_CONFIG.deltaThreshold
    },
    notes: rule?.notes ?? defaults?.notes ?? ''
  };
};

function RiskRuleEditorModal({
  open,
  rule,
  submitting,
  error,
  defaults,
  context,
  onSubmit,
  onClose
}: RiskRuleEditorModalProps) {
  const [form, setForm] = useState<FormState>(() => createInitialState(rule, defaults));
  const [protectiveStopAcknowledged, setProtectiveStopAcknowledged] = useState<boolean>(
    form.type !== 'trailing'
  );
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const nextState = createInitialState(rule, defaults);
      setForm(nextState);
      setProtectiveStopAcknowledged(nextState.type !== 'trailing');
      setLocalError(null);
    }
  }, [open, rule, defaults]);

  const basePrice = context?.basePrice ?? null;
  const quantity = context?.quantity ?? null;
  const direction = context?.direction ?? null;
  const multiplier = context?.multiplier ?? null;
  const leverageLabel = formatLeverage(context?.leverage);
  const recommended = context?.recommended ?? null;
  const effectiveSymbol =
    form.symbol.trim() || defaults?.symbol || rule?.symbol || context?.symbol || null;
  const recommendedStopLossPrice = recommended?.stopLossPrice ?? null;
  const recommendedTakeProfitPrice = recommended?.takeProfitPrice ?? null;
  const recommendedStopLossOffset = recommended?.stopLossOffset ?? null;
  const recommendedTakeProfitOffset = recommended?.takeProfitOffset ?? null;
  const recommendedStopLossRatio = formatRatioPercent(recommended?.stopLossRatio);
  const recommendedTakeProfitRatio = formatRatioPercent(recommended?.takeProfitRatio);

  const trailingDistanceValue = useMemo(() => {
    if (form.type !== 'trailing') {
      return null;
    }
    return parseNullableNumber(form.trailingDistance);
  }, [form.trailingDistance, form.type]);

  const trailingPercentValue = useMemo(() => {
    if (form.type !== 'trailing') {
      return null;
    }
    return parseNullableNumber(form.trailingPercent);
  }, [form.trailingPercent, form.type]);

  const recommendedLossLimit = useMemo(() => {
    if (form.type !== 'trailing') {
      return { amount: null as number | null, percent: null as number | null };
    }

    const absQuantity = quantity != null && Number.isFinite(quantity) ? Math.abs(quantity) : null;
    const safeBasePrice = basePrice != null && Number.isFinite(basePrice) ? Math.abs(basePrice) : null;
    const distance = trailingDistanceValue != null && Number.isFinite(trailingDistanceValue)
      ? Math.abs(trailingDistanceValue)
      : null;
    const percent = trailingPercentValue != null && Number.isFinite(trailingPercentValue)
      ? Math.abs(trailingPercentValue)
      : null;

    let amount: number | null = null;
    let percentLimit: number | null = null;

    if (percent != null) {
      percentLimit = percent;
    } else if (distance != null && safeBasePrice != null && safeBasePrice > 1e-9) {
      percentLimit = distance / safeBasePrice;
    }

    if (distance != null && absQuantity != null && absQuantity > 0) {
      amount = distance * absQuantity;
    } else if (
      percent != null &&
      safeBasePrice != null &&
      safeBasePrice > 1e-9 &&
      absQuantity != null &&
      absQuantity > 0
    ) {
      amount = percent * safeBasePrice * absQuantity;
    }

    if (amount != null && !Number.isFinite(amount)) {
      amount = null;
    }
    if (percentLimit != null && !Number.isFinite(percentLimit)) {
      percentLimit = null;
    }

    return { amount, percent: percentLimit };
  }, [basePrice, form.type, quantity, trailingDistanceValue, trailingPercentValue]);

  const recommendedLossLimitKey = useMemo(() => {
    const amountKey =
      recommendedLossLimit.amount != null ? recommendedLossLimit.amount.toFixed(6) : 'none';
    const percentKey =
      recommendedLossLimit.percent != null ? recommendedLossLimit.percent.toFixed(6) : 'none';
    const directionKey = direction ?? 'none';
    return `${amountKey}|${percentKey}|${directionKey}`;
  }, [direction, recommendedLossLimit.amount, recommendedLossLimit.percent]);

  useEffect(() => {
    if (form.type === 'trailing') {
      setProtectiveStopAcknowledged(false);
    }
  }, [form.type, recommendedLossLimitKey]);

  const lossLimitNumbers = useMemo(
    () => ({
      amount: parseNullableNumber(form.lossLimit.amount),
      percent: parseNullableNumber(form.lossLimit.percent)
    }),
    [form.lossLimit.amount, form.lossLimit.percent]
  );

  const hasLossLimitValue =
    form.lossLimit.mode === 'amount'
      ? isPositiveFiniteNumber(lossLimitNumbers.amount)
      : isPositiveFiniteNumber(lossLimitNumbers.percent);

  const lossLimitPerUnit = useMemo(() => {
    if (form.lossLimit.mode === 'amount') {
      const amount = lossLimitNumbers.amount;
      if (!isPositiveFiniteNumber(amount)) {
        return null;
      }
      if (quantity == null || !Number.isFinite(quantity)) {
        return null;
      }
      const absQuantity = Math.abs(quantity);
      if (absQuantity < 1e-9) {
        return null;
      }
      const perUnit = amount / absQuantity;
      return Number.isFinite(perUnit) ? perUnit : null;
    }

    const percent = lossLimitNumbers.percent;
    if (!isPositiveFiniteNumber(percent)) {
      return null;
    }
    if (basePrice == null || !Number.isFinite(basePrice) || basePrice <= 0) {
      return null;
    }
    const perUnit = percent * basePrice;
    return Number.isFinite(perUnit) ? perUnit : null;
  }, [basePrice, form.lossLimit.mode, lossLimitNumbers.amount, lossLimitNumbers.percent, quantity]);

  const hasDirectionContext = direction === 'long' || direction === 'short';

  const canApplyRecommendedLossLimit =
    hasDirectionContext &&
    ((recommendedLossLimit.amount != null && recommendedLossLimit.amount > 0) ||
      (recommendedLossLimit.percent != null && recommendedLossLimit.percent > 0));

  const recommendedLossAmountText =
    hasDirectionContext && recommendedLossLimit.amount != null && recommendedLossLimit.amount > 0
      ? formatCurrency(-recommendedLossLimit.amount)
      : null;
  const recommendedLossPercentText =
    recommendedLossLimit.percent != null && recommendedLossLimit.percent > 0
      ? formatRatioPercent(recommendedLossLimit.percent)
      : null;

  const lossLimitModeHint =
    form.lossLimit.mode === 'amount'
      ? '以账户货币计的未实现亏损上限'
      : '按名义持仓金额计算的小数比例（例如 0.05 = 5%）';

  const lossLimitPerUnitText =
    lossLimitPerUnit != null ? formatCurrency(-lossLimitPerUnit) : null;

  const effectiveError = localError ?? error ?? null;

  const referenceChips = useMemo(() => {
    const chips: string[] = [];
    if (basePrice != null && !Number.isNaN(basePrice)) {
      chips.push(`基准价 ${formatPriceValue(basePrice, effectiveSymbol)}`);
    }
    if (quantity != null && !Number.isNaN(quantity)) {
      const directionLabel =
        direction === 'short' ? '空头' : direction === 'long' ? '多头' : '持仓';
      const quantityLabel = Math.abs(quantity).toLocaleString('en-US');
      chips.push(`${directionLabel} ${quantityLabel}`);
    }
    if (leverageLabel) {
      chips.push(`杠杆 ${leverageLabel}`);
    }
    return chips;
  }, [basePrice, direction, effectiveSymbol, leverageLabel, quantity]);

  const stopLossOffsetValue = useMemo(() => {
    if (form.type !== 'fixed') {
      return null;
    }
    return parseNullableNumber(form.stopLossOffset);
  }, [form.stopLossOffset, form.type]);

  const takeProfitOffsetValue = useMemo(() => {
    if (form.type !== 'fixed') {
      return null;
    }
    return parseNullableNumber(form.takeProfitOffset);
  }, [form.takeProfitOffset, form.type]);

  const stopLossPriceValue = useMemo(() => {
    if (
      form.type !== 'fixed' ||
      basePrice == null ||
      stopLossOffsetValue == null ||
      (direction !== 'long' && direction !== 'short')
    ) {
      return null;
    }
    return priceFromDirectionalOffset(basePrice, stopLossOffsetValue, direction);
  }, [basePrice, direction, form.type, stopLossOffsetValue]);

  const takeProfitPriceValue = useMemo(() => {
    if (
      form.type !== 'fixed' ||
      basePrice == null ||
      takeProfitOffsetValue == null ||
      (direction !== 'long' && direction !== 'short')
    ) {
      return null;
    }
    return priceFromDirectionalOffset(basePrice, takeProfitOffsetValue, direction);
  }, [basePrice, direction, form.type, takeProfitOffsetValue]);

  const stopLossPricePreview = stopLossPriceValue ?? recommendedStopLossPrice ?? null;
  const takeProfitPricePreview = takeProfitPriceValue ?? recommendedTakeProfitPrice ?? null;

  const stopLossPreview = useMemo(() => {
    if (form.type !== 'fixed') {
      return null;
    }
    if (stopLossPriceValue != null) {
      const pnl = computeExpectedPnl(
        basePrice,
        stopLossPriceValue,
        quantity,
        direction,
        multiplier
      );
      if (pnl != null) {
        return pnl;
      }
    }
    if (
      stopLossOffsetValue != null &&
      Number.isFinite(stopLossOffsetValue) &&
      quantity != null &&
      Number.isFinite(quantity) &&
      (direction === 'long' || direction === 'short')
    ) {
      const absQuantity = Math.abs(quantity);
      const effectiveMultiplier =
        multiplier != null && Number.isFinite(multiplier) && Math.abs(multiplier) > 0
          ? Math.abs(multiplier)
          : 1;
      return stopLossOffsetValue * absQuantity * effectiveMultiplier;
    }
    return stopLossOffsetValue;
  }, [
    basePrice,
    direction,
    form.type,
    multiplier,
    quantity,
    stopLossOffsetValue,
    stopLossPriceValue
  ]);

  const takeProfitPreview = useMemo(() => {
    if (form.type !== 'fixed') {
      return null;
    }
    if (takeProfitPriceValue != null) {
      const pnl = computeExpectedPnl(
        basePrice,
        takeProfitPriceValue,
        quantity,
        direction,
        multiplier
      );
      if (pnl != null) {
        return pnl;
      }
    }
    if (
      takeProfitOffsetValue != null &&
      Number.isFinite(takeProfitOffsetValue) &&
      quantity != null &&
      Number.isFinite(quantity) &&
      (direction === 'long' || direction === 'short')
    ) {
      const absQuantity = Math.abs(quantity);
      const effectiveMultiplier =
        multiplier != null && Number.isFinite(multiplier) && Math.abs(multiplier) > 0
          ? Math.abs(multiplier)
          : 1;
      return takeProfitOffsetValue * absQuantity * effectiveMultiplier;
    }
    return takeProfitOffsetValue;
  }, [
    basePrice,
    direction,
    form.type,
    multiplier,
    quantity,
    takeProfitOffsetValue,
    takeProfitPriceValue
  ]);

  const stopLossValueClass = clsx(
    styles.previewValue,
    stopLossPreview == null
      ? styles.previewValueNeutral
      : stopLossPreview >= 0
        ? styles.previewValuePositive
        : styles.previewValueNegative
  );

  const takeProfitValueClass = clsx(
    styles.previewValue,
    takeProfitPreview == null
      ? styles.previewValueNeutral
      : takeProfitPreview >= 0
        ? styles.previewValuePositive
        : styles.previewValueNegative
  );

  const handleLossLimitModeChange = (mode: LossLimitMode) => {
    if (form.lossLimit.mode === mode) {
      return;
    }
    setForm((previous) => {
      if (previous.lossLimit.mode === mode) {
        return previous;
      }
      return { ...previous, lossLimit: { ...previous.lossLimit, mode } };
    });
    if (form.type === 'trailing') {
      setProtectiveStopAcknowledged(false);
    }
    setLocalError(null);
  };

  const handleLossLimitValueChange = (value: string) => {
    setForm((previous) => {
      if (previous.lossLimit.mode === 'amount') {
        if (previous.lossLimit.amount === value) {
          return previous;
        }
        return { ...previous, lossLimit: { ...previous.lossLimit, amount: value } };
      }
      if (previous.lossLimit.percent === value) {
        return previous;
      }
      return { ...previous, lossLimit: { ...previous.lossLimit, percent: value } };
    });
    if (form.type === 'trailing') {
      setProtectiveStopAcknowledged(false);
    }
    setLocalError(null);
  };

  const handleApplyRecommendedLossLimit = () => {
    if (!canApplyRecommendedLossLimit) {
      return;
    }
    setForm((previous) => {
      const nextLossLimit = { ...previous.lossLimit };
      let nextMode: LossLimitMode = nextLossLimit.mode;
      const hasAmountRecommendation =
        recommendedLossLimit.amount != null && recommendedLossLimit.amount > 0;
      const hasPercentRecommendation =
        recommendedLossLimit.percent != null && recommendedLossLimit.percent > 0;

      if (hasAmountRecommendation) {
        nextLossLimit.amount = recommendedLossLimit.amount!.toFixed(2);
      }
      if (hasPercentRecommendation) {
        nextLossLimit.percent = recommendedLossLimit.percent!.toFixed(4);
      }

      if (nextLossLimit.mode === 'amount' && !hasAmountRecommendation && hasPercentRecommendation) {
        nextMode = 'percent';
      } else if (
        nextLossLimit.mode === 'percent' &&
        !hasPercentRecommendation &&
        hasAmountRecommendation
      ) {
        nextMode = 'amount';
      }

      return { ...previous, lossLimit: { ...nextLossLimit, mode: nextMode } };
    });
    setProtectiveStopAcknowledged(true);
    setLocalError(null);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    setLocalError(null);

    if (form.type === 'trailing') {
      if (!hasLossLimitValue) {
        setLocalError('请先设置保护性止损阈值（金额或比例需大于 0）。');
        return;
      }
      if (!protectiveStopAcknowledged) {
        setLocalError('请勾选确认，确保保护性止损阈值已核对或覆盖。');
        return;
      }
    }

    const maxUnrealizedNumber = parseNullableNumber(form.lossLimit.amount);
    const maxUnrealizedPctNumber = parseNullableNumber(form.lossLimit.percent);

    const payload: UpsertRiskRuleInput = {
      ruleId: rule?.id,
      dbId: rule?.dbId ?? null,
      symbol: form.symbol.trim() || null,
      enabled: form.enabled,
      type: form.type,
      stopLossOffset: parseNullableNumber(form.stopLossOffset),
      takeProfitOffset: parseNullableNumber(form.takeProfitOffset),
      trailingDistance: parseNullableNumber(form.trailingDistance),
      trailingPercent: parseNullableNumber(form.trailingPercent),
      maxTimeSpan:
        typeof form.maxTimeSpan === 'string' ? form.maxTimeSpan.trim() || null : null,
      positionLimit: {
        maxNet: parseNullableNumber(form.positionLimit.maxNet),
        maxLong: parseNullableNumber(form.positionLimit.maxLong),
        maxShort: parseNullableNumber(form.positionLimit.maxShort)
      },
      lossLimit: {
        maxUnrealized:
          form.lossLimit.mode === 'amount' &&
          maxUnrealizedNumber != null &&
          Number.isFinite(maxUnrealizedNumber)
            ? Math.abs(maxUnrealizedNumber)
            : null,
        maxUnrealizedPct:
          form.lossLimit.mode === 'percent' &&
          maxUnrealizedPctNumber != null &&
          Number.isFinite(maxUnrealizedPctNumber)
            ? Math.abs(maxUnrealizedPctNumber)
            : null
      },
      notes: form.notes.trim() || null,
      atrConfig:
        form.type === 'trailing' || form.type === 'atr_trailing'
          ? {
              lookback: parseNullableNumber(form.atrConfig.lookback),
              barMinutes: parseNullableNumber(form.atrConfig.barMinutes),
              streamInterval: parseNullableNumber(form.atrConfig.streamInterval),
              updateThrottle: parseNullableNumber(form.atrConfig.updateThrottle),
              multiplierSl: parseNullableNumber(form.atrConfig.multiplierSl),
              multiplierTp: parseNullableNumber(form.atrConfig.multiplierTp),
              deltaThreshold: parseNullableNumber(form.atrConfig.deltaThreshold)
            }
          : null
    };

    onSubmit(payload);
  };

  const symbolLabel = rule?.symbol ?? defaults?.symbol ?? context?.symbol ?? null;
  const modalTitle = rule
    ? `编辑风险规则 · ${symbolLabel ?? '全局'}`
    : `新增风险规则${symbolLabel ? ` · ${symbolLabel}` : ''}`;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={modalTitle}
      subtitle="配置风控止损、止盈、仓位及 ATR 规则。"
      size="lg"
    >
      <form className={styles.form} onSubmit={handleSubmit}>
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>基础信息</h3>
            <div className={styles.switchGroup}>
              <label className={styles.switchLabel} htmlFor="risk-rule-enabled">
                启用
              </label>
              <input
                id="risk-rule-enabled"
                type="checkbox"
                checked={form.enabled}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, enabled: event.target.checked }))
                }
              />
            </div>
          </div>
          <div className={styles.gridTwoCols}>
            <label className={styles.field}>
              <span className={styles.label}>合约代码</span>
              <input
                className={styles.input}
                type="text"
                value={form.symbol}
                placeholder="例如 MNQ"
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, symbol: event.target.value }))
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>规则类型</span>
              <select
                className={styles.select}
                value={form.type}
                onChange={(event) => {
                  const nextType = event.target.value as RiskRuleFormType;
                  setForm((previous) => ({
                    ...previous,
                    type: nextType
                  }));
                  setLocalError(null);
                  setProtectiveStopAcknowledged(nextType !== 'trailing');
                }}
              >
                <option value="fixed">固定</option>
                <option value="trailing">价格跟踪</option>
                <option value="atr_trailing">ATR 跟踪</option>
              </select>
            </label>
          </div>
          {referenceChips.length > 0 ? (
            <div className={styles.referenceRow}>
              {referenceChips.map((chip) => (
                <span key={chip} className={styles.referenceChip}>
                  {chip}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>
              {form.type === 'fixed'
                ? '固定止损 / 止盈'
                : form.type === 'atr_trailing'
                  ? 'ATR 跟踪参数'
                  : '跟踪参数'}
            </h3>
          </div>

          {form.type === 'fixed' ? (
            <>
              <div className={styles.gridThreeCols}>
                <label className={styles.field}>
                  <span className={styles.label}>止损偏移</span>
                  <input
                    className={styles.input}
                    type="number"
                    step="0.01"
                    value={form.stopLossOffset}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        stopLossOffset: event.target.value
                      }))
                    }
                  />
                  <span className={styles.hint}>
                    负值表示亏损金额
                    {recommendedStopLossPrice != null ? (
                      <>
                        {' · '}建议：{formatPriceValue(recommendedStopLossPrice, effectiveSymbol)}
                        {recommendedStopLossOffset != null
                          ? ` (${formatSignedOffset(recommendedStopLossOffset)})`
                          : null}
                        {recommendedStopLossRatio
                          ? ` · 比例：${recommendedStopLossRatio}`
                          : null}
                      </>
                    ) : null}
                  </span>
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>止盈偏移</span>
                  <input
                    className={styles.input}
                    type="number"
                    step="0.01"
                    value={form.takeProfitOffset}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        takeProfitOffset: event.target.value
                      }))
                    }
                  />
                  <span className={styles.hint}>
                    正值表示盈利目标
                    {recommendedTakeProfitPrice != null ? (
                      <>
                        {' · '}建议：{formatPriceValue(recommendedTakeProfitPrice, effectiveSymbol)}
                        {recommendedTakeProfitOffset != null
                          ? ` (${formatSignedOffset(recommendedTakeProfitOffset)})`
                          : null}
                        {recommendedTakeProfitRatio
                          ? ` · 比例：${recommendedTakeProfitRatio}`
                          : null}
                      </>
                    ) : null}
                  </span>
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>最长持仓时长</span>
                  <input
                    className={styles.input}
                    type="text"
                    placeholder="例如 1d、2h、30m"
                    value={form.maxTimeSpan}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        maxTimeSpan: event.target.value
                      }))
                    }
                  />
                </label>
              </div>

              <div className={styles.previewRow}>
                <div className={clsx(styles.previewCard, styles.previewLoss)}>
                  <span className={styles.previewLabel}>预期止损 PnL</span>
                  <span className={stopLossValueClass}>{formatCurrency(stopLossPreview)}</span>
                </div>
                <div className={clsx(styles.previewCard, styles.previewProfit)}>
                  <span className={styles.previewLabel}>预期止盈 PnL</span>
                  <span className={takeProfitValueClass}>{formatCurrency(takeProfitPreview)}</span>
                </div>
              </div>

              <div className={styles.pricePreviewRow}>
                <div className={styles.pricePreviewCard}>
                  <span className={styles.previewLabel}>预期止损价</span>
                  <span className={styles.previewValue}>
                    {formatPriceValue(stopLossPricePreview, effectiveSymbol)}
                  </span>
                </div>
                <div className={styles.pricePreviewCard}>
                  <span className={styles.previewLabel}>预期止盈价</span>
                  <span className={styles.previewValue}>
                    {formatPriceValue(takeProfitPricePreview, effectiveSymbol)}
                  </span>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className={styles.gridThreeCols}>
                <label className={styles.field}>
                  <span className={styles.label}>跟踪距离</span>
                  <input
                    className={styles.input}
                    type="number"
                    step="0.01"
                    value={form.trailingDistance}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        trailingDistance: event.target.value
                      }))
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>ATR 百分比</span>
                  <input
                    className={styles.input}
                    type="number"
                    step="0.01"
                    value={form.trailingPercent}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        trailingPercent: event.target.value
                      }))
                    }
                  />
                </label>
              </div>

              <div className={styles.atrGrid}>
                <label className={styles.field}>
                  <span className={styles.label}>ATR 回溯</span>
                  <input
                    className={styles.input}
                    type="number"
                    min="1"
                    step="1"
                    value={form.atrConfig.lookback}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        atrConfig: { ...previous.atrConfig, lookback: event.target.value }
                      }))
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Bar 分钟数</span>
                  <input
                    className={styles.input}
                    type="number"
                    min="1"
                    step="1"
                    value={form.atrConfig.barMinutes}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        atrConfig: { ...previous.atrConfig, barMinutes: event.target.value }
                      }))
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>流数据间隔 (s)</span>
                  <input
                    className={styles.input}
                    type="number"
                    min="1"
                    step="1"
                    value={form.atrConfig.streamInterval}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        atrConfig: { ...previous.atrConfig, streamInterval: event.target.value }
                      }))
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>刷新节流 (s)</span>
                  <input
                    className={styles.input}
                    type="number"
                    min="1"
                    step="0.1"
                    value={form.atrConfig.updateThrottle}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        atrConfig: { ...previous.atrConfig, updateThrottle: event.target.value }
                      }))
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>止损倍数</span>
                  <input
                    className={styles.input}
                    type="number"
                    step="0.1"
                    value={form.atrConfig.multiplierSl}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        atrConfig: { ...previous.atrConfig, multiplierSl: event.target.value }
                      }))
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>止盈倍数</span>
                  <input
                    className={styles.input}
                    type="number"
                    step="0.1"
                    value={form.atrConfig.multiplierTp}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        atrConfig: { ...previous.atrConfig, multiplierTp: event.target.value }
                      }))
                    }
                  />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Delta 阈值</span>
                  <input
                    className={styles.input}
                    type="number"
                    step="0.01"
                    value={form.atrConfig.deltaThreshold}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        atrConfig: { ...previous.atrConfig, deltaThreshold: event.target.value }
                      }))
                    }
                  />
                </label>
              </div>
            </>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>仓位与亏损限制</h3>
          </div>
          {form.type === 'trailing' ? (
            <div className={styles.protectiveNotice}>
              <div className={styles.protectiveHeader}>
                <span className={styles.protectiveBadge}>保护性止损</span>
                <p className={styles.protectiveText}>
                  跟踪规则需要配合保护性止损阈值；系统会根据基准价、方向与仓位规模给出建议，
                  也可根据策略自行调整。
                </p>
              </div>
              <div className={styles.protectiveMetrics}>
                {recommendedLossAmountText ? (
                  <span className={styles.protectiveMetric}>
                    建议金额阈值：<strong>{recommendedLossAmountText}</strong>
                  </span>
                ) : null}
                {recommendedLossPercentText ? (
                  <span className={styles.protectiveMetric}>
                    建议比例阈值：<strong>{recommendedLossPercentText}</strong>
                  </span>
                ) : null}
                {!recommendedLossAmountText && !recommendedLossPercentText ? (
                  <span className={styles.protectiveMetricMuted}>
                    暂无法计算建议值，请补充基准价、仓位手数或回撤参数。
                  </span>
                ) : null}
              </div>
              <div className={styles.protectiveActions}>
                <button
                  type="button"
                  className={styles.protectiveApplyButton}
                  onClick={handleApplyRecommendedLossLimit}
                  disabled={!canApplyRecommendedLossLimit}
                  title={
                    canApplyRecommendedLossLimit
                      ? '使用系统建议的保护性止损阈值'
                      : '补充行情上下文后可计算建议阈值'
                  }
                >
                  使用建议值
                </button>
                <label className={styles.protectiveCheckbox}>
                  <input
                    type="checkbox"
                    checked={protectiveStopAcknowledged}
                    disabled={!hasLossLimitValue}
                    onChange={(event) => {
                      setProtectiveStopAcknowledged(event.target.checked);
                      if (event.target.checked) {
                        setLocalError(null);
                      }
                    }}
                  />
                  <span>我已确认保护性止损阈值</span>
                </label>
              </div>
              {!hasLossLimitValue ? (
                <p className={styles.protectiveHint}>填写金额或比例后方可确认。</p>
              ) : null}
            </div>
          ) : null}
          <div className={styles.gridThreeCols}>
            <label className={styles.field}>
              <span className={styles.label}>净头寸上限</span>
              <input
                className={styles.input}
                type="number"
                step="1"
                value={form.positionLimit.maxNet}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    positionLimit: { ...previous.positionLimit, maxNet: event.target.value }
                  }))
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>多头上限</span>
              <input
                className={styles.input}
                type="number"
                step="1"
                value={form.positionLimit.maxLong}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    positionLimit: { ...previous.positionLimit, maxLong: event.target.value }
                  }))
                }
              />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>空头上限</span>
              <input
                className={styles.input}
                type="number"
                step="1"
                value={form.positionLimit.maxShort}
                onChange={(event) =>
                  setForm((previous) => ({
                    ...previous,
                    positionLimit: { ...previous.positionLimit, maxShort: event.target.value }
                  }))
                }
              />
            </label>
          </div>
          <div className={styles.lossLimitGroup}>
            <div className={styles.lossLimitHeader}>
              <span className={styles.label}>未实现亏损阈值</span>
              <div className={styles.lossLimitToggleGroup}>
                <button
                  type="button"
                  className={clsx(
                    styles.lossLimitToggle,
                    form.lossLimit.mode === 'amount' ? styles.lossLimitToggleActive : null
                  )}
                  onClick={() => handleLossLimitModeChange('amount')}
                >
                  金额
                </button>
                <button
                  type="button"
                  className={clsx(
                    styles.lossLimitToggle,
                    form.lossLimit.mode === 'percent' ? styles.lossLimitToggleActive : null
                  )}
                  onClick={() => handleLossLimitModeChange('percent')}
                >
                  比例
                </button>
              </div>
            </div>
            <div className={styles.lossLimitInputRow}>
              <input
                className={styles.input}
                type="number"
                step={form.lossLimit.mode === 'amount' ? '0.01' : '0.0001'}
                value={
                  form.lossLimit.mode === 'amount'
                    ? form.lossLimit.amount
                    : form.lossLimit.percent
                }
                onChange={(event) => handleLossLimitValueChange(event.target.value)}
              />
              {form.lossLimit.mode === 'percent' ? (
                <span className={styles.lossLimitSuffix}>%</span>
              ) : null}
            </div>
            <span className={styles.hint}>
              {lossLimitModeHint}
              {recommendedLossAmountText ? ` · 建议金额：${recommendedLossAmountText}` : null}
              {recommendedLossPercentText ? ` · 建议比例：${recommendedLossPercentText}` : null}
              {lossLimitPerUnitText
                ? ` · 最高亏损金额（每合约/股）：${lossLimitPerUnitText}`
                : null}
            </span>
          </div>
        </section>

        <section className={styles.section}>
          <label className={clsx(styles.field, styles.notesField)}>
            <span className={styles.label}>备注</span>
            <textarea
              className={clsx(styles.input, styles.textarea)}
              rows={3}
              value={form.notes}
              placeholder="记录风控规则说明或执行条件"
              onChange={(event) =>
                setForm((previous) => ({ ...previous, notes: event.target.value }))
              }
            />
          </label>
        </section>

        {effectiveError ? <div className={styles.error}>{effectiveError}</div> : null}

        <div className={styles.footer}>
          <button
            type="button"
            className={clsx(styles.footerButton, styles.cancelButton)}
            onClick={onClose}
            disabled={submitting}
          >
            取消
          </button>
          <button
            type="submit"
            className={clsx(styles.footerButton, styles.submitButton)}
            disabled={submitting}
          >
            {submitting ? '保存中…' : rule ? '保存修改' : '新增规则'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default RiskRuleEditorModal;

