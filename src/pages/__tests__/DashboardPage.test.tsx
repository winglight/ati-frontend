import { JSDOM } from 'jsdom';
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { act, cleanup, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import ServiceStatusPanel from '../../features/dashboard/components/ServiceStatusPanel';
import type {
  ManagedServiceRestartResult,
  ManagedServiceStatusEntry,
  ManagedServiceStatusResult
} from '../../services/systemApi';
import toastReducer from '@store/slices/toastSlice';
import authReducer from '@store/slices/authSlice';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/' });

const { window } = dom;

// Expose DOM globals required by React Testing Library and the component under test.
(globalThis as unknown as Record<string, unknown>).window = window;
(globalThis as unknown as Record<string, unknown>).document = window.document;
(globalThis as unknown as Record<string, unknown>).navigator = window.navigator;
(globalThis as unknown as Record<string, unknown>).HTMLElement = window.HTMLElement;
(globalThis as unknown as Record<string, unknown>).Node = window.Node;
(globalThis as unknown as Record<string, unknown>).MutationObserver = window.MutationObserver;
(globalThis as unknown as Record<string, unknown>).getComputedStyle = window.getComputedStyle.bind(window);
(globalThis as unknown as Record<string, unknown>).requestAnimationFrame =
  window.requestAnimationFrame?.bind(window) ?? ((cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16));
(globalThis as unknown as Record<string, unknown>).cancelAnimationFrame =
  window.cancelAnimationFrame?.bind(window) ?? ((id: number) => clearTimeout(id));

const recordedTimeouts = new Map<number, () => void>();
const nativeTimeouts = new Map<number, ReturnType<typeof setTimeout>>();
const recordedIntervals = new Map<number, () => void>();
const nativeIntervals = new Map<number, ReturnType<typeof setInterval>>();
let timerIdCounter = 1;

const installTimerShim = () => {
  const originalClearTimeout = window.clearTimeout.bind(window);
  const originalClearInterval = window.clearInterval.bind(window);

  window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    const id = timerIdCounter++;
    const callback = typeof handler === 'function' ? () => (handler as (...arguments_: unknown[]) => void)(...args) : () => {
       
      (0, eval)(handler as string);
    };
    if ((timeout ?? 0) > 50) {
      recordedTimeouts.set(id, callback);
      return id;
    }
    const native = setTimeout(callback, timeout ?? 0);
    nativeTimeouts.set(id, native);
    return id;
  }) as typeof window.setTimeout;

  window.clearTimeout = ((handle: number) => {
    if (recordedTimeouts.delete(handle)) {
      return;
    }
    const native = nativeTimeouts.get(handle);
    if (native != null) {
      clearTimeout(native);
      nativeTimeouts.delete(handle);
    } else {
      originalClearTimeout(handle);
    }
  }) as typeof window.clearTimeout;

  window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    const id = timerIdCounter++;
    const callback = typeof handler === 'function' ? () => (handler as (...arguments_: unknown[]) => void)(...args) : () => {
       
      (0, eval)(handler as string);
    };
    if ((timeout ?? 0) > 50) {
      recordedIntervals.set(id, callback);
      return id;
    }
    const native = setInterval(callback, timeout ?? 0);
    nativeIntervals.set(id, native);
    return id;
  }) as typeof window.setInterval;

  window.clearInterval = ((handle: number) => {
    if (recordedIntervals.delete(handle)) {
      return;
    }
    const native = nativeIntervals.get(handle);
    if (native != null) {
      clearInterval(native);
      nativeIntervals.delete(handle);
    } else {
      originalClearInterval(handle);
    }
  }) as typeof window.clearInterval;
};

installTimerShim();

class MockWebSocket extends window.EventTarget {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  static instances: MockWebSocket[] = [];
  static lastInstance: MockWebSocket | null = null;

  readonly url: string;
  readyState = MockWebSocket.CONNECTING;
  sentMessages: string[] = [];

  constructor(url: string) {
    super();
    this.url = url;
    MockWebSocket.instances.push(this);
    MockWebSocket.lastInstance = this;
  }

