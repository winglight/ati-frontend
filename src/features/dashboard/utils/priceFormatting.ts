const INDEX_TICK_VALUES: Record<string, number> = {
  ES: 50,
  MES: 5,
  NQ: 20,
  MNQ: 2,
  YM: 5,
  MYM: 0.5,
  RTY: 5,
  M2K: 5,
  NKD: 5,
  NIY: 5,
  DAX: 25,
  FDAX: 25,
  FDXM: 5,
  FESX: 10,
  IF: 300,
  IH: 300,
  IC: 200,
  IM: 200,
  // Crypto futures (contract unit per $1 move)
  BTC: 5,
  MBT: 0.1,
  ETH: 50,
  MET: 0.1
};

const DEFAULT_TICK_SIZES: Record<string, number> = {
  ES: 0.25,
  MES: 0.25,
  NQ: 0.25,
  MNQ: 0.25,
  YM: 1,
  MYM: 1,
  RTY: 0.1,
  M2K: 0.1,
  NKD: 5,
  NIY: 5,
  DAX: 0.5,
  FDAX: 0.5,
  FDXM: 0.5,
  FESX: 0.5,
  IF: 0.2,
  IH: 0.2,
  IC: 0.2,
  IM: 0.2,
  // Crypto futures default tick sizes (CME specs)
  BTC: 5,
  MBT: 5,
  ETH: 0.5,
  MET: 0.5
};

export function extractRootSymbol(symbol: string | null | undefined) {
  if (!symbol) {
    return '';
  }
  const trimmed = symbol.trim().toUpperCase();
  if (!trimmed) {
    return '';
  }
  // Pattern: <root alphanumeric><month letter><year digit...>
  // Examples: ESM4 -> root ES, M2KZ5 -> root M2K
  const m = trimmed.match(/^([A-Z0-9]+?)([FGHJKMNQUVXZ])\d/);
  if (m) {
    return m[1];
  }
  // Fallback: take leading alphanumerics as root
  const head = trimmed.match(/^([A-Z0-9]+)/);
  return head ? head[1] : '';
}

export function getTickValue(symbol: string | null | undefined) {
  const root = extractRootSymbol(symbol);
  return INDEX_TICK_VALUES[root] ?? 1;
}

export interface PriceNormalizationOptions {
  tickSize?: number | null;
  tickValue?: number | null;
  reference?: number | null;
  allowDownscale?: boolean | null;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const resolveTickSize = (symbol: string | null | undefined, explicit?: number | null) => {
  if (explicit != null && explicit > 0) {
    return explicit;
  }
  const root = extractRootSymbol(symbol);
  return DEFAULT_TICK_SIZES[root] ?? null;
};

export function normalizePriceByTick(
  value: number | null | undefined,
  symbol: string | null | undefined,
  options: PriceNormalizationOptions = {}
): number | null {
  if (!isFiniteNumber(value)) {
    return null;
  }

  const tickSize = resolveTickSize(symbol, options.tickSize);
  if (!tickSize || tickSize <= 0) {
    return value;
  }

  const tickValue = options.tickValue ?? getTickValue(symbol);
  const reference = isFiniteNumber(options.reference) ? Math.abs(options.reference) : null;
  const allowDownscale = Boolean(options.allowDownscale);

  let normalized = value;

  if (reference) {
    const absoluteValue = Math.abs(value);
    const sign = value >= 0 ? 1 : -1;
    const candidateSet = new Set<number>([absoluteValue]);

    const consider = (candidate: number | null | undefined) => {
      if (!isFiniteNumber(candidate)) {
        return;
      }
      const absolute = Math.abs(candidate);
      if (!absolute) {
        return;
      }
      if (absolute > absoluteValue * 200) {
        return;
      }
      if (absolute < absoluteValue / 200) {
        return;
      }
      candidateSet.add(absolute);
    };

    const ensureFactor = (factor: number | null | undefined) => {
      if (!isFiniteNumber(factor)) {
        return null;
      }
      const magnitude = Math.abs(factor);
      if (magnitude <= 1) {
        return null;
      }
      return magnitude;
    };

    const registerFactor = (factor: number | null | undefined) => {
      const magnitude = ensureFactor(factor);
      if (!magnitude) {
        return { magnitude: null };
      }
      consider(absoluteValue * magnitude);
      if (allowDownscale) {
        consider(absoluteValue / magnitude);
      }
      return { magnitude };
    };

    const { magnitude: primaryFactor } = registerFactor(tickSize > 1 ? tickSize : 1 / tickSize);
    const { magnitude: secondaryFactor } = registerFactor(tickValue);


    if (primaryFactor && secondaryFactor) {
      const combined = ensureFactor(primaryFactor * secondaryFactor);
      if (combined) {
        consider(absoluteValue * combined);
        if (allowDownscale) {
          consider(absoluteValue / combined);
        }
      }
    }

    let best = absoluteValue;
    let bestError = Math.abs(absoluteValue - reference);

    for (const candidate of candidateSet) {
      const error = Math.abs(candidate - reference);
      if (error < bestError * 0.4) {
        best = candidate;
        bestError = error;
      }
    }

    normalized = sign * best;
  }

  if (tickSize > 0) {
    const snapped = Math.round(normalized / tickSize) * tickSize;
    if (isFiniteNumber(snapped)) {
      normalized = Number(snapped.toFixed(6));
    }
  }

  return normalized;
}

export function formatPriceWithTick(
  value: number | null | undefined,
  symbol: string | null | undefined,
  options: PriceNormalizationOptions = {}
) {
  const normalized = normalizePriceByTick(value, symbol, options);
  if (normalized == null || Number.isNaN(normalized)) {
    return '-';
  }
  return normalized.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export { resolveTickSize };
