import { configureStore } from '@reduxjs/toolkit';
import accountReducer from './slices/accountSlice';
import authReducer from './slices/authSlice';
import marketReducer from './slices/marketSlice';
import notificationsReducer from './slices/notificationsSlice';
import notificationSettingsReducer from './slices/notificationSettingsSlice';
import ordersReducer from './slices/ordersSlice';
import realtimeReducer from './slices/realtimeSlice';
import riskReducer from './slices/riskSlice';
import strategiesReducer from './slices/strategiesSlice';
import uiReducer from './slices/uiSlice';
import documentationReducer from './slices/documentationSlice';
import systemReducer from './slices/systemSlice';
import logsReducer from './slices/logsSlice';
import monitorReducer from './slices/monitorSlice';
import toastReducer from './slices/toastSlice';
 

export const store = configureStore({
  reducer: {
    ui: uiReducer,
    auth: authReducer,
    account: accountReducer,
    orders: ordersReducer,
    risk: riskReducer,
    strategies: strategiesReducer,
    notifications: notificationsReducer,
    notificationSettings: notificationSettingsReducer,
    market: marketReducer,
    realtime: realtimeReducer,
    documentation: documentationReducer,
    system: systemReducer,
    logs: logsReducer,
    monitor: monitorReducer,
    toast: toastReducer
  }
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
export type AppStore = typeof store;
