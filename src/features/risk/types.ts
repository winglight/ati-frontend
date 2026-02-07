export type RiskFallbackMode = 'websocket' | 'http-polling';

export interface RiskActionItem {
  action: string;
  symbol: string;
  side?: string | null;
  quantity?: number | null;
  description?: string | null;
}

export interface RiskEventItem {
  id: string;
  ruleId: string;
  symbol: string;
  level: string;
  message: string;
  createdAt: string;
  metrics?: Record<string, number | string | null> | null;
  actions: RiskActionItem[];
}

export interface RiskRuleMetrics {
  events: number;
  lastEventAt?: string | null;
  levels: Record<string, number>;
  actions: Record<string, number>;
  metrics: Record<string, number>;
}

export interface RiskMetricsSummary {
  totalEvents: number;
  eventsByLevel: Record<string, number>;
  actions: Record<string, number>;
  lastEventAt?: string | null;
  trackedMetrics: Record<string, number>;
  rules: Record<string, RiskRuleMetrics>;
}
