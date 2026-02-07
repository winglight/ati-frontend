import {
  mapHistoricalBackfillJob,
  normaliseBackfillProgressMetadata,
  type HistoricalBackfillJobSummary,
  type HistoricalBackfillProgressMetadata
} from './marketDataAdminApi';
import { subscribeWebSocket, type WebSocketSubscription } from './websocketHub';

export interface MarketBackfillProgressEvent {
  jobId: string;
  executed: boolean;
  progress: HistoricalBackfillProgressMetadata | null;
  raw: Record<string, unknown>;
}

interface SubscribeMarketBackfillProgressOptions {
  jobId: string;
  tokenProvider: () => string | null;
  onProgress: (event: MarketBackfillProgressEvent) => void;
  onError?: (error: Error) => void;
  onComplete?: () => void;
  path?: string;
  topic?: string;
}

interface RawEnvelope {
  type?: unknown;
  event?: unknown;
  channel?: unknown;
  topic?: unknown;
  payload?: unknown;
  data?: unknown;
  message?: unknown;
  job?: unknown;
  detail?: unknown;
}

const DEFAULT_TOPIC_PREFIX = 'market_data.backfill';

const toRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return { ...(value as Record<string, unknown>) };
};

const parseProgressEnvelope = (raw: string): MarketBackfillProgressEvent | null => {
  let parsed: RawEnvelope;
  try {
    parsed = JSON.parse(raw) as RawEnvelope;
  } catch (error) {
    console.warn('[MarketBackfillRealtime] 无法解析进度消息', error);
    return null;
  }

  const envelope = toRecord(parsed);
  if (!envelope) {
    return null;
  }

  // 仅处理服务端广播的事件消息，忽略订阅确认、欢迎、心跳等非事件类型
  const messageType = typeof envelope.type === 'string' ? envelope.type.toLowerCase() : '';
  if (messageType && messageType !== 'event') {
    return null;
  }

  const payload =
    toRecord(envelope.payload) ??
    toRecord(envelope.data) ??
    toRecord(envelope.message) ??
    toRecord(envelope.detail) ??
    envelope;

  const jobRecord = toRecord(payload.job) ?? toRecord(envelope.job) ?? payload;

  try {
    const job: HistoricalBackfillJobSummary = mapHistoricalBackfillJob(jobRecord, payload);
    return {
      jobId: job.id,
      executed: job.executed,
      progress: job.progress,
      raw: jobRecord
    };
  } catch (error) {
    const fallbackProgress = normaliseBackfillProgressMetadata(payload);
    if (fallbackProgress) {
      const jobId = typeof payload.job_id === 'string' ? payload.job_id : typeof payload.id === 'string' ? payload.id : null;
      // 若负载中没有 jobId，尝试从事件主题解析 `${DEFAULT_TOPIC_PREFIX}.${jobId}` 形式的后缀
      const resolveJobIdFromTopic = (topic: unknown): string | null => {
        const t = typeof topic === 'string' ? topic.trim() : '';
        if (!t) return null;
        const prefix = `${DEFAULT_TOPIC_PREFIX}.`;
        if (t.startsWith(prefix)) {
          const suffix = t.slice(prefix.length);
          return suffix || null;
        }
        return null;
      };
      const topicCandidate =
        (typeof envelope.event === 'string' ? envelope.event : '') ||
        (typeof envelope.channel === 'string' ? envelope.channel : '') ||
        (typeof envelope.topic === 'string' ? envelope.topic : '');
      const topicJobId = jobId || resolveJobIdFromTopic(topicCandidate);
      if (topicJobId) {
        return {
          jobId: topicJobId,
          executed: false,
          progress: fallbackProgress,
          raw: jobRecord ?? payload
        };
      }
    }
    // 仅在事件类型消息无法解析时记录警告，避免对 ack/pong 等噪声消息报警
    if (messageType === 'event') {
      console.warn('[MarketBackfillRealtime] 进度消息缺少有效的任务信息', error);
    }
    return null;
  }
};

export const marketBackfillRealtimeDependencies = {
  subscribeWebSocket
};

export const subscribeMarketBackfillProgress = (
  options: SubscribeMarketBackfillProgressOptions
): WebSocketSubscription => {
  const topic = options.topic ?? `${DEFAULT_TOPIC_PREFIX}.${options.jobId}`;
  const path = options.path ?? '/ws/events';
  let subscribed = false;
  let disposed = false;

  const sendSubscribe = (handle: WebSocketSubscription) => {
    if (!topic || subscribed) {
      return;
    }
    const payload = { action: 'subscribe', topics: [topic] };
    const sent = handle.send(payload);
    if (!sent) {
      console.warn('[MarketBackfillRealtime] 发送订阅请求失败', payload);
      return;
    }
    subscribed = true;
  };

  const sendUnsubscribe = (handle: WebSocketSubscription) => {
    if (!topic || !subscribed) {
      return;
    }
    const payload = { action: 'unsubscribe', topics: [topic] };
    const sent = handle.send(payload);
    if (!sent) {
      console.warn('[MarketBackfillRealtime] 发送取消订阅请求失败', payload);
    }
    subscribed = false;
  };

  const subscription = marketBackfillRealtimeDependencies.subscribeWebSocket({
    name: 'market-data-backfill',
    path,
    tokenProvider: options.tokenProvider,
    onOpen: () => {
      subscribed = false;
      sendSubscribe(subscription);
    },
    onMessage: (data) => {
      const event = parseProgressEnvelope(data);
      if (!event || event.jobId !== options.jobId) {
        return;
      }
      options.onProgress(event);
      if (event.executed) {
        options.onComplete?.();
      }
    },
    onError: (event) => {
      const error = event instanceof Event ? new Error('市场补录进度通道异常') : (event as Error);
      options.onError?.(error);
    },
    onClose: () => {
      subscribed = false;
      if (!disposed) {
        options.onComplete?.();
      }
    }
  });

  return {
    send: subscription.send,
    isOpen: subscription.isOpen,
    dispose: () => {
      if (disposed) {
        return;
      }
      disposed = true;
      sendUnsubscribe(subscription);
      subscription.dispose();
    }
  };
};

export const __TESTING__ = {
  parseProgressEnvelope
};