  send(data: string) {
    this.sentMessages.push(typeof data === 'string' ? data : String(data));
  }

  close(code = 1000, reason = '') {
    if (this.readyState === MockWebSocket.CLOSED) {
      return;
    }
    this.readyState = MockWebSocket.CLOSING;
    const closeEvent =
      typeof window.CloseEvent === 'function'
        ? new window.CloseEvent('close', { code, reason, wasClean: true })
        : new window.Event('close');
    super.dispatchEvent(closeEvent);
    this.readyState = MockWebSocket.CLOSED;
  }

  open() {
    if (this.readyState === MockWebSocket.OPEN) {
      return;
    }
    this.readyState = MockWebSocket.OPEN;
    super.dispatchEvent(new window.Event('open'));
  }

  emitMessage(data: string) {
    super.dispatchEvent(new window.MessageEvent('message', { data }));
  }

  emitError(message = 'error') {
    const errorEvent = new window.Event('error');
    (errorEvent as { message?: string }).message = message;
    super.dispatchEvent(errorEvent);
  }

  static reset() {
    MockWebSocket.instances = [];
    MockWebSocket.lastInstance = null;
  }
}

type Assertion = (condition: unknown, message: string) => asserts condition;

const assert: Assertion = (condition, message) => {
  if (!condition) {
    throw new Error(message);
  }
};

const flushPromises = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

const createStore = () =>
  configureStore({
    reducer: {
      toast: toastReducer,
      auth: authReducer
    }
  });

const createStatusEntry = (overrides: Partial<ManagedServiceStatusEntry> = {}): ManagedServiceStatusEntry => ({
  name: '风控引擎',
  status: 'online',
  healthy: true,
  lastChecked: '2024-05-01T12:00:00Z',
  latencyMs: 120,
  error: null,
  statusCode: 204,
  healthUrl: 'https://risk.example/healthz',
  logPath: '/var/log/risk-service.log',
  metadata: {
    restart_mode: 'docker',
    docker_container: 'risk-service'
  },
  restart: {
    mode: 'docker',
    available: true,
    reason: null,
    command: ['restart-risk'],
    dockerContainer: 'risk-service',
    dockerHost: 'http://docker-api.local:2375'
  },
  ...overrides
});

const createStatusResult = (entryOverrides: Partial<ManagedServiceStatusEntry> = {}): ManagedServiceStatusResult => ({
  services: [createStatusEntry(entryOverrides)],
  cache: {
    status: 'ready',
    lastUpdated: '2024-05-01T12:00:00Z',
    nextRefreshIn: 5,
    refreshInterval: 30,
    error: null
  }
});

