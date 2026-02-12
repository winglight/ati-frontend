import type { StrategyRuntimeDetail } from '@features/dashboard/types';
import i18n from '@i18n';
import { formatTimestamp } from './formatTimestamp';

export type RuntimeLogTone = 'info' | 'warning' | 'error' | 'success' | 'debug' | 'neutral';

export interface RuntimeLogDetailEntry {
  key: string;
  value: string;
}

export interface RuntimeLogEntry {
  id: string;
  level: string;
  tone: RuntimeLogTone;
  timestamp: string | null;
  message: string;
  details: RuntimeLogDetailEntry[];
  raw?: Record<string, unknown> | null;
}

export interface DomRuntimeMetricsViewModel {
  isReceivingData: boolean | null;
  receivingReason: string | null;
  receivingCause: string | null;
  receivingCauseCode: string | null;
  dataLabel: string;
  awaitingData: boolean;
  dataPushSubscription: string | null;
  dataPushSymbol: string | null;
  dataPushLastTimestamp: string | null;
  subscriptionStatuses: DomSubscriptionStatusEntry[];
  runtimeSeconds: number | null;
  domMessages: number | null;
  thresholdHits: number | null;
  buySignals: number | null;
  sellSignals: number | null;
  stopLossEnabled: boolean | null;
  stopLossPrice: number | null;
  takeProfitEnabled: boolean | null;
  takeProfitPrice: number | null;
  dataFeedLogs: RuntimeLogEntry[];
}

export interface DomSubscriptionStatusEntry {
  symbol: string;
  interval: string | null;
  subscribedAt: string | null;
}

export interface RuntimeMetricItem {
  key: string;
  label: string;
  value: string;
}

export interface SignalEventViewModel {
  side: 'BUY' | 'SELL';
  timestamp: string | null;
}

export interface KlineRuntimePhaseViewModel {
  key: string;
  title: string;
  status: string | null;
  statusDescriptor: string | null;
  statusReason: string | null;
  statusCause: string | null;
  statusTone: RuntimeLogTone;
  metrics: RuntimeMetricItem[];
  logs: RuntimeLogEntry[];
  signalEvents: SignalEventViewModel[];
  stageSignals: RuntimeLogEntry[];
  dataProcessingLogs: RuntimeLogEntry[];
  orderExecutions?: OrderExecutionViewModel[];
  raw?: Record<string, unknown> | null;
}

export interface KlineRuntimeMetricsViewModel {
  interval: string | null;
  intervalLabel: string | null;
  phases: KlineRuntimePhaseViewModel[];
}

const SIGNAL_STAGE_DISPLAY_LIMIT = 3;
const SIGNAL_EVENT_DISPLAY_LIMIT = 5;
const SIGNAL_PROCESSING_DISPLAY_LIMIT = 10;

export interface OrderExecutionViewModel {
  id: string;
  side: 'BUY' | 'SELL' | null;
  symbol: string | null;
  quantity: number | null;
  status: string | null;
  timestamp: string | null;
}

const toNumberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const toBooleanOrNull = (value: unknown): boolean | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      return null;
    }
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return null;
    }
    if (['true', '1', 'yes', 'y', 'on', 'enabled', 'active'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off', 'disabled', 'inactive'].includes(normalized)) {
      return false;
    }
  }
  return null;
};

const toStringOrNull = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return null;
    }
    return value.toString();
  }
  if (value instanceof Date) {
    try {
      return value.toISOString();
    } catch {
      return null;
    }
  }
  if (Array.isArray(value)) {
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value as Record<string, unknown>);
    } catch {
      return null;
    }
  }
  return null;
};

const resolveRuntimeLocale = (): string => {
  const { language } = i18n;
  if (typeof language === 'string') {
    const normalized = language.trim();
    if (normalized) {
      if (normalized === 'zh') {
        return 'zh-CN';
      }
      if (normalized === 'en') {
        return 'en-US';
      }
      return normalized;
    }
  }
  return 'zh-CN';
};

const normalizeIntervalText = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value % 60 === 0 ? `${Math.floor(value / 60)}m` : `${value}s`;
  }
  if (typeof value === 'string') {
    const text = value.trim().toLowerCase();
    if (!text) return null;
    let match = text.match(/^([0-9]+)\s*m(?:in(?:ute)?s?)?$/);
    if (match) return `${Number(match[1])}m`;
    match = text.match(/^([0-9]+)\s*s(?:ec(?:ond)?s?)?$/);
    if (match) return `${Number(match[1])}s`;
    match = text.match(/^([0-9]+)\s*h(?:our)?s?$/);
    if (match) return `${Number(match[1])}h`;
    match = text.match(/^(?:bar|candle|kline)[_\-\s]?([0-9]+)m$/);
    if (match) return `${Number(match[1])}m`;
    match = text.match(/^pt([0-9]+)m$/);
    if (match) return `${Number(match[1])}m`;
    match = text.match(/^pt([0-9]+)s$/);
    if (match) return `${Number(match[1])}s`;
    match = text.match(/^([0-9]+)$/);
    if (match) {
      const n = Number(match[1]);
      if (Number.isFinite(n) && n > 0) return n % 60 === 0 ? `${Math.floor(n / 60)}m` : `${n}s`;
    }
    match = text.match(/^([0-9]+)m$/);
    if (match) return `${Number(match[1])}m`;
    match = text.match(/^([0-9]+)s$/);
    if (match) return `${Number(match[1])}s`;
  }
  return null;
};

const pickNumber = (...values: unknown[]): number | null => {
  for (const value of values) {
    const parsed = toNumberOrNull(value);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
};

const pickBoolean = (...values: unknown[]): boolean | null => {
  for (const value of values) {
    const parsed = toBooleanOrNull(value);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
};

const pickString = (...values: unknown[]): string | null => {
  for (const value of values) {
    const parsed = toStringOrNull(value);
    if (parsed !== null) {
      return parsed;
    }
  }
  return null;
};

const normalizeLogTone = (value: string | null | undefined): RuntimeLogTone => {
  if (!value) {
    return 'info';
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return 'info';
  }
  if (['error', 'err', 'fatal', 'critical', 'severe', 'negative'].includes(normalized)) {
    return 'error';
  }
  if (['warn', 'warning', 'caution'].includes(normalized)) {
    return 'warning';
  }
  if (['success', 'ok', 'passed', 'pass', 'positive', 'active', 'running', 'connected'].includes(normalized)) {
    return 'success';
  }
  if (['debug', 'trace', 'verbose'].includes(normalized)) {
    return 'debug';
  }
  if (['neutral', 'info', 'notice'].includes(normalized)) {
    return normalized === 'neutral' ? 'neutral' : 'info';
  }
  return 'info';
};

const normalizeDescriptorText = (value: string | null | undefined): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const includesKeyword = (text: string, keywords: readonly string[]): boolean => {
  if (!text) {
    return false;
  }
  return keywords.some((keyword) => keyword && text.includes(keyword));
};

const FAILURE_KEYWORDS = [
  'fail',
  'error',
  'lost',
  'drop',
  '断',
  '掉线',
  '中断',
  '失联',
  'inactive',
  'missing',
  'broken',
  '断开',
  '停用',
  '异常',
  'stale'
] as const;

const AWAITING_KEYWORDS = [
  'await',
  'wait',
  '等待',
  '重连',
  '恢复',
  'refresh',
  'retry',
  'pending',
  'link',
  '链接',
  '连接',
  'queue',
  '排队',
  '重试',
  '初始化',
  'starting',
  '准备'
] as const;

const hasFailureSignal = (text: string): boolean => includesKeyword(text, FAILURE_KEYWORDS);

const hasAwaitingSignal = (text: string): boolean => includesKeyword(text, AWAITING_KEYWORDS);

const parseLogTimestamp = (value: unknown): string | null => {
  const timezoneAwareFormat = (timestamp: string): string | null => {
    const formatted = formatTimestamp(timestamp, {
      timezone: null,
      locale: resolveRuntimeLocale(),
      assumeLocalWhenNoZone: true
    });
    if (formatted === '—') {
      return null;
    }
    return formatted;
  };

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    return timezoneAwareFormat(trimmed);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const milliseconds = value > 1e12 ? value : value > 1e9 ? value * 1000 : null;
    if (milliseconds !== null) {
      return timezoneAwareFormat(new Date(milliseconds).toISOString());
    }
    return timezoneAwareFormat(value.toString());
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return timezoneAwareFormat(value.toISOString());
  }
  return null;
};

const parseDomTimestamp = (value: unknown): string | null => {
  const parsed = parseLogTimestamp(value);
  if (parsed) {
    return parsed;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    const date = new Date(value * 1000);
    return formatTimestamp(date.toISOString(), {
      timezone: null,
      locale: resolveRuntimeLocale()
    });
  }
  return null;
};

const parseLogDetails = (value: unknown): RuntimeLogDetailEntry[] => {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    const details: RuntimeLogDetailEntry[] = [];
    for (const entry of value) {
      if (!entry) {
        continue;
      }
      if (Array.isArray(entry) && entry.length >= 2) {
        const [key, detailValue] = entry;
        const detail = toStringOrNull(detailValue) ?? '—';
        details.push({ key: toStringOrNull(key) ?? 'detail', value: detail });
        continue;
      }
      if (typeof entry === 'object') {
        const record = entry as Record<string, unknown>;
        for (const [key, detailValue] of Object.entries(record)) {
          details.push({ key, value: toStringOrNull(detailValue) ?? '—' });
        }
        continue;
      }
      const fallback = toStringOrNull(entry);
      if (fallback) {
        details.push({ key: 'detail', value: fallback });
      }
    }
    return details;
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).map(([key, detailValue]) => ({
      key,
      value: toStringOrNull(detailValue) ?? '—'
    }));
  }
  const fallback = toStringOrNull(value);
  return fallback ? [{ key: 'detail', value: fallback }] : [];
};

