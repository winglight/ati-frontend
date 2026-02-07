export const computeFixedRrTargets = ({
  entryPrice,
  side,
  riskAmount,
  rrRatio
}: {
  entryPrice: number | null;
  side: 'BUY' | 'SELL' | null;
  riskAmount: number | null;
  rrRatio: number | null;
}): { sl: number | null; tp: number | null } => {
  if (entryPrice === null || !side || riskAmount === null || rrRatio === null) {
    return { sl: null, tp: null };
  }
  const direction = side === 'BUY' ? 1 : -1;
  const riskDelta = Math.abs(riskAmount);
  const rr = Math.max(rrRatio, 0);
  const sl = entryPrice - direction * riskDelta;
  const tp = entryPrice + direction * riskDelta * rr;
  return { sl, tp };
};
