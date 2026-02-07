import type { StrategyRuntimeDetail } from '@features/dashboard/types';
import {
  buildDomRuntimeMetrics,
  buildKlineRuntimeMetrics,
  formatDataFeedHint,
  formatReceivingStatus,
  formatRuntimeSeconds,
  formatStopPrice
} from './runtimeMetrics';
import { formatTimestamp } from './formatTimestamp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { __timezoneTestUtils } from '@utils/timezone';
import i18n from '@i18n';

const assert = (condition: unknown, message: string): void => {
  if (!condition) {
    throw new Error(message);
  }
};

const assertEqual = (left: unknown, right: unknown, message: string): void => {
  if (left !== right) {
    throw new Error(`${message}\nExpected: ${right}\nReceived: ${left}`);
  }
};

const runtimeLogs = Array.from({ length: 22 }, (_, index) => ({
  id: `log-${index}`,
  level: index % 2 === 0 ? 'ERROR' : 'error',
  tone: index === 21 ? 'info' : index % 4 === 0 ? 'neutral' : undefined,
  message: `event-${index}`,
  timestamp: '2024-05-01T00:00:00Z',
  details: index === 5 ? { code: 'RETRY', attempts: 3 } : undefined
}));

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const enTranslations = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../i18n/locales/en.json'), 'utf-8')
);
const zhTranslations = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../i18n/locales/zh.json'), 'utf-8')
);
i18n.addResourceBundle('en', 'translation', enTranslations, true, true);
i18n.addResourceBundle('zh', 'translation', zhTranslations, true, true);
i18n.changeLanguage('en');

const resolveTestLocale = (): string => {
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

const withMockedBrowserTimeZone = <T>(timeZone: string, callback: () => T): T => {
  const originalDateTimeFormat = Intl.DateTimeFormat;

  function mockedDateTimeFormat(localeArg?: string | string[], options?: Intl.DateTimeFormatOptions) {
    const baseOptions = options ?? {};
    const appliedOptions =
      baseOptions && typeof baseOptions === 'object' && 'timeZone' in baseOptions && baseOptions.timeZone
        ? baseOptions
        : { ...baseOptions, timeZone };

    const formatter = new originalDateTimeFormat(localeArg as string | string[] | undefined, appliedOptions);
    const resolved = formatter.resolvedOptions();
    formatter.resolvedOptions = () => ({
      ...resolved,
      timeZone
    });
    return formatter;
  }

  Object.defineProperty(Intl, 'DateTimeFormat', {
    configurable: true,
    writable: true,
    value: mockedDateTimeFormat
  });

  __timezoneTestUtils.resetRuntimeTimeZoneCache();
  try {
    return callback();
  } finally {
    Object.defineProperty(Intl, 'DateTimeFormat', {
      configurable: true,
      writable: true,
      value: originalDateTimeFormat
    });
    __timezoneTestUtils.resetRuntimeTimeZoneCache();
  }
};

const timestampFormatOptions: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
};

const runtimeDetail: StrategyRuntimeDetail = {
  strategyId: 'demo/dom',
  status: { active: true, enabled: true },
  snapshot: {
    summary: {
      is_receiving_data: true,
      awaiting_data: false,
      runtime_seconds: 15,
      processed_count: 50,
      threshold_hits: 3,
      buy_signals: 2,
      sell_signals: 1,
      data_push_reason: 'stable stream',
      data_label: 'Order Book'
    },
    data_push: {
      subscription: 'depth@binance',
      symbol: 'BTCUSDT',
      last_data_timestamp: '2024-05-01T00:02:03Z',
      status_reason: '连接正常',
      status_cause: '订阅稳定',
      status_cause_code: 'subscription_ok'
    },
    stop_levels: {
      stop_loss_enabled: true,
      stop_loss_price: 101.23,
      take_profit_enabled: false,
      take_profit_price: null
    },
    logs: runtimeLogs
  }
};

const domMetricsList = buildDomRuntimeMetrics(runtimeDetail);
const domMetrics = domMetricsList[0];