const parseLogTimestampValue = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1e12) {
      return value;
    }
    if (value > 1e9) {
      return value * 1000;
    }
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsedDate = Date.parse(trimmed);
    if (!Number.isNaN(parsedDate)) {
      return parsedDate;
    }
    const parsedNumber = Number(trimmed);
    if (Number.isFinite(parsedNumber)) {
      if (parsedNumber > 1e12) {
        return parsedNumber;
      }
      if (parsedNumber > 1e9) {
        return parsedNumber * 1000;
      }
    }
  }
  return null;
};

interface NormalizedLogRecord {
  id: string;
  level: string;
  tone: RuntimeLogTone;
  timestamp: string | null;
  timestampValue: number | null;
  message: string;
  details: RuntimeLogDetailEntry[];
  raw: Record<string, unknown>;
  order: number;
}

const gatherLogRecords = (...sources: unknown[]): NormalizedLogRecord[] => {
  const records: NormalizedLogRecord[] = [];
  let order = 0;
  for (const source of sources) {
    if (!Array.isArray(source)) {
      continue;
    }
    for (const item of source) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const record = item as Record<string, unknown>;
      const levelText = toStringOrNull(record.level) ?? 'INFO';
      const tone = normalizeLogTone((record.tone as string | null | undefined) ?? levelText);
      const timestampRaw = record.timestamp;
      const timestamp = parseLogTimestamp(timestampRaw);
      const timestampValue = parseLogTimestampValue(timestampRaw);
      const message = toStringOrNull(record.message) ?? '';
      const details = parseLogDetails(record.details);
      records.push({
        id: toStringOrNull(record.id) ?? `log-${records.length}`,
        level: levelText.toUpperCase(),
        tone,
        timestamp,
        timestampValue,
        message,
        details,
        raw: record,
        order
      });
      order += 1;
    }
  }
  return records;
};

const sortLogRecords = (records: NormalizedLogRecord[]): NormalizedLogRecord[] => {
  return [...records].sort((left, right) => {
    if (left.timestampValue !== null && right.timestampValue !== null) {
      if (right.timestampValue !== left.timestampValue) {
        return right.timestampValue - left.timestampValue;
      }
    } else if (left.timestampValue !== null) {
      return -1;
    } else if (right.timestampValue !== null) {
      return 1;
    }
    return right.order - left.order;
  });
};

const parseDataFeedLogs = (...sources: unknown[]): RuntimeLogEntry[] => {
  return sortLogRecords(gatherLogRecords(...sources)).map((item) => ({
    id: item.id,
    level: item.level,
    tone: item.tone,
    timestamp: item.timestamp,
    message: item.message,
    details: item.details,
    raw: item.raw
  }));
};

const normalizePhaseKey = (value: string): string => value.replace(/[^a-z0-9]+/gi, '').toLowerCase();

// Default Chinese labels kept to satisfy existing tests; translation is resolved dynamically.
const DEFAULT_KLINE_PHASE_LABELS: Record<string, string> = {
  subscription: '行情订阅',
  batch_aggregation: '批量聚合',
  signal_generation: '信号生成',
  order_execution: '订单执行'
};

const PHASE_KEYS: Array<keyof typeof DEFAULT_KLINE_PHASE_LABELS> = [
  'subscription',
  'batch_aggregation',
  'signal_generation',
  'order_execution'
];

const getPhaseTitle = (normalizedKey: keyof typeof DEFAULT_KLINE_PHASE_LABELS): string => {
  const i18nKeyMap: Record<string, string> = {
    subscription: 'strategies.runtime.kline.phases.subscription',
    batch_aggregation: 'strategies.runtime.kline.phases.batch_aggregation',
    signal_generation: 'strategies.runtime.kline.phases.signal_generation',
    order_execution: 'strategies.runtime.kline.phases.order_execution'
  };
  const i18nKey = i18nKeyMap[normalizedKey];
  if (i18nKey) {
    const translated = i18n.t(i18nKey);
    if (translated && translated !== i18nKey) {
      return translated as string;
    }
  }
  return DEFAULT_KLINE_PHASE_LABELS[normalizedKey] ?? humanizeRuntimeMetricLabel(String(normalizedKey));
};

const KLINE_PHASE_VARIANTS: Record<string, string[]> = {
  subscription: ['subscription', 'subscribe', 'data_subscription', 'market_subscription'],
  batch_aggregation: ['batch_aggregation', 'batch', 'aggregation', 'bar_builder', 'windowing'],
  signal_generation: ['signal_generation', 'signals', 'signal', 'strategy', 'decision'],
  order_execution: ['order_execution', 'execution', 'order', 'trade_execution', 'dispatch', 'dispatcher']
};

const PROCESSING_STAGE_VARIANTS: Record<string, string[]> = {
  subscription: KLINE_PHASE_VARIANTS.subscription,
  batch_aggregation: KLINE_PHASE_VARIANTS.batch_aggregation,
  signal_generation: KLINE_PHASE_VARIANTS.signal_generation,
  order_execution: KLINE_PHASE_VARIANTS.order_execution
};

const KLINE_PHASE_SEARCH_KEYS = [
  'phases',
  'kline_phases',
  'kline',
  'pipeline',
  'stages',
  'kline_runtime',
  'workflow',
  'data_push'
];

const humanizeRuntimeMetricLabel = (key: string): string => {
  const normalized = key.replace(/[_-]+/g, ' ').trim();
  if (!normalized) {
    return key;
  }
  return normalized
    .split(' ')
    .filter(Boolean)
    .map((token) => {
      if (token.length <= 3) {
        return token.toUpperCase();
      }
      return token.charAt(0).toUpperCase() + token.slice(1);
    })
    .join(' ');
};

const formatPhaseMetricValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return value.toString();
    }
    if (Number.isInteger(value)) {
      return formatInteger(value);
    }
    const abs = Math.abs(value);
    const maximumFractionDigits = abs >= 100 ? 0 : abs >= 10 ? 1 : abs >= 1 ? 2 : 4;
    return value.toLocaleString('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits
    });
  }
  if (typeof value === 'boolean') {
    return value ? '是' : '否';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return '—';
    }
    const timestamp = parseLogTimestamp(trimmed);
    return timestamp ?? trimmed;
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatPhaseMetricValue(item)).join(', ');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return '[object]';
    }
  }
  return String(value);
};

const formatLogMetricValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return value.toString();
    }
    if (Number.isInteger(value)) {
      return value.toString();
    }
    return value.toFixed(3);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return '—';
    }
    const timestamp = parseLogTimestamp(trimmed);
    return timestamp ?? trimmed;
  }
  if (Array.isArray(value)) {
    return value.map((item) => formatLogMetricValue(item)).join(', ');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return '[object]';
    }
  }
  return String(value);
};

const normalizeStageKey = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  return value.replace(/[^a-z0-9]+/gi, '').toLowerCase();
};

const extractProcessingLogSource = (
  snapshot: StrategyRuntimeDetail['snapshot'] | null | undefined
): Record<string, unknown>[] => {
  if (!snapshot) {
    return [];
  }
  const candidates = [
    snapshot['processing_log'],
    snapshot['processingLog'],
    snapshot['processing_logs'],
    snapshot['processingLogs']
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate as Record<string, unknown>[];
    }
  }
  return [];
};

const describeProcessingOutcome = (
  passed: unknown
): { tone: RuntimeLogTone; level: string; label: string } => {
  if (passed === true) {
    return { tone: 'success', level: 'INFO', label: '通过' };
  }
  if (passed === false) {
    return { tone: 'warning', level: 'WARN', label: '未通过' };
  }
  return { tone: 'neutral', level: 'INFO', label: '已评估' };
};