(async () => {
  const fetchResponses: ManagedServiceStatusResult[] = [
    createStatusResult(),
    createStatusResult({
      status: 'degraded',
      healthy: false,
      error: '延迟过高',
      latencyMs: 250,
      statusCode: 500
    })
  ];

  const restartResult: ManagedServiceRestartResult = {
    service: '风控引擎',
    status: 'completed',
    succeeded: true,
    mode: 'docker',
    detail: 'Docker API 响应状态 204',
    command: ['docker-api', 'POST', 'http://docker-api.local:2375/containers/risk-service/restart'],
    returnCode: 0,
    stdout: '',
    stderr: '',
    durationMs: 1200,
    logPath: '/var/log/risk-service.log',
    statusCode: 204
  };

  const restartPath = `/services/${encodeURIComponent('风控引擎')}/restart`;
  const requestsLog: Array<{ method: string; url: string }> = [];
  let pendingRestartResolve: (() => void) | null = null;

  const originalFetch = globalThis.fetch;
  (globalThis as { fetch: typeof globalThis.fetch }).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' || input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET') ?? 'GET')
      .toUpperCase();

    if (method === 'POST' && url.endsWith(restartPath)) {
      requestsLog.push({ method, url });
      const buildResponse = () => ({
        ok: true,
        status: 200,
        async json() {
          return restartResult;
        },
        async text() {
          return JSON.stringify(restartResult);
        }
      });
      return new Promise((resolve) => {
        pendingRestartResolve = () => resolve(buildResponse() as unknown as Response);
      }) as Promise<Response>;
    }

    throw new Error(`unexpected fetch call: ${method} ${url}`);
  };

  const originalWebSocket = window.WebSocket;
  (window as unknown as { WebSocket: typeof WebSocket }).WebSocket = MockWebSocket as unknown as typeof WebSocket;
  (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = MockWebSocket as unknown as typeof WebSocket;
  MockWebSocket.reset();

  const user = userEvent.setup({ document: window.document });
  const container = window.document.createElement('div');
  window.document.body.appendChild(container);
  const store = createStore();
  const view = render(
    <Provider store={store}>
      <ServiceStatusPanel />
    </Provider>,
    { container }
  );

  await act(async () => {
    await flushPromises();
  });

  const socket = (() => {
    const instance = MockWebSocket.lastInstance;
    assert(instance, 'WebSocket should be created when component mounts');
    return instance;
  })();

  await act(async () => {
    socket.open();
    await flushPromises();
  });

  const initialMessages = socket.sentMessages.map((raw) => {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch (_error) {
      return null;
    }
  });
  assert(
    initialMessages.some((message) => message?.action === 'subscribe'),
    'should request websocket subscription on open'
  );
  assert(
    initialMessages.some((message) => message?.action === 'services.refresh'),
    'should request initial refresh via websocket'
  );

  await act(async () => {
    socket.emitMessage(
      JSON.stringify({ type: 'event', event: 'services.status', payload: fetchResponses[0] })
    );
    await flushPromises();
  });

  const triggerButton = view.getByLabelText('服务状态');
  await user.click(triggerButton);

  const serviceName = await view.findByText('风控引擎');
  assert(serviceName, 'service name should be rendered');
  assert(view.getByText('在线'), 'status badge should render online label');
  const serviceRowButton = serviceName.closest('button');
  assert(serviceRowButton, 'service row button should be available for expansion');
  await user.click(serviceRowButton as HTMLButtonElement);
  assert(view.getByText('restart_mode'), 'restart metadata label should be visible');

  assert(
    !requestsLog.some((entry) => entry.method === 'GET'),
    'should not perform HTTP polling for service status'
  );

  const refreshButton = view.getByRole('button', { name: '刷新' });
  await user.click(refreshButton);

  const lastSentRaw = socket.sentMessages[socket.sentMessages.length - 1] ?? '';
  const lastSentMessage = lastSentRaw ? (JSON.parse(lastSentRaw) as Record<string, unknown>) : null;
  assert(lastSentMessage?.action === 'services.refresh', 'manual refresh should request websocket refresh');

  await act(async () => {
    socket.emitMessage(
      JSON.stringify({ type: 'event', event: 'services.status', payload: fetchResponses[1] })
    );
    await flushPromises();
  });

  const degradedBadges = await view.findAllByText('性能下降');
  assert(degradedBadges.length >= 1, 'degraded status badge should appear after refresh');

  const restartButton = view.getByRole('button', { name: '重启服务' });
  assert(!restartButton.hasAttribute('disabled'), 'restart button should be enabled');

  await user.click(restartButton);
  assert(
    requestsLog.some((entry) => entry.method === 'POST' && entry.url.endsWith(restartPath)),
    'should call restart API with service name'
  );
  assert(view.getByRole('button', { name: '重启中…' }), 'button label should indicate loading');

  await act(async () => {
    assert(pendingRestartResolve, 'restart promise should be pending');
    pendingRestartResolve?.();
    pendingRestartResolve = null;
    await flushPromises();
  });

  assert(view.getByText(/重启成功/), 'success message should be rendered');
  assert(view.getByText(/Docker API 响应状态 204/), 'restart detail should include response status');

  await cleanup();
  (globalThis as { fetch: typeof globalThis.fetch }).fetch = originalFetch;
  (window as unknown as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket;
  (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = originalWebSocket;
  MockWebSocket.reset();
})();
