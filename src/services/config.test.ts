const assertEqual = (actual: unknown, expected: unknown, message: string): void => {
  if (actual !== expected) {
    throw new Error(`${message}\nExpected: ${expected}\nReceived: ${actual}`);
  }
};

const resetRuntimeConfig = () => {
  delete (globalThis as { __ALGOTRADER_RUNTIME_CONFIG__?: unknown }).__ALGOTRADER_RUNTIME_CONFIG__;
};

const withRuntimeConfig = (config: Record<string, unknown>, callback: () => void) => {
  const globalObject = globalThis as { __ALGOTRADER_RUNTIME_CONFIG__?: Record<string, unknown> };
  const previous = globalObject.__ALGOTRADER_RUNTIME_CONFIG__;
  globalObject.__ALGOTRADER_RUNTIME_CONFIG__ = config;
  try {
    callback();
  } finally {
    if (previous === undefined) {
      delete globalObject.__ALGOTRADER_RUNTIME_CONFIG__;
    } else {
      globalObject.__ALGOTRADER_RUNTIME_CONFIG__ = previous;
    }
  }
};

import { resolveWsUrl } from './config.js';

resetRuntimeConfig();

withRuntimeConfig({ wsBaseUrl: 'ws://localhost:8000/ws/events' }, () => {
  const resolved = resolveWsUrl('/ws/events');
  assertEqual(
    resolved,
    'ws://localhost:8000/ws/events',
    'should not duplicate the path when wsBaseUrl already includes the endpoint'
  );
});

withRuntimeConfig({ wsBaseUrl: 'ws://localhost:8000/custom' }, () => {
  const resolved = resolveWsUrl('/ws/events');
  assertEqual(
    resolved,
    'ws://localhost:8000/custom/ws/events',
    'should append the websocket path when wsBaseUrl points to a custom base path'
  );
});

withRuntimeConfig({ wsBaseUrl: 'http://localhost:8000/api' }, () => {
  const resolved = resolveWsUrl('/ws/events');
  assertEqual(
    resolved,
    'ws://localhost:8000/ws/events',
    'should convert http base url to websocket protocol with api suffix removed'
  );
});

resetRuntimeConfig();