const collectProcessingLogsForPhase = (
  snapshot: StrategyRuntimeDetail['snapshot'] | null | undefined,
  phaseKey: keyof typeof KLINE_PHASE_VARIANTS,
  normalizedTemplate?: string | null
): RuntimeLogEntry[] => {
  const records = extractProcessingLogSource(snapshot);
  if (!records.length) {
    return [];
  }
  const allowedStages = new Set(
    (PROCESSING_STAGE_VARIANTS[phaseKey] ?? []).map((stage) => normalizeStageKey(stage))
  );
  const entries: Array<{ entry: RuntimeLogEntry; timestampValue: number | null; order: number }> = [];
  const stageCompleteDedup = new Set<string>();
  const isDynamicOrb = normalizedTemplate === DYNAMIC_ORB_TEMPLATE_KEY;
  let order = 0;
  for (const record of records) {
    if (!record || typeof record !== 'object') {
      continue;
    }
    const raw = record as Record<string, unknown>;
    const stageValue = normalizeStageKey(raw['stage'] ?? raw['phase'] ?? raw['name']);
    if (stageValue) {
      if (allowedStages.size && !allowedStages.has(stageValue)) {
        continue;
      }
    } else if (phaseKey !== 'signal_generation') {
      continue;
    }
    const timestampRaw = raw['timestamp'] ?? raw['time'] ?? raw['logged_at'];
    const timestamp = parseLogTimestamp(timestampRaw);
    const timestampValue = parseLogTimestampValue(timestampRaw);
    const step = toStringOrNull(raw['step'] ?? raw['stage'] ?? raw['message']) ?? '数据处理';
    const comparison = toStringOrNull(raw['comparison'] ?? raw['operator']);
    const thresholdValue = raw['threshold'] ?? raw['limit'];
    const metricValue = raw['metric'] ?? raw['value'];
    const outcome = describeProcessingOutcome(raw['passed']);
    const isStageComplete = isDynamicOrb && isDynamicOrbStageCompleteMessage(step);
    if (isStageComplete) {
      const dedupKey = `${normalizeOrbStageName(step) ?? step}-${timestampValue ?? order}`;
      if (stageCompleteDedup.has(dedupKey)) {
        order += 1;
        continue;
      }
      stageCompleteDedup.add(dedupKey);
    }
    const predicateParts: string[] = [];
    if (comparison && thresholdValue !== null && thresholdValue !== undefined) {
      predicateParts.push(`${comparison} ${formatLogMetricValue(thresholdValue)}`);
    } else if (thresholdValue !== null && thresholdValue !== undefined) {
      predicateParts.push(formatLogMetricValue(thresholdValue));
    }
    const predicateText = predicateParts.length ? ` (${predicateParts.join(' ')})` : '';
    const message = `${step}${predicateText} · ${outcome.label}`;
    const details: RuntimeLogDetailEntry[] = [];
    if (isStageComplete) {
      details.push({ key: '条件', value: step });
      details.push({ key: '现值', value: formatLogMetricValue(metricValue) });
      details.push({ key: '阈值', value: formatLogMetricValue(thresholdValue) });
      details.push({ key: '结果', value: outcome.label });
    } else {
      if (metricValue !== null && metricValue !== undefined) {
        details.push({ key: '当前值', value: formatLogMetricValue(metricValue) });
      }
      if (thresholdValue !== null && thresholdValue !== undefined) {
        details.push({ key: '阈值', value: formatLogMetricValue(thresholdValue) });
      }
      if (comparison) {
        details.push({ key: '比较', value: comparison });
      }
      const extraDetails = parseLogDetails(raw['details']);
      if (extraDetails.length) {
        details.push(...extraDetails);
      }
    }
    entries.push({
      entry: {
        id: toStringOrNull(raw['id']) ?? `processing-${phaseKey}-${order}`,
        level: outcome.level,
        tone: outcome.tone,
        timestamp,
        message,
        details,
        raw
      },
      timestampValue,
      order
    });
    order += 1;
  }
  entries.sort((left, right) => {
    if (
      left.timestampValue !== null &&
      right.timestampValue !== null &&
      left.timestampValue !== right.timestampValue
    ) {
      return right.timestampValue - left.timestampValue;
    }
    if (left.timestampValue !== null) {
      return -1;
    }
    if (right.timestampValue !== null) {
      return 1;
    }
    return right.order - left.order;
  });
  return entries.slice(0, 20).map(({ entry }) => entry);
};

const mergePhaseLogs = (
  phaseLogs: RuntimeLogEntry[],
  processingLogs: RuntimeLogEntry[]
): RuntimeLogEntry[] => {
  if (!processingLogs.length) {
    return phaseLogs;
  }
  const combined = [...processingLogs, ...phaseLogs];
  return combined.slice(0, 20);
};

const determinePhaseTone = (status: string | null, descriptor: string | null): RuntimeLogTone => {
  const context = `${status ?? ''} ${descriptor ?? ''}`.toLowerCase();
  if (!context.trim()) {
    return 'info';
  }
  if (/(recovered)/.test(context)) {
    return 'success';
  }
  if (/(error|fail|fatal|halt|stop|broken|disconnect|rejected|timeout|inactive)/.test(context)) {
    return 'error';
  }
  if (/(warn|delay|pending|retry|recovery|recovering|waiting|lag|degrad|backoff|reconnect|pause|paused|stale)/.test(context)) {
    return 'warning';
  }
  if (/(success|ok|ready|\bactive\b|running|healthy|synced|completed|connected|up to date|recovered)/.test(context)) {
    return 'success';
  }
  if (/(debug|trace|verbose)/.test(context)) {
    return 'debug';
  }
  if (/(neutral|info|idle)/.test(context)) {
    return 'neutral';
  }
  return 'info';
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);

type PhaseSource = Record<string, unknown> | unknown[];

const collectPhaseSources = (
  snapshot: StrategyRuntimeDetail['snapshot'] | null | undefined
): PhaseSource[] => {
  if (!snapshot) {
    return [];
  }

  const sources: PhaseSource[] = [];
  const visited = new Set<unknown>();

  const addSource = (candidate: unknown, depth = 0) => {
    if (!candidate || depth > 4) {
      return;
    }
    if (visited.has(candidate)) {
      return;
    }
    if (Array.isArray(candidate)) {
      visited.add(candidate);
      sources.push(candidate);
      for (const item of candidate) {
        addSource(item, depth + 1);
      }
      return;
    }
    if (!isPlainObject(candidate)) {
      return;
    }
    visited.add(candidate);
    sources.push(candidate);

    const nestedKeys = new Set<string>([
      ...KLINE_PHASE_SEARCH_KEYS,
      'phases',
      'summary',
      'phase_summary',
      'phase_summaries',
      'phases_summary'
    ]);

    for (const key of nestedKeys) {
      if (key in candidate) {
        addSource(candidate[key], depth + 1);
      }
    }
  };

  const snapshotRecord = snapshot as Record<string, unknown>;
  addSource(snapshotRecord.summary ?? null);
  addSource(snapshotRecord);

  return sources;
};

const mergePhaseArrays = (existing: unknown[], incoming: unknown[]): unknown[] => {
  if (!existing.length) {
    return [...incoming];
  }
  if (!incoming.length) {
    return [...existing];
  }

  const deduped: unknown[] = [];
  const seen = new Set<string>();
  const combined = [...incoming, ...existing];

  for (const item of combined) {
    if (!item || typeof item !== 'object') {
      deduped.push(item);
      continue;
    }
    const record = item as Record<string, unknown>;
    const identifier =
      (typeof record.id === 'string' && `id:${record.id}`) ||
      (typeof record.key === 'string' && `key:${record.key}`) ||
      (typeof record.timestamp === 'string' && typeof record.message === 'string'
        ? `ts:${record.timestamp}-msg:${record.message}`
        : null);
    const marker = identifier ?? JSON.stringify(record);
    if (seen.has(marker)) {
      continue;
    }
    seen.add(marker);
    deduped.push(item);
  }

  return deduped;
};

const mergePhaseRecords = (records: Record<string, unknown>[]): Record<string, unknown> | null => {
  if (!records.length) {
    return null;
  }
  if (records.length === 1) {
    return { ...records[0] };
  }

  const merged: Record<string, unknown> = {};

  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      if (value === undefined) {
        continue;
      }
      const existing = merged[key];
      if (Array.isArray(value)) {
        if (Array.isArray(existing)) {
          merged[key] = mergePhaseArrays(existing, value);
        } else {
          merged[key] = [...value];
        }
        continue;
      }
      if (isPlainObject(value)) {
        if (isPlainObject(existing)) {
          const nested = mergePhaseRecords([existing, value]);
          if (nested) {
            merged[key] = nested;
          }
        } else {
          merged[key] = mergePhaseRecords([value]) ?? {};
        }
        continue;
      }
      merged[key] = value;
    }
  }

  return merged;
};

const matchPhaseArrayEntry = (
  value: unknown,
  variants: string[]
): Record<string, unknown> | null => {
  if (!Array.isArray(value)) {
    return null;
  }
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as Record<string, unknown>;
    const keyCandidate =
      (typeof record.key === 'string' && record.key) ||
      (typeof record.id === 'string' && record.id) ||
      (typeof record.name === 'string' && record.name) ||
      (typeof record.phase === 'string' && record.phase) ||
      (typeof record.stage === 'string' && record.stage);
    if (typeof keyCandidate === 'string') {
      const normalizedCandidate = normalizePhaseKey(keyCandidate);
      const matches = variants.some((variant) => normalizedCandidate === normalizePhaseKey(variant));
      if (matches) {
        return record;
      }
    }
  }
  return null;
};

const findPhaseRecord = (
  snapshot: StrategyRuntimeDetail['snapshot'] | null | undefined,
  variants: string[]
): Record<string, unknown> | null => {
  if (!snapshot) {
    return null;
  }
  const matches: Record<string, unknown>[] = [];
  for (const source of collectPhaseSources(snapshot)) {
    if (Array.isArray(source)) {
      const matched = matchPhaseArrayEntry(source, variants);
      if (matched) {
        matches.push(matched);
      }
      continue;
    }
    for (const variant of variants) {
      const candidate = source[variant];
      if (!candidate) {
        continue;
      }
      if (Array.isArray(candidate)) {
        const matched = matchPhaseArrayEntry(candidate, variants);
        if (matched) {
          matches.push(matched);
        }
        continue;
      }
      if (isPlainObject(candidate)) {
        matches.push(candidate);
      }
    }
  }

  return mergePhaseRecords(matches);
};