assertEqual(domMetrics.dataLabel, 'Order Book', 'Data label should resolve from the telemetry summary');
assertEqual(domMetrics.isReceivingData, true, 'Receiving state should prefer summary boolean strings');
assertEqual(domMetrics.receivingReason, '连接正常', 'Receiving reason should resolve from data push state');
assertEqual(domMetrics.awaitingData, false, 'Awaiting should disable when data is already being received');
assertEqual(domMetrics.receivingCause, '订阅稳定', 'Receiving cause should resolve from data push state');
assertEqual(domMetrics.receivingCauseCode, 'subscription_ok', 'Receiving cause code should resolve from data push state');
assertEqual(domMetrics.dataPushSubscription, 'depth@binance', 'Subscription should read from nested state');
assertEqual(domMetrics.dataPushSymbol, 'BTCUSDT', 'Symbol should read from nested state');
assert(domMetrics.dataPushLastTimestamp !== null, 'Last timestamp should parse into human readable form');
assertEqual(domMetrics.runtimeSeconds, 15, 'Runtime seconds should parse numeric strings');
assertEqual(domMetrics.domMessages, 50, 'DOM message count should parse numeric strings');
assertEqual(domMetrics.thresholdHits, 3, 'Threshold hits should come from summary when available');
assertEqual(domMetrics.buySignals, 2, 'Buy signals should use summary-provided counts');
assertEqual(domMetrics.sellSignals, 1, 'Sell signals should use summary-provided counts');
assertEqual(domMetrics.stopLossEnabled, true, 'Stop loss enabled should resolve from stop level values');
assertEqual(domMetrics.stopLossPrice, 101.23, 'Stop loss price should parse decimal strings');
assertEqual(domMetrics.takeProfitEnabled, false, 'Take profit enabled should parse falsey strings');
assertEqual(domMetrics.takeProfitPrice, null, 'Take profit price should remain null when missing');

const timezoneTimestamp = '2024-05-01T00:00:00Z';
const expectedUtcTimestamp = new Intl.DateTimeFormat(resolveTestLocale(), {
  ...timestampFormatOptions,
  timeZone: 'UTC'
})
  .format(new Date(timezoneTimestamp))
  .replace(/\u202f/g, ' ');

const expectedEasternTimestamp = new Intl.DateTimeFormat(resolveTestLocale(), {
  ...timestampFormatOptions,
  timeZone: 'America/New_York'
})
  .format(new Date(timezoneTimestamp))
  .replace(/\u202f/g, ' ');

const utcBrowserRendered = withMockedBrowserTimeZone('UTC', () => formatTimestamp(timezoneTimestamp));
assertEqual(
  utcBrowserRendered,
  expectedUtcTimestamp,
  'UTC browser timezones should render UTC timestamps without shifting to another region'
);

const easternBrowserRendered = withMockedBrowserTimeZone('America/New_York', () =>
  formatTimestamp(timezoneTimestamp)
);
assertEqual(
  easternBrowserRendered,
  expectedEasternTimestamp,
  'Non-UTC browser timezones should offset UTC timestamps into the local timezone'
);

const easternBrowserWithUtcPreference = withMockedBrowserTimeZone('America/New_York', () =>
  formatTimestamp(timezoneTimestamp, { timezone: 'UTC' })
);
assertEqual(
  easternBrowserWithUtcPreference,
  expectedUtcTimestamp,
  'Explicit UTC preferences should respect the UTC offset even when the browser timezone is non-UTC'
);

assertEqual(domMetrics.dataFeedLogs.length, 20, 'Data feed logs should be capped at the latest 20 entries');
const firstLog = domMetrics.dataFeedLogs[0];
assertEqual(firstLog?.id, 'log-21', 'Most recent logs should appear first');
assertEqual(firstLog?.level, 'ERROR', 'Log level should be uppercased');
assert(
  firstLog?.timestamp?.includes('2024') ?? false,
  'ISO timestamps should be converted to locale strings'
);

const lastLog = domMetrics.dataFeedLogs[domMetrics.dataFeedLogs.length - 1];
assertEqual(lastLog?.id, 'log-2', 'Oldest logs within the trimmed set should appear last');

const detailLog = domMetrics.dataFeedLogs.find((entry) => entry.message === 'event-5');
assert(detailLog, 'Specific log entries should be preserved after trimming');
if (detailLog) {
  const attempts = detailLog.details.find((item) => item.key === 'attempts');
  assertEqual(attempts?.value, '3', 'Structured log details should be flattened to key/value pairs');
}

assertEqual(formatReceivingStatus(domMetrics), 'Yes', 'Receiving copy should display "Yes" when active');

const awaitingMetrics = { ...domMetrics, isReceivingData: null, awaitingData: true };
assertEqual(
  formatReceivingStatus(awaitingMetrics),
  'Awaiting Order Book data… (连接正常 · 订阅稳定)',
  'Awaiting status should include the reason and cause when present'
);

const awaitingWithoutReason = {
  ...domMetrics,
  isReceivingData: null,
  awaitingData: true,
  receivingReason: null,
  receivingCause: null
};
assertEqual(
  formatReceivingStatus(awaitingWithoutReason),
  'Awaiting Order Book data…',
  'Awaiting status should fall back to generic copy when reason is missing'
);

