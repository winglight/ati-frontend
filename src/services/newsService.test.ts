const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const globalContext = globalThis as typeof globalThis & {
  window?: Window & typeof globalThis;
  name?: string;
};

if (typeof globalContext.name !== 'string') {
  globalContext.name = '';
}
if (!globalContext.window) {
  globalContext.window = globalContext as Window & typeof globalThis;
}

import type { WebSocketSubscription } from './websocketHub.js';
import { newsServiceDependencies, subscribeToNewsEvents } from './newsService.js';

const originalSubscribeWebSocket = newsServiceDependencies.subscribeWebSocket;

// Test: subscription sends default topics plus custom ones and unsubscribes on dispose
{
  const sentMessages: unknown[] = [];
  let disposeCalled = false;
  let socketOpen = true;
  let onOpenHandler: ((event: Event) => void) | undefined;

  newsServiceDependencies.subscribeWebSocket = ((options) => {
    onOpenHandler = options.onOpen as ((event: Event) => void) | undefined;
    const handle: WebSocketSubscription = {
      send: (message: unknown) => {
        sentMessages.push(message);
        return true;
      },
      isOpen: () => socketOpen,
      dispose: () => {
        disposeCalled = true;
        socketOpen = false;
      }
    };
    return handle;
  }) as typeof originalSubscribeWebSocket;

  try {
    const subscription = subscribeToNewsEvents({
      tokenProvider: () => 'token-123',
      topics: [' custom.topic ', 'news_service.signals'],
      onEvent: () => {
        /* noop */
      }
    });

    onOpenHandler?.({} as Event);

    assert(sentMessages.length === 1, 'should send subscription payload when socket opens');
    const subscribePayload = sentMessages[0] as { action: string; topics: string[] };
    assert(subscribePayload.action === 'subscribe', 'subscription payload should set action to subscribe');
    assert(
      subscribePayload.topics.includes('news_service.signals'),
      'subscription payload should include news_service.signals'
    );
    assert(
      subscribePayload.topics.includes('news_service.model.activated'),
      'subscription payload should include news_service.model.activated'
    );
    assert(
      subscribePayload.topics.includes('custom.topic'),
      'subscription payload should include provided custom topics'
    );
    assert(
      new Set(subscribePayload.topics).size === subscribePayload.topics.length,
      'subscription topics should be deduplicated'
    );

    subscription.dispose();

    assert(disposeCalled, 'dispose should forward to underlying subscription');
    assert(sentMessages.length === 2, 'dispose should trigger unsubscribe payload');
    const unsubscribePayload = sentMessages[1] as { action: string; topics: string[] };
    assert(unsubscribePayload.action === 'unsubscribe', 'unsubscribe payload should set action to unsubscribe');
    assert(
      unsubscribePayload.topics.includes('news_service.signals'),
      'unsubscribe payload should include news_service.signals'
    );
    assert(
      unsubscribePayload.topics.includes('news_service.model.activated'),
      'unsubscribe payload should include news_service.model.activated'
    );
    assert(
      unsubscribePayload.topics.includes('custom.topic'),
      'unsubscribe payload should include provided custom topics'
    );
  } finally {
    newsServiceDependencies.subscribeWebSocket = originalSubscribeWebSocket;
  }
}

// Test: subscription failure logs warning
{
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  let onOpenHandler: ((event: Event) => void) | undefined;

  newsServiceDependencies.subscribeWebSocket = ((options) => {
    onOpenHandler = options.onOpen as ((event: Event) => void) | undefined;
    const handle: WebSocketSubscription = {
      send: () => false,
      isOpen: () => true,
      dispose: () => undefined
    };
    return handle;
  }) as typeof originalSubscribeWebSocket;

  console.warn = ((...args: unknown[]) => {
    warnings.push(args);
  }) as typeof console.warn;

  try {
    const subscription = subscribeToNewsEvents({ tokenProvider: () => 'token-abc' });
    onOpenHandler?.({} as Event);
    assert(
      warnings.some((entry) => typeof entry[0] === 'string' && entry[0].includes('发送订阅请求失败')),
      'subscribe failure should log warning'
    );
    subscription.dispose();
  } finally {
    newsServiceDependencies.subscribeWebSocket = originalSubscribeWebSocket;
    console.warn = originalWarn;
  }
}

// Test: unsubscribe failure logs warning
{
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  let sendInvocation = 0;
  let socketOpen = true;
  let onOpenHandler: ((event: Event) => void) | undefined;

  newsServiceDependencies.subscribeWebSocket = ((options) => {
    onOpenHandler = options.onOpen as ((event: Event) => void) | undefined;
    const handle: WebSocketSubscription = {
      send: () => {
        sendInvocation += 1;
        return sendInvocation === 1;
      },
      isOpen: () => socketOpen,
      dispose: () => {
        socketOpen = false;
      }
    };
    return handle;
  }) as typeof originalSubscribeWebSocket;

  console.warn = ((...args: unknown[]) => {
    warnings.push(args);
  }) as typeof console.warn;

  try {
    const subscription = subscribeToNewsEvents({ tokenProvider: () => 'token-def' });
    onOpenHandler?.({} as Event);
    subscription.dispose();
    assert(
      warnings.some((entry) => typeof entry[0] === 'string' && entry[0].includes('发送取消订阅请求失败')),
      'unsubscribe failure should log warning'
    );
  } finally {
    newsServiceDependencies.subscribeWebSocket = originalSubscribeWebSocket;
    console.warn = originalWarn;
  }
}