const KLINE_METRIC_COLLECTION_KEYS = [
  'metrics',
  'summary',
  'stats',
  'counts',
  'timings',
  'durations',
  'averages',
  'totals',
  'latest',
  'last',
  'values'
];

const KLINE_METRIC_EXCLUDED_KEYS = new Set([
  'status',
  'state',
  'phase_status',
  'stage_status',
  'health',
  'status_reason',
  'status_cause',
  'status_cause_code',
  'reason',
  'cause',
  'message',
  'description',
  'logs',
  'log',
  'entries',
  'events',
  'history',
  'log_entries',
  'metric_order',
  'key',
  'id',
  'name'
]);

const collectPhaseMetrics = (record: Record<string, unknown>): RuntimeMetricItem[] => {
  const metrics = new Map<string, { label: string; value: string }>();
  const pushMetric = (key: string, value: unknown) => {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
      return;
    }
    if (metrics.has(normalizedKey)) {
      return;
    }
    const formatted = formatPhaseMetricValue(value);
    if (formatted === '—') {
      return;
    }
    metrics.set(normalizedKey, {
      label: humanizeRuntimeMetricLabel(normalizedKey),
      value: formatted
    });
  };

  const metricOrder = Array.isArray(record.metric_order)
    ? (record.metric_order as unknown[])
        .map((item) => (typeof item === 'string' ? item : typeof item === 'number' ? String(item) : null))
        .filter((item): item is string => Boolean(item))
    : [];

  const addFromObject = (source: unknown) => {
    if (!source || typeof source !== 'object') {
      return;
    }
    for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
      if (value === undefined) {
        continue;
      }
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        continue;
      }
      pushMetric(key, value);
    }
  };

  for (const key of KLINE_METRIC_COLLECTION_KEYS) {
    if (key in record) {
      addFromObject(record[key]);
    }
  }

  for (const [key, value] of Object.entries(record)) {
    if (KLINE_METRIC_EXCLUDED_KEYS.has(key)) {
      continue;
    }
    if (value === undefined) {
      continue;
    }
    if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
      continue;
    }
    pushMetric(key, value);
  }

  const used = new Set<string>();
  const ordered: RuntimeMetricItem[] = [];
  for (const key of metricOrder) {
    const entry = metrics.get(key);
    if (!entry) {
      continue;
    }
    ordered.push({ key, label: entry.label, value: entry.value });
    used.add(key);
  }

  const remaining = Array.from(metrics.entries()).filter(([key]) => !used.has(key));
  remaining.sort((left, right) => left[1].label.localeCompare(right[1].label, 'zh-CN'));
  for (const [key, entry] of remaining) {
    ordered.push({ key, label: entry.label, value: entry.value });
  }

  return ordered;
};

const normalizeSignalFieldKey = (value: string): string => value.replace(/[^a-z]+/gi, '').toLowerCase();

const SIGNAL_SIDE_KEYWORDS = new Set([
  'side',
  'signalside',
  'signal',
  'orderside',
  'order',
  'orderaction',
  'trade',
  'tradeaction',
  'direction',
  'decision',
  'action',
  'position'
]);

const SIGNAL_CONTEXT_KEYWORDS = [
  'signal',
  'order',
  'trade',
  'execution',
  'entry',
  'exit',
  'fill',
  'trigger',
  'queued',
  'queue',
  '生成',
  '触发',
  '执行',
  '下单'
] as const;

const normalizeSignalSideString = (value: string): 'BUY' | 'SELL' | null => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const hasStrongBuy = /\b(long|bullish)\b/.test(normalized);
  const hasStrongSell = /\b(short|bearish)\b/.test(normalized);
  const hasWeakBuy = /\bbuy\b/.test(normalized);
  const hasWeakSell = /\bsell\b/.test(normalized);

  if (!(hasStrongBuy || hasStrongSell || hasWeakBuy || hasWeakSell)) {
    return null;
  }

  if (hasStrongBuy) {
    return 'BUY';
  }
  if (hasStrongSell) {
    return 'SELL';
  }

  const tokenCount = normalized.split(/\s+/).filter(Boolean).length;
  const requiresContext = normalized.length > 12 || tokenCount > 2;
  const hasContext = includesKeyword(normalized, SIGNAL_CONTEXT_KEYWORDS);

  if (hasWeakBuy) {
    if (requiresContext && !hasContext) {
      return null;
    }
    return 'BUY';
  }
  if (hasWeakSell) {
    if (requiresContext && !hasContext) {
      return null;
    }
    return 'SELL';
  }
  return null;
};

const extractSignalSideFromValue = (value: unknown, depth = 0): 'BUY' | 'SELL' | null => {
  if (value === null || value === undefined || depth > 4) {
    return null;
  }
  if (typeof value === 'string') {
    return normalizeSignalSideString(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 0) {
      return 'BUY';
    }
    if (value < 0) {
      return 'SELL';
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const derived = extractSignalSideFromValue(item, depth + 1);
      if (derived) {
        return derived;
      }
    }
    return null;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    for (const [key, nested] of entries) {
      const normalizedKey = normalizeSignalFieldKey(key);
      if (SIGNAL_SIDE_KEYWORDS.has(normalizedKey)) {
        const derived = extractSignalSideFromValue(nested, depth + 1);
        if (derived) {
          return derived;
        }
      }
    }
    for (const [, nested] of entries) {
      if (nested && typeof nested === 'object') {
        const derived = extractSignalSideFromValue(nested, depth + 1);
        if (derived) {
          return derived;
        }
      }
    }
  }
  return null;
};

const deriveSignalSide = (record: NormalizedLogRecord): 'BUY' | 'SELL' | null => {
  for (const key of Object.keys(record.raw)) {
    const normalizedKey = normalizeSignalFieldKey(key);
    if (SIGNAL_SIDE_KEYWORDS.has(normalizedKey)) {
      const direct = extractSignalSideFromValue((record.raw as Record<string, unknown>)[key], 1);
      if (direct) {
        return direct;
      }
    }
  }
  for (const detail of record.details) {
    const normalizedKey = normalizeSignalFieldKey(detail.key);
    if (!SIGNAL_SIDE_KEYWORDS.has(normalizedKey)) {
      continue;
    }
    const derived = extractSignalSideFromValue(detail.value, 1);
    if (derived) {
      return derived;
    }
  }
  const messageDerived = extractSignalSideFromValue(record.message, 1);
  if (messageDerived) {
    return messageDerived;
  }
  return extractSignalSideFromValue(record.raw, 1);
};

const collectSnapshotSignalEvents = (
  snapshot: StrategyRuntimeDetail['snapshot'] | null | undefined
): SignalEventViewModel[] => {
  const source = Array.isArray(snapshot?.signals) ? snapshot?.signals : [];
  if (!source.length) {
    return [];
  }
  const events: SignalEventViewModel[] = [];
  for (let index = source.length - 1; index >= 0; index -= 1) {
    const entry = source[index] as Record<string, unknown> | null;
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const sideRaw =
      (typeof entry.side === 'string' && entry.side) ||
      (typeof entry.signal_side === 'string' && entry.signal_side) ||
      (typeof entry.action === 'string' && entry.action) ||
      (typeof entry.type === 'string' && entry.type) ||
      null;
    const side = sideRaw ? normalizeSignalSideString(sideRaw) : null;
    if (!side) {
      continue;
    }
    const timestamp =
      (typeof entry.timestamp === 'string' && entry.timestamp) ||
      (typeof entry.time === 'string' && entry.time) ||
      (typeof entry.created_at === 'string' && entry.created_at) ||
      null;
    events.push({ side, timestamp });
    if (events.length >= SIGNAL_EVENT_DISPLAY_LIMIT) {
      break;
    }
  }
  return events.reverse();
};

const collectSignalEvents = (
  record: Record<string, unknown> | null,
  snapshot?: StrategyRuntimeDetail['snapshot'] | null
): SignalEventViewModel[] => {
  const snapshotEvents = collectSnapshotSignalEvents(snapshot);
  if (snapshotEvents.length) {
    return snapshotEvents;
  }
  if (!record) {
    return [];
  }
  const logRecords = sortLogRecords(
    gatherLogRecords(record['signal_events'], record['signalEvents'], record['events'])
  );

  const events: SignalEventViewModel[] = [];
  for (const logRecord of logRecords) {
    const side = deriveSignalSide(logRecord);
    if (!side) {
      continue;
    }
    events.push({ side, timestamp: logRecord.timestamp });
    if (events.length >= SIGNAL_EVENT_DISPLAY_LIMIT) {
      break;
    }
  }
  return events;
};

const ORDER_SYMBOL_KEYS = [
  'symbol',
  'ticker',
  'contract',
  'instrument',
  'security',
  'code'
];

const ORDER_QUANTITY_KEYS = [
  'quantity',
  'qty',
  'size',
  'amount',
  'order_quantity',
  'shares',
  'lots'
];

const ORDER_STATUS_KEYS = [
  'status',
  'state',
  'order_status',
  'exec_status',
  'result'
];

const normalizeDetailKey = (key: string): string => key.replace(/[^a-z0-9]+/gi, '').toLowerCase();