const stoppedMetrics = {
  ...domMetrics,
  isReceivingData: false,
  awaitingData: false,
  receivingReason: 'manual stop',
  receivingCause: null
};
assertEqual(
  formatReceivingStatus(stoppedMetrics),
  'No — manual stop',
  'Stopped status should display the stop reason'
);

const stoppedWithCause = {
  ...domMetrics,
  isReceivingData: false,
  awaitingData: false,
  receivingReason: '手动暂停',
  receivingCause: '连接中断'
};
assertEqual(
  formatReceivingStatus(stoppedWithCause),
  'No — 手动暂停 · 连接中断',
  'Stopped status should append the receiving cause when available'
);

const unknownMetrics = {
  ...domMetrics,
  isReceivingData: null,
  awaitingData: false,
  receivingReason: null,
  receivingCause: null
};
assertEqual(
  formatReceivingStatus(unknownMetrics),
  '—',
  'Unknown status without a reason should display an em dash'
);

assertEqual(formatRuntimeSeconds(domMetrics.runtimeSeconds), '15', 'Runtime seconds should be formatted as integers');
assertEqual(formatRuntimeSeconds(null), '—', 'Missing runtime seconds should render an em dash');
assertEqual(formatRuntimeSeconds(Number.POSITIVE_INFINITY), 'Infinity', 'Infinite runtime should fall back to raw string form');

assertEqual(formatStopPrice(false, 123.45), '未启用', 'Disabled stop prices should return the not-enabled copy');
assertEqual(formatStopPrice(true, 101.23), '$101.23', 'Enabled stop prices should format as USD currency');
assertEqual(formatStopPrice(true, Number.POSITIVE_INFINITY), 'Infinity', 'Non-finite prices should fall back to string form');

const awaitingDetail = JSON.parse(JSON.stringify(runtimeDetail)) as StrategyRuntimeDetail;
awaitingDetail.snapshot.summary = {
  ...awaitingDetail.snapshot.summary,
  is_receiving_data: false,
  awaiting_data: true
};
const awaitingDomMetrics = buildDomRuntimeMetrics(awaitingDetail)[0];
assertEqual(awaitingDomMetrics.awaitingData, true, 'Awaiting should remain true when feed active but no DOM received');

const warningDetail = JSON.parse(JSON.stringify(runtimeDetail)) as StrategyRuntimeDetail;
if (warningDetail.snapshot?.data_push) {
  warningDetail.snapshot.data_push.status_cause = '订阅掉线，等待刷新';
  warningDetail.snapshot.data_push.status_cause_code = 'subscription_failed';
}
warningDetail.snapshot.logs = [
  {
    id: 'warn-1',
    level: 'WARN',
    tone: 'warning',
    timestamp: '2024-05-01T00:03:00Z',
    message: 'Subscription lost; awaiting refresh'
  }
];
const warningMetrics = buildDomRuntimeMetrics(warningDetail)[0];
assertEqual(warningMetrics.isReceivingData, false, 'Warning tone should disable receiving state');
assertEqual(warningMetrics.awaitingData, true, 'Warning tone should mark awaiting state from log context');
assertEqual(warningMetrics.receivingCauseCode, 'subscription_failed', 'Warning state should preserve the failure cause code');

assertEqual(
  warningMetrics.receivingCause,
  '订阅掉线，等待刷新',
  'Warning state should surface the last failure cause'
);

const errorDetail = JSON.parse(JSON.stringify(runtimeDetail)) as StrategyRuntimeDetail;
if (errorDetail.snapshot?.data_push) {
  errorDetail.snapshot.data_push.status_cause = '订阅失败，需要人工干预';
  errorDetail.snapshot.data_push.status_cause_code = 'subscription_error';
  errorDetail.snapshot.data_push.status_reason = null;
}
errorDetail.snapshot.logs = [
  {
    id: 'err-1',
    level: 'ERROR',
    tone: 'error',
    timestamp: '2024-05-01T00:04:00Z',
    message: 'Subscription failure detected'
  }
];
const errorMetrics = buildDomRuntimeMetrics(errorDetail)[0];
assertEqual(errorMetrics.isReceivingData, false, 'Error tone should disable receiving state');
assertEqual(errorMetrics.awaitingData, false, 'Error tone without waiting hints should not mark awaiting state');

const dataFeedHint = formatDataFeedHint(domMetrics);
assert(dataFeedHint?.includes('接收中'), 'Active feed hint should include 接收中 state');
assert(
  dataFeedHint?.includes('订阅 depth@binance'),
  'Active feed hint should include subscription label'
);
assert(
  dataFeedHint?.includes('标的 BTCUSDT'),
  'Active feed hint should include symbol label'
);
assert(dataFeedHint?.includes('最近 20 条'), 'Active feed hint should reference trimmed log count');
assert(
  dataFeedHint?.includes('连接正常 · 订阅稳定'),
  'Active feed hint should combine receiving reason and cause'
);

