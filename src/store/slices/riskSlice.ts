import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RiskRuleItem } from '@features/dashboard/types';
import type {
  RiskEventItem,
  RiskMetricsSummary,
  RiskRuleMetrics,
  RiskFallbackMode
} from '@features/risk/types';
import { initializeDashboard } from '@store/thunks/initializeDashboard';
import { loadRiskOverview } from '@store/thunks/loadRiskOverview';
import { saveRiskRule } from '@store/thunks/riskRules';

export type RequestStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

interface RiskState {
  rules: RiskRuleItem[];
  metrics: RiskMetricsSummary | null;
  events: RiskEventItem[];
  status: RequestStatus;
  fallbackMode: RiskFallbackMode;
  error?: string;
  saveStatus: RequestStatus;
  saveError?: string;
  lastSavedRuleId?: string;
}

const initialState: RiskState = {
  rules: [],
  metrics: null,
  events: [],
  status: 'idle',
  fallbackMode: 'websocket',
  saveStatus: 'idle'
};

const upsertRule = (rules: RiskRuleItem[], rule: RiskRuleItem) => {
  const index = rules.findIndex((item) => item.id === rule.id);
  if (index === -1) {
    rules.push(rule);
    return;
  }
  rules[index] = rule;
};

const applyRuleMetrics = (
  rules: RiskRuleItem[],
  metrics: Record<string, RiskRuleMetrics>
) => {
  for (const rule of rules) {
    const entry = metrics[rule.id];
    if (entry) {
      rule.metrics = entry;
    }
  }
};

const sortEvents = (events: RiskEventItem[]): RiskEventItem[] => {
  return [...events].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
};

const riskSlice = createSlice({
  name: 'risk',
  initialState,
  reducers: {
    setRiskRules(state, action: PayloadAction<RiskRuleItem[]>) {
      state.rules = action.payload;
    },
    upsertRiskRule(state, action: PayloadAction<RiskRuleItem>) {
      upsertRule(state.rules, action.payload);
    },
    removeRiskRule(state, action: PayloadAction<string>) {
      state.rules = state.rules.filter((rule) => rule.id !== action.payload);
    },
    setRiskMetrics(state, action: PayloadAction<RiskMetricsSummary | null>) {
      state.metrics = action.payload;
      if (action.payload) {
        applyRuleMetrics(state.rules, action.payload.rules);
      }
    },
    setRiskEvents(state, action: PayloadAction<RiskEventItem[]>) {
      state.events = sortEvents(action.payload).slice(0, 50);
    },
    pushRiskEvent(state, action: PayloadAction<RiskEventItem>) {
      const events = [action.payload, ...state.events];
      const unique = new Map(events.map((event) => [event.id, event]));
      state.events = sortEvents(Array.from(unique.values())).slice(0, 50);
    },
    setRiskFallbackMode(state, action: PayloadAction<RiskFallbackMode>) {
      state.fallbackMode = action.payload;
    },
    resetRiskRuleSave(state) {
      state.saveStatus = 'idle';
      state.saveError = undefined;
      state.lastSavedRuleId = undefined;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(initializeDashboard.pending, (state) => {
        state.status = 'loading';
        state.error = undefined;
      })
      .addCase(initializeDashboard.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.rules = action.payload.snapshot.riskRules;
        if (state.metrics) {
          applyRuleMetrics(state.rules, state.metrics.rules);
        }
      })
      .addCase(initializeDashboard.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message;
      })
      .addCase(loadRiskOverview.pending, (state) => {
        state.status = 'loading';
        state.error = undefined;
      })
      .addCase(loadRiskOverview.fulfilled, (state, action) => {
        state.status = 'succeeded';
        state.rules = action.payload.rules;
        state.metrics = action.payload.metrics;
        if (action.payload.metrics) {
          applyRuleMetrics(state.rules, action.payload.metrics.rules);
        }
        state.events = sortEvents(action.payload.events).slice(0, 50);
      })
      .addCase(loadRiskOverview.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.error.message;
      })
      .addCase(saveRiskRule.pending, (state) => {
        state.saveStatus = 'loading';
        state.saveError = undefined;
      })
      .addCase(saveRiskRule.fulfilled, (state, action) => {
        state.saveStatus = 'succeeded';
        state.lastSavedRuleId = action.payload.id;
        upsertRule(state.rules, action.payload);
      })
      .addCase(saveRiskRule.rejected, (state, action) => {
        state.saveStatus = 'failed';
        state.saveError = action.error.message;
      });
  }
});

export const {
  setRiskRules,
  upsertRiskRule,
  removeRiskRule,
  setRiskMetrics,
  setRiskEvents,
  pushRiskEvent,
  setRiskFallbackMode,
  resetRiskRuleSave
} = riskSlice.actions;

export default riskSlice.reducer;