const pickFromDetailEntries = (
  entries: RuntimeLogDetailEntry[],
  keys: string[],
  coercer: 'string' | 'number'
): string | number | null => {
  const normalizedKeys = new Set(keys.map((k) => normalizeDetailKey(k)));
  for (const entry of entries) {
    const normKey = normalizeDetailKey(entry.key);
    if (normalizedKeys.has(normKey)) {
      if (coercer === 'number') {
        const n = toNumberOrNull(entry.value);
        if (n !== null) return n;
      } else {
        const s = toStringOrNull(entry.value);
        if (s !== null) return s;
      }
    }
  }
  return null;
};

const pickFromObjects = (
  objects: Array<Record<string, unknown | undefined | null>>, 
  keys: string[],
  coercer: 'string' | 'number'
): string | number | null => {
  const normalizedKeys = new Set(keys.map((k) => normalizeDetailKey(k)));
  for (const obj of objects) {
    if (!obj) continue;
    for (const [k, v] of Object.entries(obj)) {
      const nk = normalizeDetailKey(k);
      if (!normalizedKeys.has(nk)) continue;
      if (coercer === 'number') {
        const n = toNumberOrNull(v);
        if (n !== null) return n;
      } else {
        const s = toStringOrNull(v);
        if (s !== null) return s;
      }
    }
  }
  return null;
};

const collectOrderExecutions = (record: Record<string, unknown> | null): OrderExecutionViewModel[] => {
  if (!record) return [];
  const logRecords = sortLogRecords(
    gatherLogRecords(
      record['order_events'],
      record['orders'],
      record['events'],
      record['logs'],
      record['log_entries'],
      record['logHistory'],
      record['history'],
      record['entries']
    )
  );

  const items: OrderExecutionViewModel[] = [];
  for (const lr of logRecords) {
    const details = lr.details ?? [];
    const raw = lr.raw ?? {};
    const rawDetails = (raw['details'] ?? null) as Record<string, unknown> | null;
    const payload = (raw['payload'] ?? null) as Record<string, unknown> | null;
    const orderObj = (raw['order'] ?? null) as Record<string, unknown> | null;

    const side = deriveSignalSide(lr);
    const symbol =
      (pickFromDetailEntries(details, ORDER_SYMBOL_KEYS, 'string') as string | null) ??
      (pickFromObjects([raw, rawDetails ?? {}, payload ?? {}, orderObj ?? {}], ORDER_SYMBOL_KEYS, 'string') as
        string | null);

    const quantity =
      (pickFromDetailEntries(details, ORDER_QUANTITY_KEYS, 'number') as number | null) ??
      (pickFromObjects([raw, rawDetails ?? {}, payload ?? {}, orderObj ?? {}], ORDER_QUANTITY_KEYS, 'number') as
        number | null);

    const statusRaw =
      (pickFromDetailEntries(details, ORDER_STATUS_KEYS, 'string') as string | null) ??
      (pickFromObjects([raw, rawDetails ?? {}, payload ?? {}, orderObj ?? {}], ORDER_STATUS_KEYS, 'string') as
        string | null);
    const status = statusRaw ? statusRaw.trim().toUpperCase() : null;
    items.push({
      id: lr.id,
      side,
      symbol: symbol ?? null,
      quantity: quantity ?? null,
      status,
      timestamp: lr.timestamp ?? null
    });
    if (items.length >= 10) break;
  }
  return items;
};
interface CollectPhaseLogsOptions {
  normalizedTemplate?: string | null;
  phaseKey?: string | null;
  includeEvents?: boolean;
}

const DYNAMIC_ORB_TEMPLATE_KEY = 'dynamic_orb_breakout';

const isDynamicOrbStageCompleteMessage = (value: string | null | undefined): boolean => {
  if (!value) {
    return false;
  }
  return /orb\s*\d+.*stage\s*complete/i.test(value);
};

const normalizeOrbStageName = (value: string | null | undefined): string | null => {
  if (!value) {
    return null;
  }
  const match = value.match(/orb\s*\d+/i);
  return match ? match[0].replace(/\s+/g, '').toUpperCase() : null;
};

const buildDynamicOrbStageCompleteDetails = (
  stageName: string | null,
  rawDetails: Record<string, unknown> | null
): RuntimeLogDetailEntry[] => {
  const candlesProcessed = rawDetails?.['candles_processed'];
  const candlesRequired = rawDetails?.['candles_required'];
  const isComplete = toBooleanOrNull(rawDetails?.['complete']);
  const conditionText = stageName ? `${stageName} 完成` : 'ORB 阶段完成';
  const resultText = isComplete === false ? 'FAIL' : 'PASS';

  return [
    { key: '条件', value: conditionText },
    { key: '现值', value: formatLogMetricValue(candlesProcessed) },
    { key: '阈值', value: formatLogMetricValue(candlesRequired) },
    { key: '结果', value: resultText }
  ];
};

const formatOrbCount = (value: number | null): string | null => {
  if (value === null || Number.isNaN(value)) {
    return null;
  }
  const normalized = Math.max(0, Math.round(value));
  return normalized.toString();
};

const deriveDynamicOrbStageSummary = (rawDetails: unknown): string | null => {
  if (!rawDetails || typeof rawDetails !== 'object' || Array.isArray(rawDetails)) {
    return null;
  }
  const details = rawDetails as Record<string, unknown>;
  const stageName = toStringOrNull(details.stage) ?? toStringOrNull(details.name);
  if (!stageName) {
    return null;
  }

  const complete = toBooleanOrNull(details.complete);
  const breakoutUp = toNumberOrNull(details.breakouts_up);
  const breakoutDown = toNumberOrNull(details.breakouts_down);
  const retests = toNumberOrNull(details.retests);
  const failures = toNumberOrNull(details.failures);

  const segments: string[] = [];
  const statusSegment =
    complete === true ? '✅ 完成' : complete === false ? '⏳ 构建中' : 'ℹ️ 更新';
  segments.push(`${stageName} ${statusSegment}`.trim());

  const breakoutParts: string[] = [];
  const breakoutUpText = formatOrbCount(breakoutUp);
  if (breakoutUpText !== null) {
    breakoutParts.push(`↑${breakoutUpText}`);
  }
  const breakoutDownText = formatOrbCount(breakoutDown);
  if (breakoutDownText !== null) {
    breakoutParts.push(`↓${breakoutDownText}`);
  }
  if (breakoutParts.length) {
    segments.push(breakoutParts.join(' '));
  }

  const retestText = formatOrbCount(retests);
  if (retestText !== null) {
    segments.push(`Retest ${retestText}`);
  }

  if (failures !== null && failures > 0) {
    const failureText = formatOrbCount(failures);
    if (failureText !== null) {
      segments.push(`失败 ${failureText}`);
    }
  }

  if (segments.length === 1) {
    segments.push('阶段更新');
  }

  return segments.join(' · ');
};

const OUTCOME_LABELS = ['pass', 'passed', 'success', 'ok', 'true'] as const;
const OUTCOME_FAILURE_LABELS = ['fail', 'failed', 'error', 'false'] as const;

const extractOutcomeFromText = (value: string): 'PASS' | 'FAIL' | null => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (/\bfail\b/.test(normalized)) {
    return 'FAIL';
  }
  if (/\bpass\b/.test(normalized)) {
    return 'PASS';
  }
  for (const token of OUTCOME_FAILURE_LABELS) {
    if (normalized === token) {
      return 'FAIL';
    }
  }
  for (const token of OUTCOME_LABELS) {
    if (normalized === token) {
      return 'PASS';
    }
  }
  return null;
};

const deriveOutcomeFromDetails = (
  message: string,
  details: RuntimeLogDetailEntry[]
): 'PASS' | 'FAIL' | null => {
  const messageOutcome = extractOutcomeFromText(message);
  if (messageOutcome) {
    return messageOutcome;
  }
  let sawPass = false;
  for (const detail of details) {
    const key = detail.key.trim().toLowerCase();
    if (key === 'result' || key === 'outcome' || key === 'passed' || key === 'status') {
      const outcome = extractOutcomeFromText(detail.value);
      if (outcome) {
        if (outcome === 'FAIL') {
          return 'FAIL';
        }
        sawPass = true;
      }
      continue;
    }
    const outcomeFromValue = extractOutcomeFromText(detail.value);
    if (outcomeFromValue) {
      if (outcomeFromValue === 'FAIL') {
        return 'FAIL';
      }
      sawPass = true;
    }
  }
  return sawPass ? 'PASS' : null;
};

