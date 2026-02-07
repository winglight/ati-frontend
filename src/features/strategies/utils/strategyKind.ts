import { StrategyItem } from '../../dashboard/types';
import { DOM_KEYWORDS, KLINE_KEYWORDS, SCREENER_KEYWORDS, includesKeyword } from '../components/strategyKeywords';

export type StrategyKind = 'DOM' | 'Bar' | 'AI' | 'Screener';

export const resolveStrategyKind = (strategy: StrategyItem): StrategyKind | null => {
  if (typeof strategy.isKlineStrategy === 'boolean') {
    return strategy.isKlineStrategy ? 'Bar' : 'DOM';
  }
  const candidates: string[] = [];
  if (typeof strategy.templateId === 'string') candidates.push(strategy.templateId);
  if (typeof strategy.dataSource === 'string') candidates.push(strategy.dataSource);
  if (typeof strategy.filePath === 'string') candidates.push(strategy.filePath);
  if (Array.isArray(strategy.tags)) {
    candidates.push(
      ...strategy.tags.filter((tag): tag is string => typeof tag === 'string' && !!tag.trim())
    );
  }
  for (const raw of candidates) {
    const normalized = raw.trim().toLowerCase();
    if (!normalized) continue;
    if (includesKeyword(normalized, DOM_KEYWORDS)) return 'DOM';
    if (includesKeyword(normalized, KLINE_KEYWORDS)) return 'Bar';
    if (includesKeyword(normalized, SCREENER_KEYWORDS)) return 'Screener';
    if (normalized.includes('ai') || normalized.includes('ml') || normalized.includes('model')) return 'AI';
  }
  return null;
};

export const isScreenerStrategy = (strategy: StrategyItem | null): boolean => {
  if (!strategy) {
    return false;
  }
  if (strategy.templateId?.toLowerCase() === 'screener') {
    return true;
  }
  if (strategy.screenerProfile) {
    return true;
  }
  return resolveStrategyKind(strategy) === 'Screener';
};
