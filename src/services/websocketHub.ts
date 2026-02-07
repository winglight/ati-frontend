import { resolveWsUrl } from './config.js';

export const MANAGED_WS_HEARTBEAT_INTERVAL_MS = 30000;
const DEBUG_LOGGING_ENABLED = Boolean(import.meta?.env?.DEV);

const AUTH_FAILURE_CLOSE_CODES = new Set([1008, 4401, 4403]);
const AUTH_FAILURE_REASON_PATTERN = /token (?:expired|invalid)|authentication failed/i;

export const isAuthenticationFailureCloseEvent = (event: CloseEvent | null | undefined): boolean => {
  if (!event) {
    return false;
  }
  if (AUTH_FAILURE_CLOSE_CODES.has(event.code)) {
    return true;
  }
  if (!event.reason) {
    return false;
  }
  return AUTH_FAILURE_REASON_PATTERN.test(event.reason);
};

type MessageHandler = (data: string) => void;

type EventHandler = (event: Event) => void;

type CloseHandler = (event: CloseEvent) => void;

type TokenProvider = () => string | null;

interface SubscriberHandlers {
  tokenProvider: TokenProvider;
  onOpen?: EventHandler;
  onMessage?: MessageHandler;
  onError?: EventHandler;
  onClose?: CloseHandler;
}

interface SubscribeOptions extends Omit<SubscriberHandlers, 'tokenProvider'> {
  name: string;
  path?: string;
  tokenProvider: TokenProvider;
}

export interface WebSocketSubscription {
  send: (message: unknown) => boolean;
  isOpen: () => boolean;
  dispose: () => void;
}

interface ManagedSubscriber extends SubscriberHandlers {
  id: number;
}

class ManagedWebSocket {
  private readonly name: string;

  private readonly path: string;

  private socket: WebSocket | null = null;

  private subscribers = new Map<number, ManagedSubscriber>();

  private nextSubscriberId = 1;

  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly baseReconnectDelay = 5000;

  private reconnectDelayMs = this.baseReconnectDelay;

  private readonly maxReconnectDelay = 60000;

  private readonly failureCooldownMs = 60000;

  private consecutiveFailures = 0;

  private hadSuccessfulOpen = false;

  private failureCooldownTimer: number | null = null;

  private lastResolvedToken: string | null = null;

  private inFailureCooldown = false;

  private heartbeatTimer: number | null = null;

  private readonly heartbeatInterval = MANAGED_WS_HEARTBEAT_INTERVAL_MS;

  private shouldReconnect = true;

  constructor(name: string, path: string) {
    this.name = name;
    this.path = path;
    this.log('constructed with path', path);
  }

  subscribe(handlers: SubscriberHandlers): WebSocketSubscription {
    this.log('registering subscriber', this.nextSubscriberId);
    const id = this.nextSubscriberId++;
    const managed: ManagedSubscriber = { id, ...handlers };
    this.subscribers.set(id, managed);
    this.ensureConnection();
    if (this.isOpen()) {
      const invoke = () => {
        const subscriber = this.subscribers.get(id);
        if (subscriber?.onOpen) {
          subscriber.onOpen(new Event('open'));
        }
      };
      if (typeof queueMicrotask === 'function') {
        queueMicrotask(invoke);
      } else {
        globalThis.setTimeout(invoke, 0);
      }
    }
    return {
      send: (message: unknown) => this.send(message),
      isOpen: () => this.isOpen(),
      dispose: () => {
        this.removeSubscriber(id);
      }
    };
  }

  private ensureConnection() {
    this.log('ensureConnection invoked with socket state', this.socket?.readyState);
    if (this.socket && (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)) {
      this.log('socket already open or connecting, skipping new connection');
      return;
    }
    this.log('opening socket');
    this.open();
  }