const collectPhaseLogs = (
  record: Record<string, unknown> | null,
  options: CollectPhaseLogsOptions = {}
): RuntimeLogEntry[] => {
  if (!record) {
    return [];
  }

  const normalizedTemplate =
    typeof options.normalizedTemplate === 'string'
      ? options.normalizedTemplate.trim().toLowerCase()
      : '';
  const phaseKey = options.phaseKey ?? null;
  const enhanceDynamicOrbLogs =
    normalizedTemplate === DYNAMIC_ORB_TEMPLATE_KEY && phaseKey === 'batch_aggregation';
  const dedupeDynamicOrbStageComplete =
    normalizedTemplate === DYNAMIC_ORB_TEMPLATE_KEY && phaseKey === 'signal_generation';

  const includeEvents = options.includeEvents !== false;
  const logSources = [
    record.logs,
    record.log_entries,
    record.logHistory,
    record.history,
    includeEvents ? record.events : null,
    record.entries
  ];
  const logRecords = sortLogRecords(gatherLogRecords(...logSources));

  const entries: RuntimeLogEntry[] = [];
  const stageCompleteSeen = new Set<string>();
  for (const item of logRecords) {
    let message = item.message;
    let details = item.details;
    const rawDetails = (() => {
      const candidate = item.raw?.['details'];
      return candidate && typeof candidate === 'object' && !Array.isArray(candidate)
        ? (candidate as Record<string, unknown>)
        : null;
    })();

    if (enhanceDynamicOrbLogs) {
      const summary = deriveDynamicOrbStageSummary(item.raw?.['details']);
      if (summary) {
        const originalMessage = message;
        message = summary;
        if (originalMessage && originalMessage !== summary) {
          const normalizedOriginalMessage = originalMessage.replace(/stage\s+updated/gi, '阶段更新');
          details = [{ key: '原始消息', value: normalizedOriginalMessage }, ...details];
        }
      }
    }

    if (dedupeDynamicOrbStageComplete) {
      const statusCode = toStringOrNull(rawDetails?.['status_code']);
      const stageName =
        toStringOrNull(rawDetails?.['stage']) ?? normalizeOrbStageName(message) ?? normalizeOrbStageName(item.message);
      const isStageComplete =
        statusCode === 'stage_completed' || isDynamicOrbStageCompleteMessage(message);
      if (isStageComplete) {
        const timestampKey = item.timestampValue ?? item.timestamp ?? item.id;
        const dedupKey = `${stageName ?? 'orb'}-${timestampKey}`;
        if (stageCompleteSeen.has(dedupKey)) {
          continue;
        }
        stageCompleteSeen.add(dedupKey);
        details = buildDynamicOrbStageCompleteDetails(stageName, rawDetails);
      }
    }

    let level = item.level;
    let tone = item.tone;
    if (phaseKey === 'signal_generation') {
      const outcome = deriveOutcomeFromDetails(message, details);
      if (outcome) {
        if (!extractOutcomeFromText(message)) {
          message = `${message} -> ${outcome}`;
        }
        if (outcome === 'FAIL') {
          level = 'WARN';
          tone = 'warning';
        } else {
          tone = 'success';
        }
      }
    }

    entries.push({
      id: item.id,
      level,
      tone,
      timestamp: item.timestamp,
      message,
      details,
      raw: item.raw
    });

    if (entries.length >= 20) {
      break;
    }
  }

  return entries;
};

const buildKlinePhase = (
  key: string,
  record: Record<string, unknown> | null,
  normalizedTemplate?: string | null,
  snapshot?: StrategyRuntimeDetail['snapshot'] | null | undefined
): KlineRuntimePhaseViewModel => {
  const normalizedKey = key as keyof typeof DEFAULT_KLINE_PHASE_LABELS;
  const title = getPhaseTitle(normalizedKey);
  const phaseRecord = record ?? {};
  const statusRaw = pickString(
    phaseRecord.status,
    phaseRecord.state,
    phaseRecord.phase_status,
    phaseRecord.stage_status,
    phaseRecord.health
  );
  const status = statusRaw ? statusRaw.trim().toUpperCase() : null;

  const statusReason = pickString(
    phaseRecord.status_reason,
    phaseRecord.reason,
    phaseRecord.message,
    phaseRecord.description
  );
  const statusCause = pickString(
    phaseRecord.status_cause,
    phaseRecord.cause,
    phaseRecord.error,
    phaseRecord.error_detail
  );
  const statusCauseCode = pickString(
    phaseRecord.status_cause_code,
    phaseRecord.code,
    phaseRecord.status_code,
    phaseRecord.error_code
  );
  const descriptorParts = new Set<string>();
  if (statusReason) {
    descriptorParts.add(statusReason);
  }
  if (statusCauseCode) {
    descriptorParts.add(statusCauseCode);
  }
  const statusDescriptor = descriptorParts.size ? Array.from(descriptorParts).join(' · ') : null;
  const toneContext = statusDescriptor ?? statusCause ?? null;
  const statusTone = determinePhaseTone(status, toneContext);
  const metrics = collectPhaseMetrics(phaseRecord);
  const phaseLogs = collectPhaseLogs(record, {
    normalizedTemplate,
    phaseKey: normalizedKey
  });
  const processingLogs = collectProcessingLogsForPhase(snapshot ?? null, normalizedKey, normalizedTemplate);
  const logs = mergePhaseLogs(phaseLogs, processingLogs);
  const signalEvents =
    key === 'signal_generation' ? collectSignalEvents(record, snapshot ?? null) : [];
  const stageLogs =
    key === 'signal_generation'
      ? collectPhaseLogs(record, {
          normalizedTemplate,
          phaseKey: normalizedKey,
          includeEvents: false
        })
      : [];
  const stageSignals =
    key === 'signal_generation' ? stageLogs.slice(0, SIGNAL_STAGE_DISPLAY_LIMIT) : [];
  const dataProcessingLogs =
    key === 'signal_generation'
      ? processingLogs.slice(0, SIGNAL_PROCESSING_DISPLAY_LIMIT)
      : [];
  const orderExecutions = key === 'order_execution' ? collectOrderExecutions(record) : [];

  return {
    key,
    title,
    status,
    statusDescriptor,
    statusReason: statusReason ?? null,
    statusCause: statusCause ?? null,
    statusTone,
    metrics,
    logs,
    signalEvents,
    stageSignals,
    dataProcessingLogs,
    orderExecutions,
    raw: record ?? null
  };
};

export const buildKlineRuntimeMetrics = (
  runtime: StrategyRuntimeDetail | null,
  normalizedTemplate?: string | null
): KlineRuntimeMetricsViewModel => {
  const snapshot = runtime?.snapshot ?? null;
  const summaryRecord = snapshot?.summary as Record<string, unknown> | null | undefined;
  const dataPushRecord = snapshot?.data_push as Record<string, unknown> | null | undefined;
  const subscriptionRecord = findPhaseRecord(snapshot, KLINE_PHASE_VARIANTS.subscription);
  const subscriptionMetrics = (subscriptionRecord?.metrics ?? null) as
    | Record<string, unknown>
    | null;
  const subscriptionSummary = (subscriptionRecord?.summary ?? null) as
    | Record<string, unknown>
    | null;
  const subscriptionCounts = (subscriptionRecord?.counts ?? null) as
    | Record<string, unknown>
    | null;

  const rawInterval = pickString(
    summaryRecord?.['interval'],
    summaryRecord?.['candle_interval'],
    dataPushRecord?.['interval'],
    dataPushRecord?.['subscription_interval'],
    subscriptionRecord?.['interval'],
    subscriptionRecord?.['subscription_interval'],
    subscriptionMetrics?.['interval'],
    subscriptionMetrics?.['subscription_interval'],
    subscriptionSummary?.['interval'],
    subscriptionCounts?.['interval']
  );

  const intervalSeconds = pickNumber(
    summaryRecord?.['intervalSeconds'],
    dataPushRecord?.['intervalSeconds'],
    subscriptionMetrics?.['intervalSeconds'],
    subscriptionSummary?.['intervalSeconds'],
    subscriptionCounts?.['intervalSeconds']
  );

  const barMinutes = pickNumber(
    summaryRecord?.['bar_minutes'],
    dataPushRecord?.['bar_minutes'],
    subscriptionMetrics?.['bar_minutes'],
    subscriptionSummary?.['bar_minutes'],
    subscriptionCounts?.['bar_minutes']
  );

  const intervalValue =
    normalizeIntervalText(rawInterval) ??
    (typeof barMinutes === 'number' && Number.isFinite(barMinutes) && barMinutes > 0
      ? `${Math.floor(barMinutes)}m`
      : null) ??
    normalizeIntervalText(intervalSeconds) ??
    rawInterval;

  const rawLabel =
    pickString(
      summaryRecord?.['interval_label'],
      summaryRecord?.['interval_display'],
      dataPushRecord?.['interval_label'],
      dataPushRecord?.['interval_display'],
      subscriptionRecord?.['interval_label'],
      subscriptionRecord?.['interval_display'],
      subscriptionMetrics?.['interval_label'],
      subscriptionMetrics?.['interval_display'],
      subscriptionSummary?.['interval_label'],
      subscriptionCounts?.['interval_label']
    ) ?? null;

  const intervalLabel = rawLabel ?? intervalValue;

  const normalizedTemplateKey =
    typeof normalizedTemplate === 'string' ? normalizedTemplate.trim().toLowerCase() : '';

  return {
    interval: intervalValue,
    intervalLabel,
    phases: PHASE_KEYS.map((phaseKey) =>
      buildKlinePhase(
        phaseKey,
        findPhaseRecord(snapshot, KLINE_PHASE_VARIANTS[phaseKey]),
        normalizedTemplateKey,
        snapshot
      )
    )
  };
};

const formatInteger = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  }).format(value);

export const formatRuntimeSeconds = (value: number | null | undefined): string => {
  if (value === null || value === undefined) {
    return '—';
  }
  if (!Number.isFinite(value)) {
    return value.toString();
  }
  const normalized = Math.max(0, Math.round(value));
  return formatInteger(normalized);
};

