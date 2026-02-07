import { createAsyncThunk } from '@reduxjs/toolkit';
import type { RiskRuleItem } from '@features/dashboard/types';
import type { RootState } from '@store/index';
import type { RiskEventItem, RiskMetricsSummary } from '@features/risk/types';
import {
  fetchRiskEvents,
  fetchRiskMetrics,
  fetchRiskRules,
  mapRiskEvents,
  mapRiskMetrics,
  mapRiskRules
} from '@services/riskApi';

export interface RiskOverviewPayload {
  rules: RiskRuleItem[];
  metrics: RiskMetricsSummary | null;
  events: RiskEventItem[];
}

export const loadRiskOverview = createAsyncThunk<
  RiskOverviewPayload,
  void,
  { state: RootState }
>('risk/loadOverview', async (_, thunkAPI) => {
  const token = thunkAPI.getState().auth.token;
  if (!token) {
    throw new Error('缺少访问令牌，无法加载风控数据');
  }

  const [rulesResponse, metricsResponse, eventsResponse] = await Promise.all([
    fetchRiskRules(token),
    fetchRiskMetrics(token),
    fetchRiskEvents(token, { limit: 30 })
  ]);

  const metrics = mapRiskMetrics(metricsResponse);
  const rules = mapRiskRules(rulesResponse.items ?? [], metrics.rules);
  const events = mapRiskEvents(eventsResponse.items ?? []);

  return {
    rules,
    metrics,
    events
  };
});