const awaitingFeedHint = formatDataFeedHint(awaitingMetrics);
assert(
  awaitingFeedHint?.includes('等待Order Book数据…'),
  'Awaiting feed hint should include the awaiting state with the data label'
);

const disabledFeedHint = formatDataFeedHint({
  ...domMetrics,
  receivingReason: '手动暂停',
  receivingCause: '网络重置',
  awaitingData: false,
  isReceivingData: false,
  dataFeedLogs: []
});
assertEqual(
  disabledFeedHint,
  '未接收 · 手动暂停 · 网络重置 · 订阅 depth@binance · 标的 BTCUSDT · 上次Order Book ' +
    (domMetrics.dataPushLastTimestamp ?? ''),
  'Disabled feed hint should surface inactive state, reason, and cause'
);

const fallbackLabelDetail = JSON.parse(JSON.stringify(runtimeDetail)) as StrategyRuntimeDetail;
if (fallbackLabelDetail.snapshot?.summary) {
  delete fallbackLabelDetail.snapshot.summary.data_label;
}
const fallbackLabelMetrics = buildDomRuntimeMetrics(fallbackLabelDetail)[0];
assertEqual(
  fallbackLabelMetrics.dataLabel,
  'DOM',
  'Data label should fall back to DOM when not provided by telemetry sources'
);

const duplicateSnapshotLogs: StrategyRuntimeDetail = {
  strategyId: 'duplicate/dom',
  status: { active: true, enabled: true },
  snapshot: {
    summary: {},
    data_push: null,
    stop_levels: null,
    logs: [
      {
        id: 'dup-1',
        level: 'info',
        message: 'first-entry',
        timestamp: '2024-05-02T10:00:00Z'
      },
      {
        id: 'dup-2',
        level: 'error',
        message: 'second-entry',
        timestamp: '2024-05-02T10:01:00Z'
      }
    ]
  }
};

const duplicateSnapshotMetrics = buildDomRuntimeMetrics(duplicateSnapshotLogs)[0];
assertEqual(
  duplicateSnapshotMetrics.dataFeedLogs.length,
  duplicateSnapshotLogs.snapshot.logs?.length ?? 0,
  'Snapshot logs should only be included once when building runtime metrics'
);
const dedupedMessages = new Set(duplicateSnapshotMetrics.dataFeedLogs.map((entry) => entry.message));
assertEqual(
  dedupedMessages.size,
  duplicateSnapshotMetrics.dataFeedLogs.length,
  'Runtime metric logs should avoid duplicate entries from the snapshot source'
);

const batchPhaseLogs = Array.from({ length: 22 }, (_, index) => ({
  id: `batch-log-${index}`,
  level: index % 3 === 0 ? 'info' : 'debug',
  timestamp: `2024-05-01T00:${String(20 + index).padStart(2, '0')}:00Z`,
  message: `Batch ${index}`
}));

const signalPhaseStageLogs = Array.from({ length: 6 }, (_, index) => ({
  id: `stage-log-${index + 1}`,
  level: index % 2 === 0 ? 'info' : 'debug',
  timestamp: `2024-05-01T00:00:${String(40 + index).padStart(2, '0')}Z`,
  message: `Stage checkpoint ${index + 1}`,
  details: { stage: `phase-${(index % 3) + 1}` }
}));

const signalPhaseEvents = [
  {
    id: 'signal-1',
    level: 'info',
    timestamp: '2024-05-01T00:01:00Z',
    message: 'BUY signal triggered'
  },
  {
    id: 'signal-2',
    level: 'info',
    timestamp: '2024-05-01T00:02:00Z',
    message: 'SELL signal triggered'
  },
  {
    id: 'signal-3',
    level: 'info',
    timestamp: '2024-05-01T00:03:00Z',
    message: 'Signal emitted',
    details: { side: 'buy' }
  },
  {
    id: 'signal-4',
    level: 'info',
    timestamp: '2024-05-01T00:04:00Z',
    message: 'Signal emitted',
    details: { side: 'sell' }
  },
  {
    id: 'signal-5',
    level: 'info',
    timestamp: '2024-05-01T00:05:00Z',
    message: 'Strategy decision',
    context: { decision: 'BUY' }
  },
  {
    id: 'signal-6',
    level: 'info',
    timestamp: '2024-05-01T00:06:00Z',
    message: 'Strategy decision',
    context: { decision: 'SELL' }
  },
  {
    id: 'signal-7',
    level: 'info',
    timestamp: '2024-05-01T00:07:00Z',
    message: 'Momentum turned bullish'
  },
  {
    id: 'signal-8',
    level: 'info',
    timestamp: '2024-05-01T00:08:00Z',
    message: 'Momentum turned bearish'
  },
  {
    id: 'signal-9',
    level: 'info',
    timestamp: '2024-05-01T00:09:00Z',
    message: 'Long bias confirmed'
  },
  {
    id: 'signal-10',
    level: 'info',
    timestamp: '2024-05-01T00:10:00Z',
    message: 'Short bias confirmed'
  },
  {
    id: 'signal-11',
    level: 'info',
    timestamp: '2024-05-01T00:11:00Z',
    message: 'Signal update',
    payload: { signal_side: 'buy' }
  },
  {
    id: 'signal-12',
    level: 'info',
    timestamp: '2024-05-01T00:12:00Z',
    message: 'Signal update',
    payload: { signal_side: 'sell' }
  }
];