const formatUsd = (value: number): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);

const combineReasonAndCause = (
  reason: string | null | undefined,
  cause: string | null | undefined
): string | null => {
  const normalizedReason = typeof reason === 'string' ? reason.trim() : '';
  const normalizedCause = typeof cause === 'string' ? cause.trim() : '';

  if (!normalizedReason && !normalizedCause) {
    return null;
  }

  if (normalizedReason && normalizedCause) {
    const lowerReason = normalizedReason.toLowerCase();
    const lowerCause = normalizedCause.toLowerCase();
    if (lowerReason.includes(lowerCause)) {
      return normalizedReason;
    }
    return `${normalizedReason} · ${normalizedCause}`;
  }

  return normalizedReason || normalizedCause;
};

const resolveReceivingDescriptor = (metrics: DomRuntimeMetricsViewModel): string | null =>
  combineReasonAndCause(metrics.receivingReason, metrics.receivingCause);

const DEFAULT_DATA_LABEL = 'DOM';

const normalizeDataLabel = (label: string | null | undefined): string => {
  if (!label) {
    return DEFAULT_DATA_LABEL;
  }
  const trimmed = label.trim();
  return trimmed || DEFAULT_DATA_LABEL;
};

const formatAwaitingDataText = (label: string): string =>
  (i18n.t('strategies.runtime.common.awaiting_text', { label }) as string);

const formatAwaitingDataHintText = (label: string): string =>
  (i18n.t('strategies.runtime.common.awaiting_hint', { label }) as string);

const formatLastDataTimestampText = (label: string, timestamp: string): string =>
  (i18n.t('strategies.runtime.common.last_data_timestamp', { label, timestamp }) as string);

export const formatStopPrice = (
  enabled: boolean | null,
  price: number | null | undefined
): string => {
  if (enabled === false) {
    return i18n.t('strategies.runtime.common.not_enabled') as string;
  }
  if (price === null || price === undefined) {
    return '—';
  }
  if (!Number.isFinite(price)) {
    return price.toString();
  }
  return formatUsd(price);
};

export const formatReceivingStatus = (metrics: DomRuntimeMetricsViewModel): string => {
  if (metrics.isReceivingData === true) {
    return 'Yes';
  }
  const descriptor = resolveReceivingDescriptor(metrics);
  const label = normalizeDataLabel(metrics.dataLabel);
  if (metrics.awaitingData) {
    const awaitingText = formatAwaitingDataText(label);
    return descriptor ? `${awaitingText} (${descriptor})` : awaitingText;
  }
  if (metrics.isReceivingData === false) {
    return descriptor ? `No — ${descriptor}` : 'No';
  }
  return descriptor ?? '—';
};

export const formatDataFeedHint = (metrics: DomRuntimeMetricsViewModel): string | null => {
  const parts: string[] = [];

  if (metrics.isReceivingData === true) {
    parts.push('接收中');
  } else if (metrics.awaitingData) {
    parts.push(formatAwaitingDataHintText(normalizeDataLabel(metrics.dataLabel)));
  } else {
    parts.push('未接收');
  }

  const descriptor = resolveReceivingDescriptor(metrics);
  if (descriptor && !metrics.awaitingData) {
    parts.push(descriptor);
  }

  if (metrics.dataPushSubscription) {
    parts.push(`订阅 ${metrics.dataPushSubscription}`);
  }

  if (metrics.dataPushSymbol) {
    parts.push(`标的 ${metrics.dataPushSymbol}`);
  }

  if (metrics.dataPushLastTimestamp) {
    parts.push(
      formatLastDataTimestampText(normalizeDataLabel(metrics.dataLabel), metrics.dataPushLastTimestamp)
    );
  }

  if (metrics.dataFeedLogs.length) {
    parts.push(`最近 ${metrics.dataFeedLogs.length} 条`);
  }

  return parts.length ? parts.join(' · ') : null;
};

const DATA_PUSH_SYMBOL_KEYS = [
  'symbol',
  'ticker',
  'instrument',
  'security',
  'contract',
  'code'
];

const SUBSCRIPTION_INTERVAL_KEYS = [
  'interval',
  'timeframe',
  'subscription_interval',
  'bar_interval',
  'barInterval',
  'candle_interval',
  'candleInterval',
  'kline_interval',
  'klineInterval'
];

const SUBSCRIPTION_TIMESTAMP_KEYS = [
  'subscribed_at',
  'subscribedAt',
  'created_at',
  'createdAt',
  'timestamp',
  'time',
  'updated_at',
  'updatedAt'
];

const extractDataPushSymbol = (record: Record<string, unknown> | null): string | null => {
  if (!record) {
    return null;
  }
  return pickString(...DATA_PUSH_SYMBOL_KEYS.map((key) => record[key]));
};

