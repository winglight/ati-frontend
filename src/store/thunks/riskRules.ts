import { createAsyncThunk } from '@reduxjs/toolkit';
import type { RiskRuleItem } from '@features/dashboard/types';
import type { RootState } from '@store/index';
import {
  RiskApiError,
  createRiskRule as createRiskRuleRequest,
  updateRiskRule as updateRiskRuleRequest,
  mapRiskRule,
  type UpsertRiskRuleInput
} from '@services/riskApi';

const requireToken = (state: RootState): string => {
  const token = state.auth.token;
  if (!token) {
    throw new Error('当前会话未认证，请重新登录后再试。');
  }
  return token;
};

export interface SaveRiskRuleArgs extends UpsertRiskRuleInput {}

export const saveRiskRule = createAsyncThunk<
  RiskRuleItem,
  SaveRiskRuleArgs,
  { state: RootState }
>('risk/saveRiskRule', async (input, thunkAPI) => {
  const state = thunkAPI.getState();
  const token = requireToken(state);

  try {
    const response = input.ruleId
      ? await updateRiskRuleRequest(token, input.ruleId, input)
      : await createRiskRuleRequest(token, input);

    return mapRiskRule(response, undefined);
  } catch (error) {
    if (error instanceof RiskApiError) {
      throw new Error(error.message);
    }
    throw error;
  }
});