const PROCESSING_LOG_COUNT = 12;
const processingLogRecords = Array.from({ length: PROCESSING_LOG_COUNT }, (_, index) => {
  const stepNumber = PROCESSING_LOG_COUNT - index;
  return {
    timestamp: `2024-05-01T00:01:${String(48 + (PROCESSING_LOG_COUNT - 1 - index)).padStart(2, '0')}Z`,
    stage: 'signals',
    step: `Rule ${stepNumber}`,
    metric: 0.1 * stepNumber,
    threshold: 1,
    comparison: '<=',
    passed: stepNumber % 3 === 0
  };
});

const klineRuntimeDetail: StrategyRuntimeDetail = {
  strategyId: 'demo/kline',
  status: { active: true, enabled: true },
  snapshot: {
    summary: {
      bars_processed: 64,
      interval: '5m',
      interval_label: '5 Minutes',
      phases: [
        {
          key: 'subscription',
          status: 'active',
          status_reason: '订阅稳定',
          status_cause: 'websocket',
          metrics: {
            reconnects: 2,
            last_latency_ms: 135.4,
            heartbeat_ok: true,
            interval: '5m'
          },
          logs: [
            {
              id: 'sub-1',
              level: 'info',
              timestamp: '2024-05-01T00:00:05Z',
              message: 'Subscription resumed'
            }
          ]
        },
        {
          key: 'batch_aggregation',
          status: 'running',
          summary: {
            batches_processed: 5,
            last_batch_size: 480
          },
          metric_order: ['batches_processed', 'last_batch_size'],
          logs: batchPhaseLogs
        }
      ],
      pipeline: {
        signal_generation: {
          status: 'ready',
          reason: '策略加载完成',
          stats: {
            signals_generated: 4,
            signals_rejected: 1
          },
          last_started_at: '2024-05-01T00:01:00Z',
          last_completed_at: '2024-05-01T00:01:05Z',
          events: signalPhaseEvents,
          logs: signalPhaseStageLogs
        }
      }
    },
    workflow: {
      order_execution: {
        status: 'healthy',
        status_reason: '交易通道正常',
        status_cause_code: 'router/ok',
        counts: {
          orders_sent: 3,
          orders_filled: 2,
          orders_failed: 1
        },
        last_error: null,
        log_entries: [
          {
            id: 'exec-1',
            level: 'warning',
            timestamp: '2024-05-01T00:02:00Z',
            message: 'Order retry scheduled',
            details: { order_id: 'A1' }
          }
        ]
      }
    },
    processing_log: processingLogRecords
  }
};

const klineMetrics = buildKlineRuntimeMetrics(klineRuntimeDetail);
assertEqual(klineMetrics.interval, '5m', 'K线指标模型应暴露运行区间');
assertEqual(
  klineMetrics.intervalLabel,
  '5 Minutes',
  'K线指标模型应映射友好的区间标签'
);
assertEqual(klineMetrics.phases.length, 4, 'K线运行指标应包含四个阶段');
const subscriptionPhase = klineMetrics.phases.find((phase) => phase.key === 'subscription');
assert(subscriptionPhase, '订阅阶段应存在');
if (subscriptionPhase) {
  assertEqual(subscriptionPhase.title, '行情订阅', '订阅阶段标题应为行情订阅');
  assertEqual(subscriptionPhase.status, 'ACTIVE', '订阅阶段状态应大写化');
  assert(
    subscriptionPhase.statusDescriptor?.includes('订阅稳定') ?? false,
    '订阅阶段描述应包含状态原因'
  );
  assertEqual(subscriptionPhase.statusReason, '订阅稳定', '订阅阶段应暴露独立的状态原因');
  assertEqual(subscriptionPhase.statusCause, 'websocket', '订阅阶段应暴露独立的故障原因');
  const reconnectMetric = subscriptionPhase.metrics.find((metric) => metric.key === 'reconnects');
  assertEqual(reconnectMetric?.value, '2', '订阅阶段应包含重连次数指标');
  const heartbeatMetric = subscriptionPhase.metrics.find((metric) => metric.key === 'heartbeat_ok');
  assertEqual(heartbeatMetric?.value, '是', '布尔指标应转为是/否文案');
  assertEqual(subscriptionPhase.logs.length, 1, '订阅阶段日志应映射至视图模型');
  assert(
    subscriptionPhase.logs[0]?.message.includes('Subscription'),
    '订阅阶段日志消息应保留原文'
  );
}

