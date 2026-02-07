export const DOM_KEYWORDS = ['dom', 'depth'] as const;
export const KLINE_KEYWORDS = ['kline', 'candle', 'bar', 'mean_reversion'] as const;
export const SCREENER_KEYWORDS = ['screener', 'screen', 'scanner', 'scan'] as const;

export const includesKeyword = (value: string, keywords: readonly string[]): boolean => {
  if (!value) {
    return false;
  }
  const normalized = value.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword));
};
