import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Provider } from 'react-redux';
import App from './App';
import { store } from './store';
import '@styles/global.css';
import './i18n';

const globalWithEnv = globalThis as typeof globalThis & {
  __VITE_ENV__?: Record<string, unknown>;
};

const runtimeEnv = import.meta.env as unknown as Record<string, unknown>;
globalWithEnv.__VITE_ENV__ = {
  ...globalWithEnv.__VITE_ENV__,
  ...runtimeEnv
};

console.log("VITE_API_BASE_URL =", import.meta.env.VITE_API_BASE_URL);
console.log("VITE_WS_URL =", import.meta.env.VITE_WS_URL);
console.log("MODE =", import.meta.env.MODE);

const globalWithFlags = globalThis as typeof globalThis & { __ALGOTRADER_SKIP_AUTH__?: boolean };
globalWithFlags.__ALGOTRADER_SKIP_AUTH__ = false;

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <App />
      </BrowserRouter>
    </Provider>
  </React.StrictMode>
);