const batchPhase = klineMetrics.phases.find((phase) => phase.key === 'batch_aggregation');
assert(batchPhase, '批量聚合阶段应存在');
if (batchPhase) {
  assertEqual(
    batchPhase.metrics.map((metric) => metric.key).join(','),
    'batches_processed,last_batch_size',
    '批量聚合阶段应遵循 metric_order 排序'
  );
  const batchSizeMetric = batchPhase.metrics.find((metric) => metric.key === 'last_batch_size');
  assertEqual(batchSizeMetric?.value, '480', '批量聚合应保留批次大小');
  assertEqual(batchPhase.logs.length, 20, '批量聚合日志应仅保留最新 20 条');
  assert(
    batchPhase.logs[0]?.level === batchPhase.logs[0]?.level?.toUpperCase(),
    '批量聚合日志应保持等级并大写'
  );
  assertEqual(batchPhase.logs[0]?.message, 'Batch 21', '批量聚合日志应按时间倒序排列');
  const batchPhaseLastLog = batchPhase.logs[batchPhase.logs.length - 1];
  assertEqual(batchPhaseLastLog?.message, 'Batch 2', '批量聚合日志尾部应为最早保留的记录');
}

const signalPhase = klineMetrics.phases.find((phase) => phase.key === 'signal_generation');
assert(signalPhase, '信号生成阶段应存在');
if (signalPhase) {
  const startedMetric = signalPhase.metrics.find((metric) => metric.key === 'last_started_at');
  assert(
    startedMetric?.value.includes('2024'),
    '时间戳应转换为可读字符串'
  );
  const generatedMetric = signalPhase.metrics.find((metric) => metric.key === 'signals_generated');
  assertEqual(generatedMetric?.value, '4', '信号阶段应合并统计指标');
  assertEqual(signalPhase.statusTone, 'success', '准备就绪状态应映射至成功语气');
  assertEqual(signalPhase.signalEvents.length, 5, '交易信号仅保留最新的 5 条记录');
  const firstSignalEvent = signalPhase.signalEvents[0];
  assertEqual(firstSignalEvent?.side, 'SELL', '最新信号事件应位于列表首位');
  const expectedSignalTimestamp = formatTimestamp(signalPhaseEvents[signalPhaseEvents.length - 1]?.timestamp, {
    locale: resolveTestLocale()
  });
  assertEqual(firstSignalEvent?.timestamp, expectedSignalTimestamp, '最新信号事件时间戳应来自最近的记录');
  const lastSignalEvent = signalPhase.signalEvents[signalPhase.signalEvents.length - 1];
  assertEqual(lastSignalEvent?.side, 'SELL', '信号事件列表尾项应保持时间顺序');
  assertEqual(signalPhase.stageSignals.length, 3, '阶段信号仅保留最近的 3 条记录');
  const stageSignalMessages = signalPhase.stageSignals.map((entry) => entry.message);
  const expectedStageSignals = ['Stage checkpoint 6', 'Stage checkpoint 5', 'Stage checkpoint 4'];
  assertEqual(
    stageSignalMessages.join(','),
    expectedStageSignals.join(','),
    '阶段信号列表应展示最新阶段摘要'
  );
  const oldestStageSignal = signalPhase.stageSignals[signalPhase.stageSignals.length - 1];
  assertEqual(
    oldestStageSignal?.message,
    expectedStageSignals[expectedStageSignals.length - 1],
    '阶段信号列表应自动裁剪更早的记录'
  );

  assertEqual(
    signalPhase.dataProcessingLogs.length,
    10,
    '数据处理日志应仅保留最新 10 条记录'
  );
  const processingLog = signalPhase.dataProcessingLogs[0];
  assert(processingLog?.message.includes('Rule 12'), '处理日志应显示最新步骤名称');
  const metricDetail = processingLog?.details.find((detail) => detail.key === '当前值');
  assert(metricDetail, '处理日志应包含当前值详情');
  const oldestProcessing = signalPhase.dataProcessingLogs[signalPhase.dataProcessingLogs.length - 1];
  assert(
    oldestProcessing?.message.includes('Rule 3'),
    '处理日志应移除更早的历史记录'
  );
}