  private open() {
    if (this.socket) {
      this.log('open called but socket already exists, aborting');
      return;
    }

    this.log('resolving token for connection');
    const token = this.resolveToken();
    if (!token) {
      this.log('no token available, scheduling reconnect');
      this.scheduleReconnect();
      return;
    }

    if (this.lastResolvedToken !== token) {
      this.resetFailureState();
      this.lastResolvedToken = token;
    }

    if (!this.shouldReconnect || this.inFailureCooldown) {
      this.log('skipping open due to reconnect guard', {
        shouldReconnect: this.shouldReconnect,
        inFailureCooldown: this.inFailureCooldown
      });
      this.scheduleReconnect();
      return;
    }

    const resolved = this.resolveSocketUrl(token);
    this.log('attempting to open websocket', {
      url: this.redactTokenFromUrl(resolved)
    });
    let socket: WebSocket;
    try {
      socket = new WebSocket(resolved);
    } catch (error) {
      this.log('failed to synchronously construct WebSocket', error);
      this.socket = null;
      this.handleEarlyFailure();
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    this.log('WebSocket instance created');
    this.hadSuccessfulOpen = false;
    socket.addEventListener('open', this.handleOpen);
    socket.addEventListener('message', this.handleMessage);
    socket.addEventListener('error', this.handleError);
    socket.addEventListener('close', this.handleClose);
  }

  private handleOpen = (event: Event) => {
    this.log('received open event');
    this.hadSuccessfulOpen = true;
    this.consecutiveFailures = 0;
    this.reconnectDelayMs = this.baseReconnectDelay;
    this.clearFailureCooldown();
    this.subscribers.forEach((subscriber) => {
      subscriber.onOpen?.(event);
    });
    this.startHeartbeat();
  };

  private handleMessage = (event: MessageEvent<string>) => {
    this.log('received message event');
    const data = typeof event.data === 'string' ? event.data : String(event.data ?? '');
    this.subscribers.forEach((subscriber) => {
      subscriber.onMessage?.(data);
    });
  };

  private handleError = (event: Event) => {
    this.log('received error event', event);
    this.subscribers.forEach((subscriber) => {
      subscriber.onError?.(event);
    });
  };

  private handleClose = (event: CloseEvent) => {
    this.log('received close event', { code: event.code, reason: event.reason, wasClean: event.wasClean });
    this.socket = null;
    this.stopHeartbeat();
    const fatal = isAuthenticationFailureCloseEvent(event);
    const closedBeforeOpen = !this.hadSuccessfulOpen;
    this.hadSuccessfulOpen = false;
    if (fatal) {
      this.shouldReconnect = false;
      if (this.reconnectTimer !== null) {
        window.clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      this.clearFailureCooldown();
      this.consecutiveFailures = 0;
      this.reconnectDelayMs = this.baseReconnectDelay;
    }
    this.subscribers.forEach((subscriber) => {
      subscriber.onClose?.(event);
    });
    if (this.subscribers.size && !fatal) {
      if (closedBeforeOpen) {
        this.handleEarlyFailure();
      } else {
        this.consecutiveFailures = 0;
        this.reconnectDelayMs = this.baseReconnectDelay;
      }
      this.scheduleReconnect();
    }
  };

  private scheduleReconnect() {
    this.log('scheduleReconnect called', {
      shouldReconnect: this.shouldReconnect,
      inFailureCooldown: this.inFailureCooldown,
      reconnectTimer: this.reconnectTimer,
      delay: this.reconnectDelayMs
    });
    if (!this.shouldReconnect || this.inFailureCooldown) {
      return;
    }
    if (this.reconnectTimer !== null) {
      this.log('reconnect already scheduled, skipping');
      return;
    }
    const delay = this.reconnectDelayMs;
    this.reconnectTimer = globalThis.setTimeout(() => {
      this.log('reconnect timer fired');
      this.reconnectTimer = null;
      if (this.subscribers.size && !this.socket) {
        this.log('attempting reconnect after timer');
        this.open();
      }
    }, delay);
  }

  private resolveToken(): string | null {
    this.log('resolving token from subscribers');
    for (const subscriber of this.subscribers.values()) {
      const token = subscriber.tokenProvider();
      if (token) {
        this.log('resolved token for connection');
        return token;
      }
    }
    this.log('no subscribers provided a token');
    return null;
  }

  private resolveSocketUrl(token: string): string {
    this.log('resolving socket url for token');
    const baseUrl = resolveWsUrl(this.path);
    try {
      const origin =
        typeof window !== 'undefined' && window.location
          ? window.location.href
          : 'ws://localhost/';
      const url = new URL(baseUrl, origin);
      url.searchParams.set('token', token);
      this.log('resolved url via URL constructor', this.redactTokenFromUrl(url.toString()));
      return url.toString();
    } catch (error) {
      this.log('failed to resolve url with URL constructor, falling back', error);
      const separator = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
    }
  }

  private redactTokenFromUrl(url: string): string {
    try {
      const parsed = new URL(url);
      if (parsed.searchParams.has('token')) {
        parsed.searchParams.set('token', 'REDACTED');
        return parsed.toString();
      }
      return url;
    } catch {
      if (/(^|[?&#])token=/i.test(url)) {
        return url.replace(/(token=)[^&#]*/i, '$1REDACTED');
      }
      return url;
    }
  }

  private teardown() {
    this.log('teardown called');
    this.stopHeartbeat();
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.clearFailureCooldown();
    this.shouldReconnect = true;
    this.consecutiveFailures = 0;
    this.reconnectDelayMs = this.baseReconnectDelay;
    if (this.socket) {
      const socket = this.socket;
      const { readyState } = socket;

      if (readyState === WebSocket.CONNECTING) {
        const abortPendingConnection = () => {
          socket.removeEventListener('open', abortPendingConnection);
          try {
            socket.close();
          } catch (error) {
            this.log('failed to close pending WebSocket during teardown', error);
          }
        };
        socket.addEventListener('open', abortPendingConnection);
      }

      socket.removeEventListener('open', this.handleOpen);
      socket.removeEventListener('message', this.handleMessage);
      socket.removeEventListener('error', this.handleError);
      socket.removeEventListener('close', this.handleClose);

      if (readyState === WebSocket.OPEN || readyState === WebSocket.CLOSING) {
        socket.close();
      }

      this.socket = null;
    }
  }

  private removeSubscriber(id: number) {
    this.log('removing subscriber', id);
    this.subscribers.delete(id);
    if (!this.subscribers.size) {
      this.teardown();
    }
  }

  private send(message: unknown): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      this.log('send attempted while socket not open');
      return false;
    }
    try {
      if (typeof message === 'string') {
        this.socket.send(message);
      } else {
        this.socket.send(JSON.stringify(message));
      }
      return true;
    } catch (error) {
      this.log('failed to send websocket message', error);
      return false;
    }
  }

  private isOpen(): boolean {
    return Boolean(this.socket && this.socket.readyState === WebSocket.OPEN);
  }

  hasSubscribers(): boolean {
    return this.subscribers.size > 0;
  }

  private startHeartbeat() {
    this.log('starting heartbeat');
    this.stopHeartbeat();
    const sendPing = () => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        this.log('heartbeat ping skipped due to socket state', this.socket?.readyState);
        return;
      }
      try {
        this.socket.send(JSON.stringify({ action: 'ping' }));
      } catch (error) {
        this.log('failed to send websocket heartbeat', error);
        return;
      }
      this.log('heartbeat ping sent');
      this.heartbeatTimer = window.setTimeout(sendPing, this.heartbeatInterval);
    };
    sendPing();
  }

  private stopHeartbeat() {
    this.log('stopping heartbeat');
    if (this.heartbeatTimer !== null) {
      window.clearTimeout(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private handleEarlyFailure() {
    this.log('handling early failure', { consecutiveFailures: this.consecutiveFailures });
    this.consecutiveFailures += 1;
    this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, this.maxReconnectDelay);
    if (this.consecutiveFailures >= 3) {
      this.beginFailureCooldown();
    }
  }

  private beginFailureCooldown() {
    this.log('entering failure cooldown');
    if (this.inFailureCooldown) {
      return;
    }
    this.inFailureCooldown = true;
    this.shouldReconnect = false;
    console.warn(
      `WebSocket "${this.name}" failed to establish a connection multiple times. Switching to polling mode temporarily.`
    );
    this.failureCooldownTimer = window.setTimeout(() => {
      this.failureCooldownTimer = null;
      this.inFailureCooldown = false;
      this.shouldReconnect = true;
      this.consecutiveFailures = 0;
      this.reconnectDelayMs = this.baseReconnectDelay;
      if (this.subscribers.size && !this.socket) {
        this.ensureConnection();
      }
    }, this.failureCooldownMs);
  }

  private clearFailureCooldown() {
    this.log('clearing failure cooldown');
    if (this.failureCooldownTimer !== null) {
      window.clearTimeout(this.failureCooldownTimer);
      this.failureCooldownTimer = null;
    }
    this.inFailureCooldown = false;
  }

  private resetFailureState() {
    this.log('resetting failure state');
    this.clearFailureCooldown();
    this.consecutiveFailures = 0;
    this.reconnectDelayMs = this.baseReconnectDelay;
    this.hadSuccessfulOpen = false;
    this.shouldReconnect = true;
  }

  private log(message: string, ...args: unknown[]) {
    if (!DEBUG_LOGGING_ENABLED) {
      return;
    }
    if (typeof console !== 'undefined' && console.info) {
      console.info(`[WebSocket:${this.name}] ${message}`, ...args);
    }
  }
}

class WebSocketHub {
  private readonly connections = new Map<string, ManagedWebSocket>();

  subscribe(options: SubscribeOptions): WebSocketSubscription {
    if (DEBUG_LOGGING_ENABLED) {
      console.info('[WebSocketHub] subscribe called', options.name, options.path);
    }
    const path = options.path ?? '/ws/events';
    const name = options.name || 'ws';
    let connection = this.connections.get(name);
    if (!connection) {
      if (DEBUG_LOGGING_ENABLED) {
        console.info('[WebSocketHub] creating ManagedWebSocket for', name, 'with path', path);
      }
      connection = new ManagedWebSocket(name, path);
      this.connections.set(name, connection);
    }
    const subscription = connection.subscribe({
      tokenProvider: options.tokenProvider,
      onOpen: options.onOpen,
      onMessage: options.onMessage,
      onError: options.onError,
      onClose: (event) => {
        if (DEBUG_LOGGING_ENABLED) {
          console.info('[WebSocketHub] received close callback for', name, event);
        }
        options.onClose?.(event);
        if (!connection?.hasSubscribers()) {
          if (DEBUG_LOGGING_ENABLED) {
            console.info('[WebSocketHub] deleting ManagedWebSocket for', name, 'after close');
          }
          this.connections.delete(name);
        }
      }
    });
    return {
      send: subscription.send,
      isOpen: subscription.isOpen,
      dispose: () => {
        if (DEBUG_LOGGING_ENABLED) {
          console.info('[WebSocketHub] disposing subscription for', name);
        }
        subscription.dispose();
        if (!connection?.hasSubscribers()) {
          if (DEBUG_LOGGING_ENABLED) {
            console.info('[WebSocketHub] deleting ManagedWebSocket for', name, 'after dispose');
          }
          this.connections.delete(name);
        }
      }
    };
  }
}

const hub = new WebSocketHub();

export const subscribeWebSocket = (options: SubscribeOptions): WebSocketSubscription => hub.subscribe(options);