const collectSubscriptionStatuses = (
  records: Record<string, unknown>[],
  fallbackSymbol: string | null
): DomSubscriptionStatusEntry[] => {
  const entries: DomSubscriptionStatusEntry[] = [];
  const seen = new Set<string>();

  for (const record of records) {
    if (!record) {
      continue;
    }
    const symbolValue = extractDataPushSymbol(record) ?? fallbackSymbol ?? '—';
    const intervalRaw = pickString(...SUBSCRIPTION_INTERVAL_KEYS.map((key) => record[key]));
    const intervalSeconds = pickNumber(record.intervalSeconds, record.interval_seconds, record.bar_seconds);
    const barMinutes = pickNumber(record.bar_minutes, record.barMinutes);
    const interval =
      normalizeIntervalText(intervalRaw) ??
      (typeof barMinutes === 'number' && Number.isFinite(barMinutes) && barMinutes > 0
        ? `${Math.floor(barMinutes)}m`
        : null) ??
      normalizeIntervalText(intervalSeconds) ??
      intervalRaw ??
      null;
    const subscribedAtRaw = SUBSCRIPTION_TIMESTAMP_KEYS.map((key) => record[key]).find(
      (value) => value !== undefined && value !== null
    );
    const subscribedAt = parseDomTimestamp(subscribedAtRaw) ?? toStringOrNull(subscribedAtRaw);

    const key = `${symbolValue}-${interval ?? ''}-${subscribedAt ?? ''}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    entries.push({
      symbol: symbolValue,
      interval,
      subscribedAt
    });
  }

  return entries;
};

const normalizeDataPushCollection = (value: unknown): Record<string, unknown>[] => {
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.filter((item): item is Record<string, unknown> => isPlainObject(item));
  }
  if (isPlainObject(value)) {
    const record = value as Record<string, unknown>;
    const hasDirectMarkers = ['symbol', 'subscription', 'status', 'data_label', 'last_data_timestamp'].some(
      (key) => key in record
    );
    if (hasDirectMarkers) {
      return [record];
    }
    const nestedRecords = Object.values(record).filter((item): item is Record<string, unknown> =>
      isPlainObject(item)
    );
    if (nestedRecords.length) {
      return nestedRecords;
    }
  }
  return [];
};

interface DomMetricsSourceGroup {
  symbol: string | null;
  dataPushRecords: Record<string, unknown>[];
  subscriptionRecords: Record<string, unknown>[];
}

const collectDomMetricsSources = (
  snapshot: StrategyRuntimeDetail['snapshot'] | null | undefined
): DomMetricsSourceGroup[] => {
  if (!snapshot) {
    return [];
  }
  const dataPushes = normalizeDataPushCollection((snapshot as Record<string, unknown>)['data_pushes']);
  const subscriptions = normalizeDataPushCollection((snapshot as Record<string, unknown>)['subscriptions']);

  const groups = new Map<string, DomMetricsSourceGroup>();

  const addRecord = (
    record: Record<string, unknown>,
    index: number,
    kind: 'dataPush' | 'subscription'
  ) => {
    const symbol = extractDataPushSymbol(record);
    const key = symbol ? symbol : `${kind}-${index}`;
    const entry =
      groups.get(key) ?? {
        symbol: symbol ?? null,
        dataPushRecords: [],
        subscriptionRecords: []
      };
    if (kind === 'dataPush') {
      entry.dataPushRecords.push(record);
    } else {
      entry.subscriptionRecords.push(record);
    }
    groups.set(key, entry);
  };

  dataPushes.forEach((record, index) => addRecord(record, index, 'dataPush'));
  subscriptions.forEach((record, index) => addRecord(record, index, 'subscription'));

  return Array.from(groups.values());
};

const buildDomRuntimeMetricsEntry = (
  runtime: StrategyRuntimeDetail | null,
  options: {
    dataPushRecord?: Record<string, unknown> | null;
    subscriptionRecord?: Record<string, unknown> | null;
    subscriptionRecords?: Record<string, unknown>[];
    symbolOverride?: string | null;
    includeSnapshotLogs?: boolean;
    includeSnapshotDataPush?: boolean;
    includeSnapshotSubscriptions?: boolean;
  }
): DomRuntimeMetricsViewModel => {
  const snapshot = runtime?.snapshot ?? null;
  const summary =
    snapshot?.summary ?? (snapshot?.dom_runtime as Record<string, unknown> | undefined) ?? null;
  const getSummaryValue = (key: string): unknown => (summary ? summary[key] : undefined);
  const fallbackDataPush =
    options.includeSnapshotDataPush !== false
      ? (snapshot?.data_push ??
          (snapshot?.market_data_subscription as Record<string, unknown> | undefined) ??
          null)
      : null;
  const dataPush =
    options.dataPushRecord ??
    options.subscriptionRecord ??
    (fallbackDataPush as Record<string, unknown> | null) ??
    null;
  const fallbackSubscriptions =
    options.includeSnapshotSubscriptions !== false
      ? normalizeDataPushCollection((snapshot as Record<string, unknown> | null)?.['subscriptions'])
      : [];
  const subscriptionRecords =
    options.subscriptionRecords ?? (options.subscriptionRecord ? [options.subscriptionRecord] : fallbackSubscriptions);
  const getDataPushValue = (key: string): unknown => {
    const dataPushValue = options.dataPushRecord ? options.dataPushRecord[key] : undefined;
    if (dataPushValue !== undefined) {
      return dataPushValue;
    }
    const subscriptionValue = options.subscriptionRecord ? options.subscriptionRecord[key] : undefined;
    if (subscriptionValue !== undefined) {
      return subscriptionValue;
    }
    return dataPush ? dataPush[key] : undefined;
  };
  const stopLevels = snapshot?.stop_levels ?? null;
  const getStopLevelValue = (key: string): unknown => (stopLevels ? stopLevels[key] : undefined);
  const includeSnapshotLogs = options.includeSnapshotLogs !== false;
  const logsSource = includeSnapshotLogs && Array.isArray(snapshot?.logs) ? (snapshot?.logs as unknown[]) : undefined;
  // Also surface kline batch aggregation logs in the top-level data feed log
  // so users can see bar processing results alongside DOM subscription events.
  const batchPhaseLogs = includeSnapshotLogs
    ? collectPhaseLogs(findPhaseRecord(snapshot, KLINE_PHASE_VARIANTS.batch_aggregation), {
        phaseKey: 'batch_aggregation'
      })
    : [];

  const isDataFeedConnected =
    String(getSummaryValue('data_feed_status') ?? '').toLowerCase() === 'connected';
  const isSubscriptionConnected =
    String(getDataPushValue('status') ?? '').toLowerCase() === 'connected';

  const isReceivingData = pickBoolean(
    getSummaryValue('is_receiving_data'),
    snapshot?.is_receiving_data,
    getDataPushValue('is_receiving_data'),
    getSummaryValue('isReceivingData'),
    isDataFeedConnected || isSubscriptionConnected ? true : null
  );

  let effectiveIsReceivingData = isReceivingData;

  const receivingReason = pickString(
    getDataPushValue('status_reason'),
    getSummaryValue('data_push_reason'),
    getSummaryValue('receiving_reason')
  );

  const receivingCause = pickString(
    getDataPushValue('status_cause'),
    getSummaryValue('data_push_cause'),
    getSummaryValue('receiving_cause')
  );

  const receivingCauseCode = pickString(
    getDataPushValue('status_cause_code'),
    getSummaryValue('data_push_cause_code'),
    getSummaryValue('receiving_cause_code')
  );

  const awaitingDataRaw = pickBoolean(snapshot?.awaiting_data, getSummaryValue('awaiting_data')) ?? false;

  let awaitingData = awaitingDataRaw && isReceivingData !== true;
  const dataPushRecord = dataPush ?? null;
  if (!awaitingData && dataPushRecord) {
    const causeCode = dataPushRecord.status_cause_code;
    if (typeof causeCode === 'string' && causeCode === 'awaiting_data') {
      awaitingData = true;
    }
  }

  const dataPushSubscription = pickString(
    getDataPushValue('subscription'),
    getSummaryValue('data_push_subscription')
  );

  const dataPushSymbol = pickString(
    getDataPushValue('symbol'),
    options.symbolOverride,
    getSummaryValue('data_push_symbol'),
    summary?.primary_symbol
  );

  const subscriptionStatuses = collectSubscriptionStatuses(subscriptionRecords, dataPushSymbol);

  const dataPushLastTimestamp = parseDomTimestamp(
    getDataPushValue('last_data_timestamp') ?? getSummaryValue('last_data_timestamp')
  );

  const runtimeSeconds = pickNumber(
    getSummaryValue('runtime_seconds'),
    snapshot?.runtime_seconds,
    getSummaryValue('runtimeSeconds')
  );

  const domMessages = pickNumber(
    getSummaryValue('processed_count'),
    snapshot?.processed_count,
    getSummaryValue('signals_processed'),
    snapshot?.signals_processed
  );

  const thresholdHits = pickNumber(
    getSummaryValue('threshold_hits'),
    snapshot?.threshold_hits,
    getSummaryValue('threshold_triggers')
  );

  const buySignals = pickNumber(
    getSummaryValue('buy_signals'),
    snapshot?.buy_signals,
    getSummaryValue('signals_buy'),
    snapshot?.signals_buy
  );

  const sellSignals = pickNumber(
    getSummaryValue('sell_signals'),
    snapshot?.sell_signals,
    getSummaryValue('signals_sell'),
    snapshot?.signals_sell
  );

  const stopLossEnabled = pickBoolean(
    getStopLevelValue('stop_loss_enabled'),
    getSummaryValue('sl_enabled'),
    snapshot?.sl_enabled,
    getSummaryValue('stop_loss_enabled')
  );

  const stopLossPrice = pickNumber(
    getStopLevelValue('stop_loss_price'),
    getSummaryValue('sl_price'),
    snapshot?.sl_price,
    getSummaryValue('stop_loss_price')
  );

  const takeProfitEnabled = pickBoolean(
    getStopLevelValue('take_profit_enabled'),
    getSummaryValue('tp_enabled'),
    snapshot?.tp_enabled,
    getSummaryValue('take_profit_enabled')
  );

  const takeProfitPrice = pickNumber(
    getStopLevelValue('take_profit_price'),
    getSummaryValue('tp_price'),
    snapshot?.tp_price,
    getSummaryValue('take_profit_price')
  );

  const dataFeedLogsRaw = parseDataFeedLogs(
    batchPhaseLogs,
    logsSource,
    includeSnapshotLogs ? snapshot?.data_push_logs : undefined,
    getDataPushValue('logs'),
    getDataPushValue('data_push_logs'),
    includeSnapshotLogs ? getSummaryValue('data_push_logs') : undefined
  );

  const dataFeedLogs = dataFeedLogsRaw.slice(0, 20);

  const latestLog = dataFeedLogs.length ? dataFeedLogs[0] : null;
  const normalizedReason = normalizeDescriptorText(receivingReason);
  const normalizedCause = normalizeDescriptorText(receivingCause);
  const normalizedCauseCode = normalizeDescriptorText(receivingCauseCode);
  const normalizedMessage = normalizeDescriptorText(latestLog?.message);
  const latestTone = latestLog?.tone ?? null;

  const failureByTone = latestTone === 'error' || latestTone === 'warning';
  const failureByCauseCode = hasFailureSignal(normalizedCauseCode);
  const failureByCause = hasFailureSignal(normalizedCause);
  if (failureByTone || failureByCauseCode || failureByCause) {
    effectiveIsReceivingData = false;
    const awaitingFromSignals =
      hasAwaitingSignal(normalizedCauseCode) ||
      hasAwaitingSignal(normalizedCause) ||
      hasAwaitingSignal(normalizedReason) ||
      hasAwaitingSignal(normalizedMessage);
    awaitingData = awaitingData || latestTone === 'warning' || awaitingFromSignals;
  }

  const dataLabel = normalizeDataLabel(
    pickString(
      getSummaryValue('data_label'),
      getDataPushValue('data_label'),
      getSummaryValue('dataLabel'),
      getDataPushValue('dataLabel')
    )
  );

  return {
    isReceivingData: effectiveIsReceivingData,
    receivingReason,
    receivingCause,
    receivingCauseCode,
    dataLabel,
    awaitingData,
    dataPushSubscription,
    dataPushSymbol,
    dataPushLastTimestamp,
    subscriptionStatuses,
    runtimeSeconds,
    domMessages,
    thresholdHits,
    buySignals,
    sellSignals,
    stopLossEnabled,
    stopLossPrice,
    takeProfitEnabled,
    takeProfitPrice,
    dataFeedLogs
  };
};

export const buildDomRuntimeMetrics = (
  runtime: StrategyRuntimeDetail | null
): DomRuntimeMetricsViewModel[] => {
  const snapshot = runtime?.snapshot ?? null;
  const sources = collectDomMetricsSources(snapshot);
  if (!sources.length) {
    return [
      buildDomRuntimeMetricsEntry(runtime, {
        includeSnapshotLogs: true,
        includeSnapshotDataPush: true,
        includeSnapshotSubscriptions: true
      })
    ];
  }

  const includeSnapshotLogs = sources.length <= 1;
  return sources.map((source) => {
    const dataPushRecord = mergePhaseRecords(source.dataPushRecords) ?? null;
    const subscriptionRecord = mergePhaseRecords(source.subscriptionRecords) ?? null;
    return buildDomRuntimeMetricsEntry(runtime, {
      dataPushRecord,
      subscriptionRecord,
      subscriptionRecords: source.subscriptionRecords,
      symbolOverride: source.symbol,
      includeSnapshotLogs,
      includeSnapshotDataPush: false,
      includeSnapshotSubscriptions: false
    });
  });
};