const targetTimeZone = 'America/New_York';
const locale = resolveTestLocale();
const latestLogTimestamp = new Date(runtimeLogs[runtimeLogs.length - 1]?.timestamp ?? '');
const expectedLatestLog = new Intl.DateTimeFormat(locale, {
  ...timestampFormatOptions,
  timeZone: targetTimeZone
}).format(latestLogTimestamp);
const expectedDomTimestamp = new Intl.DateTimeFormat(locale, {
  ...timestampFormatOptions,
  timeZone: targetTimeZone
}).format(new Date('2024-05-01T00:02:03Z'));

const originalDateTimeFormat = Intl.DateTimeFormat;

try {
  __timezoneTestUtils.resetRuntimeTimeZoneCache();

  function mockedDateTimeFormat(localeArg?: string | string[], options?: Intl.DateTimeFormatOptions) {
    const baseOptions = options ?? {};
    const appliedOptions =
      baseOptions && typeof baseOptions === 'object' && 'timeZone' in baseOptions && baseOptions.timeZone
        ? baseOptions
        : { ...baseOptions, timeZone: targetTimeZone };

    return new originalDateTimeFormat(localeArg as string | string[] | undefined, appliedOptions);
  }

  Object.defineProperty(Intl, 'DateTimeFormat', {
    configurable: true,
    writable: true,
    value: mockedDateTimeFormat
  });

  __timezoneTestUtils.resetRuntimeTimeZoneCache();

  const timezoneAwareMetrics = buildDomRuntimeMetrics(runtimeDetail)[0];
  const timezoneAwareLatestLog = timezoneAwareMetrics.dataFeedLogs[0];
  const timezoneAwareKlineMetrics = buildKlineRuntimeMetrics(klineRuntimeDetail);
  const timezoneAwareBatchPhase = timezoneAwareKlineMetrics.phases.find((phase) => phase.key === 'batch_aggregation');
  const timezoneAwareSignalPhase = timezoneAwareKlineMetrics.phases.find((phase) => phase.key === 'signal_generation');
  const timezoneAwareProcessingLog = timezoneAwareSignalPhase?.dataProcessingLogs[0];
  const timezoneAwareSignalEvent = timezoneAwareSignalPhase?.signalEvents[0];
  const latestBatchLog = batchPhaseLogs[batchPhaseLogs.length - 1];
  const latestProcessingLog = processingLogRecords[0];
  const latestSignalEvent = signalPhaseEvents[signalPhaseEvents.length - 1];

  assertEqual(
    timezoneAwareLatestLog?.timestamp,
    expectedLatestLog,
    'Log timestamps should resolve to the browser timezone offset'
  );

  assertEqual(
    timezoneAwareMetrics.dataPushLastTimestamp,
    expectedDomTimestamp,
    'DOM timestamps should resolve to the browser timezone offset'
  );

  if (timezoneAwareBatchPhase?.logs?.length) {
    const expectedBatchLogTimestamp = new originalDateTimeFormat(locale, {
      ...timestampFormatOptions,
      timeZone: targetTimeZone
    }).format(new Date(latestBatchLog?.timestamp ?? ''));
    assertEqual(
      timezoneAwareBatchPhase.logs[0]?.timestamp,
      expectedBatchLogTimestamp,
      'Phase logs should reuse the shared timestamp formatter with local offsets'
    );
  }

  if (timezoneAwareProcessingLog) {
    const expectedProcessingTimestamp = new originalDateTimeFormat(locale, {
      ...timestampFormatOptions,
      timeZone: targetTimeZone
    }).format(new Date(latestProcessingLog?.timestamp ?? ''));
    assertEqual(
      timezoneAwareProcessingLog.timestamp,
      expectedProcessingTimestamp,
      'Data processing logs should reuse the shared timestamp formatter with local offsets'
    );
  }

  if (timezoneAwareSignalEvent) {
    const expectedSignalTimestamp = new originalDateTimeFormat(locale, {
      ...timestampFormatOptions,
      timeZone: targetTimeZone
    }).format(new Date(latestSignalEvent?.timestamp ?? ''));
    assertEqual(
      timezoneAwareSignalEvent.timestamp,
      expectedSignalTimestamp,
      'Trading signal timestamps should reuse the shared timestamp formatter with local offsets'
    );
  }
} finally {
  Object.defineProperty(Intl, 'DateTimeFormat', {
    configurable: true,
    writable: true,
    value: originalDateTimeFormat
  });
  __timezoneTestUtils.resetRuntimeTimeZoneCache();
}

