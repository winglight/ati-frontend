const FALLBACK_STOP_LOSS_RATIO = 0.05;
const FALLBACK_TAKE_PROFIT_RATIO = 0.05;
const FALLBACK_DEFAULT_LEVERAGE = 1;
const FALLBACK_FUTURES_LEVERAGE = 20;
const FALLBACK_LEVERAGE_OVERRIDES: Record<string, number> = {
  ES: 20,
  MES: 20,
  NQ: 20,
  MNQ: 20,
  YM: 20,
  MYM: 20,
  RTY: 20,
  M2K: 20,
  VX: 10
};

export interface RiskDefaults {
  stopLossRatio: number;
  takeProfitRatio: number;
  leverageIndexDefault: number;
  leverageOverrides: Record<string, number>;
}

const extractRootSymbol = (symbol: string | null | undefined): string | null => {
  if (!symbol) {
    return null;
  }
  const match = symbol.match(/^[A-Za-z]+/);
  return match ? match[0].toUpperCase() : symbol.toUpperCase();
};

const isLikelyFuturesSymbol = (symbol: string): boolean => {
  if (!symbol) {
    return false;
  }
  if (/\/|\./.test(symbol)) {
    return false;
  }
  return /\d/.test(symbol);
};

export interface RiskRatioConfig {
  stopLossRatio: number;
  takeProfitRatio: number;
  defaultLeverage: number;
  futuresLeverage: number;
  leverageOverrides: Record<string, number>;
}

export const getRiskRatioConfig = (defaults?: RiskDefaults | null): RiskRatioConfig => {
  const stopLossRatio = Math.abs(defaults?.stopLossRatio ?? FALLBACK_STOP_LOSS_RATIO);
  const takeProfitRatio = Math.abs(defaults?.takeProfitRatio ?? FALLBACK_TAKE_PROFIT_RATIO);
  const defaultLeverage = defaults?.leverageIndexDefault ?? FALLBACK_DEFAULT_LEVERAGE;
  const futuresLeverage = defaults?.leverageIndexDefault ?? FALLBACK_FUTURES_LEVERAGE;
  const leverageOverrides = {
    ...(defaults?.leverageOverrides ?? FALLBACK_LEVERAGE_OVERRIDES)
  };

  return {
    stopLossRatio,
    takeProfitRatio,
    defaultLeverage: defaultLeverage > 0 ? defaultLeverage : FALLBACK_DEFAULT_LEVERAGE,
    futuresLeverage: futuresLeverage > 0 ? futuresLeverage : FALLBACK_FUTURES_LEVERAGE,
    leverageOverrides
  };
};

export const getLeverageForSymbol = (
  symbol: string | null | undefined,
  defaults?: RiskDefaults | null
): number => {
  const config = getRiskRatioConfig(defaults);
  const root = extractRootSymbol(symbol);
  if (root && config.leverageOverrides[root]) {
    return config.leverageOverrides[root];
  }
  if (typeof symbol === 'string' && isLikelyFuturesSymbol(symbol)) {
    return config.futuresLeverage;
  }
  return config.defaultLeverage;
};

export interface RiskTargetComputationInput {
  symbol: string;
  avgPrice: number;
  direction: 'long' | 'short';
}

export interface RiskTargetComputationResult {
  stopLossPrice: number;
  takeProfitPrice: number;
  stopLossOffset: number;
  takeProfitOffset: number;
  leverage: number;
  stopLossRatio: number;
  takeProfitRatio: number;
}

export const getDirectionSign = (direction: 'long' | 'short'): 1 | -1 => {
  return direction === 'short' ? -1 : 1;
};

export const priceFromDirectionalOffset = (
  basePrice: number,
  offset: number,
  direction: 'long' | 'short'
): number => {
  return basePrice + offset * getDirectionSign(direction);
};

export const directionalOffsetFromPrice = (
  basePrice: number,
  targetPrice: number,
  direction: 'long' | 'short'
): number => {
  return (targetPrice - basePrice) * getDirectionSign(direction);
};

export const computeRiskTargets = (
  input: RiskTargetComputationInput,
  defaults?: RiskDefaults | null
): RiskTargetComputationResult | null => {
  if (!input || !Number.isFinite(input.avgPrice) || input.avgPrice <= 0) {
    return null;
  }
  const config = getRiskRatioConfig(defaults);
  const leverage = getLeverageForSymbol(input.symbol, defaults);
  const safeLeverage = leverage > 0 ? leverage : 1;

  const stopLossPercent = config.stopLossRatio / safeLeverage;
  const takeProfitPercent = config.takeProfitRatio / safeLeverage;

  const directionSign = input.direction === 'short' ? -1 : 1;

  const stopLossPrice = input.avgPrice * (1 - directionSign * stopLossPercent);
  const takeProfitPrice = input.avgPrice * (1 + directionSign * takeProfitPercent);

  const stopLossOffset = directionalOffsetFromPrice(
    input.avgPrice,
    stopLossPrice,
    input.direction
  );
  const takeProfitOffset = directionalOffsetFromPrice(
    input.avgPrice,
    takeProfitPrice,
    input.direction
  );

  return {
    stopLossPrice,
    takeProfitPrice,
    stopLossOffset,
    takeProfitOffset,
    leverage: safeLeverage,
    stopLossRatio: config.stopLossRatio,
    takeProfitRatio: config.takeProfitRatio
  };
};

export const computeExpectedPnl = (
  basePrice: number | null | undefined,
  targetPrice: number | null | undefined,
  quantity: number | null | undefined,
  direction: 'long' | 'short' | null | undefined,
  multiplier: number | null | undefined = 1
): number | null => {
  if (
    basePrice == null ||
    targetPrice == null ||
    quantity == null ||
    !Number.isFinite(basePrice) ||
    !Number.isFinite(targetPrice) ||
    !Number.isFinite(quantity) ||
    quantity === 0
  ) {
    return null;
  }
  const signedQuantity = direction === 'short' ? -Math.abs(quantity) : Math.abs(quantity);
  const effectiveMultiplier =
    multiplier != null && Number.isFinite(multiplier) && Math.abs(multiplier) > 0
      ? Math.abs(multiplier)
      : 1;
  return (targetPrice - basePrice) * signedQuantity * effectiveMultiplier;
};