const evaluationDetail: StrategyRuntimeDetail = {
  strategyId: 'demo/buy_dip',
  status: { active: true, enabled: true },
  snapshot: {
    summary: {},
    phases: [
      {
        name: 'signals',
        logs: [
          {
            id: 'eval-1',
            level: 'info',
            timestamp: '2024-05-01T00:00:00Z',
            message: 'Buy-the-dip conditions evaluated',
            details: {
              evaluations: [
                { condition: 'ma_gap<=-0.001', passed: false },
                { condition: 'rsi<=35', passed: false }
              ]
            }
          }
        ]
      }
    ]
  }
};

const evaluationMetrics = buildKlineRuntimeMetrics(evaluationDetail);
const evaluationSignals = evaluationMetrics.phases.find((phase) => phase.key === 'signal_generation');
assert(evaluationSignals, '应存在信号生成阶段');
if (evaluationSignals) {
  assertEqual(
    evaluationSignals.signalEvents.length,
    0,
    '条件评估日志不应被当作交易信号呈现'
  );
}

const executionPhase = klineMetrics.phases.find((phase) => phase.key === 'order_execution');
assert(executionPhase, '订单执行阶段应存在');
if (executionPhase) {
  assert(
    executionPhase.statusDescriptor?.includes('router/ok') ?? false,
    '执行阶段描述应包含状态代码'
  );
  assertEqual(executionPhase.statusCause, null, '执行阶段在无故障时应缺省原因信息');
  const failedMetric = executionPhase.metrics.find((metric) => metric.key === 'orders_failed');
  assertEqual(failedMetric?.value, '1', '执行阶段应提取失败订单数量');
  const executionLog = executionPhase.logs[0];
  assert(executionLog?.details.length === 1, '执行阶段日志详情应被展开');
  assertEqual(executionLog?.tone, 'warning', '执行阶段日志语气应映射为 warning');
  assert(executionPhase.orderExecutions && executionPhase.orderExecutions.length === 1, '执行阶段应包含订单执行列表');
  const firstOrder = executionPhase.orderExecutions?.[0];
  assertEqual(firstOrder?.id, 'exec-1', '订单执行应包含日志 ID 作为标识');
  assert(firstOrder?.timestamp?.includes('2024') ?? false, '订单执行项应包含可读时间戳');
  assertEqual(firstOrder?.side, null, '当无方向时应返回 null');
  assertEqual(firstOrder?.symbol, null, '当无标的时应返回 null');
  assertEqual(firstOrder?.quantity, null, '当无数量时应返回 null');
  assertEqual(firstOrder?.status, null, '当无状态时应返回 null');
}

// 验证嵌套详情的字符串化与订单提取
const nestedDetail = JSON.parse(JSON.stringify(klineRuntimeDetail)) as StrategyRuntimeDetail;
const snapshotIndexable = nestedDetail.snapshot as unknown as Record<string, unknown>;
const workflow = snapshotIndexable['workflow'];
if (workflow && typeof workflow === 'object') {
  const orderExecution = (workflow as Record<string, unknown>)['order_execution'];
  if (orderExecution && typeof orderExecution === 'object') {
    const logEntries = (orderExecution as Record<string, unknown>)['log_entries'];
    if (Array.isArray(logEntries)) {
      logEntries.push({
        id: 'exec-2',
        level: 'info',
        timestamp: '2024-05-01T00:03:00Z',
        message: 'Complex details',
        details: { context: { router: 'alpha' }, legs: ['BTCUSDT', 'ETHUSDT'], attempts: 2 }
      });
    }
  }
}
const nestedMetrics = buildKlineRuntimeMetrics(nestedDetail);
const nestedExecPhase = nestedMetrics.phases.find((p) => p.key === 'order_execution');
assert(nestedExecPhase, '包含嵌套详情时执行阶段仍应存在');
const complexLog = nestedExecPhase?.logs.find((l) => l.id === 'exec-2');
assert(complexLog, '复杂详情日志应被映射');
if (complexLog) {
  const values = complexLog.details.map((d) => String(d.value)).join(' | ');
  assert(values.includes('BTCUSDT') && values.includes('ETHUSDT'), '数组应被字符串化为可读形式');
  assert(values.includes('router') && values.includes('alpha'), '对象应被字符串化并保留键值');
}

const emptyKlineMetrics = buildKlineRuntimeMetrics(null);
assertEqual(emptyKlineMetrics.phases.length, 4, '空快照仍应生成固定数量阶段');
assert(
  emptyKlineMetrics.phases.every((phase) => phase.metrics.length === 0 && phase.logs.length === 0),
  '缺失数据的阶段应返回空指标和日志'
);

console.log('Runtime metrics tests passed');
