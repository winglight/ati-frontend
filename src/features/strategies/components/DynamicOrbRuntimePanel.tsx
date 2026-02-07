import { useMemo } from 'react';
import clsx from 'clsx';
import { useTranslation } from '@i18n';
import type { KlineRuntimePhaseViewModel, RuntimeLogEntry } from './runtimeMetrics';
import styles from './StrategyDetailPanel.module.css';

type OutcomeBreakdown = {
  wins: number | null;
  losses: number | null;
  total: number | null;
};

type StageAccumulator = {
  key: string;
  minutes: number | null;
  enabled: boolean | null;
  complete: boolean | null;
  candlesProcessed: number | null;
  atrRatio: number | null;
  volumeRatio: number | null;
  breakoutsUp: number | null;
  breakoutsDown: number | null;
  retests: number | null;
  failures: number | null;
  order: number;
};

interface DynamicOrbRuntimeData {
  stages: StageAccumulator[];
  today: {
    breakoutUp: OutcomeBreakdown;
    breakoutDown: OutcomeBreakdown;
    retests: OutcomeBreakdown;
    totals: OutcomeBreakdown;
  } | null;
  winRates: {
    breakout: number | null;
    retest: number | null;
    overall: number | null;
  };
}

const KNOWN_STAGE_ORDER: Array<{ key: string; minutes: number; order: number }> = [
  { key: 'ORB5', minutes: 5, order: 1 },
  { key: 'ORB15', minutes: 15, order: 2 },
  { key: 'ORB30', minutes: 30, order: 3 },
  { key: 'ORB60', minutes: 60, order: 4 }
];

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const parseNumber = (value: unknown): number | null => {
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
    const normalized = trimmed.endsWith('%') ? trimmed.slice(0, -1) : trimmed;
    const parsed = Number(normalized.replace(/[^0-9+\-.eE]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const parseBoolean = (value: unknown): boolean | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
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
    if (['true', '1', 'yes', 'y', 'on', 'enabled', 'active', 'complete', 'finished'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'n', 'off', 'disabled', 'inactive'].includes(normalized)) {
      return false;
    }
  }
  return null;
};

const normalizeStageKey = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(/orb\s*(\d+)/i);
  if (match) {
    return `ORB${match[1]}`;
  }
  if (/^ORB\d+$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }
  return trimmed.toUpperCase();
};

const parseStageNameFromMessage = (message: string | null | undefined): string | null => {
  if (!message) {
    return null;
  }
  const match = message.match(/(orb\s*\d+)/i);
  return match ? normalizeStageKey(match[1]) : null;
};

const ensureStage = (
  map: Map<string, StageAccumulator>,
  name: string,
  minutes?: number | null,
  orderHint?: number | null
): StageAccumulator => {
  const existing = map.get(name);
  if (existing) {
    if (minutes !== null && minutes !== undefined && Number.isFinite(minutes) && existing.minutes === null) {
      existing.minutes = minutes;
    }
    if (orderHint !== null && orderHint !== undefined && Number.isFinite(orderHint)) {
      existing.order = orderHint;
    }
    return existing;
  }
  const known = KNOWN_STAGE_ORDER.find((stage) => stage.key === name);
  const resolvedMinutes =
    minutes !== undefined && minutes !== null && Number.isFinite(minutes)
      ? (minutes as number)
      : known?.minutes ?? null;
  const resolvedOrder =
    orderHint !== undefined && orderHint !== null && Number.isFinite(orderHint)
      ? (orderHint as number)
      : known?.order ?? (resolvedMinutes ?? map.size + 1);
  const created: StageAccumulator = {
    key: name,
    minutes: resolvedMinutes,
    enabled: null,
    complete: null,
    candlesProcessed: null,
    atrRatio: null,
    volumeRatio: null,
    breakoutsUp: null,
    breakoutsDown: null,
    retests: null,
    failures: null,
    order: resolvedOrder
  };
  map.set(name, created);
  return created;
};

const assignStageMetric = (stage: StageAccumulator, metricKey: string, rawValue: unknown) => {
  const normalized = metricKey.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  switch (normalized) {
    case 'complete': {
      const value = parseBoolean(rawValue);
      if (value !== null) {
        stage.complete = value;
      }
      break;
    }
    case 'enabled':
    case 'active': {
      const value = parseBoolean(rawValue);
      if (value !== null) {
        stage.enabled = value;
      }
      break;
    }
    case 'minutes':
    case 'window':
    case 'duration':
    case 'window_minutes': {
      const value = parseNumber(rawValue);
      if (value !== null && stage.minutes === null) {
        stage.minutes = value;
      }
      break;
    }
    case 'candles_processed':
    case 'processed':
    case 'progress':
    case 'candles': {
      const value = parseNumber(rawValue);
      if (value !== null) {
        stage.candlesProcessed = value;
      }
      break;
    }
    case 'atr_ratio':
    case 'atr':
    case 'atr_multiple': {
      const value = parseNumber(rawValue);
      if (value !== null) {
        stage.atrRatio = value;
      }
      break;
    }
    case 'volume_ratio':
    case 'vol_ratio':
    case 'volume': {
      const value = parseNumber(rawValue);
      if (value !== null) {
        stage.volumeRatio = value;
      }
      break;
    }
    case 'breakouts_up':
    case 'breakout_up':
    case 'breakouts_long':
    case 'breakout_long': {
      const value = parseNumber(rawValue);
      if (value !== null) {
        stage.breakoutsUp = value;
      }
      break;
    }
    case 'breakouts_down':
    case 'breakout_down':
    case 'breakouts_short':
    case 'breakout_short': {
      const value = parseNumber(rawValue);
      if (value !== null) {
        stage.breakoutsDown = value;
      }
      break;
    }
    case 'retests':
    case 'retest':
    case 'retest_count': {
      const value = parseNumber(rawValue);
      if (value !== null) {
        stage.retests = value;
      }
      break;
    }
    case 'failures':
    case 'failure_count':
    case 'losers': {
      const value = parseNumber(rawValue);
      if (value !== null) {
        stage.failures = value;
      }
      break;
    }
    default: {
      break;
    }
  }
};

const mergeStageRecord = (
  map: Map<string, StageAccumulator>,
  stageName: string,
  record: Record<string, unknown>
) => {
  const minutesCandidate = parseNumber(record.minutes ?? record.window_minutes ?? record.duration);
  const orderCandidate = parseNumber(record.order ?? record.sort ?? record.priority ?? minutesCandidate ?? null);
  const stage = ensureStage(map, stageName, minutesCandidate, orderCandidate);
  if (parseBoolean(record.enabled) !== null) {
    stage.enabled = parseBoolean(record.enabled);
  }
  if (parseBoolean(record.active) !== null) {
    stage.enabled = parseBoolean(record.active);
  }
  if (parseBoolean(record.complete) !== null) {
    stage.complete = parseBoolean(record.complete);
  }
  if (parseBoolean(record.finished) !== null) {
    stage.complete = parseBoolean(record.finished);
  }
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined || value === null) {
      continue;
    }
    if (typeof value === 'object' && !Array.isArray(value)) {
      continue;
    }
    assignStageMetric(stage, key, value);
  }
};

const collectStageRecords = (
  map: Map<string, StageAccumulator>,
  source: unknown,
  fallbackStageName?: string | null
) => {
  if (!source) {
    return;
  }
  if (Array.isArray(source)) {
    for (const item of source) {
      if (!isObject(item)) {
        continue;
      }
      const stageName =
        normalizeStageKey(item.stage) ??
        normalizeStageKey(item.name) ??
        (fallbackStageName ? normalizeStageKey(fallbackStageName) : null);
      if (!stageName) {
        continue;
      }
      mergeStageRecord(map, stageName, item);
    }
    return;
  }
  if (isObject(source)) {
    for (const [key, value] of Object.entries(source)) {
      if (Array.isArray(value)) {
        collectStageRecords(map, value, key);
        continue;
      }
      if (isObject(value)) {
        const stageName = normalizeStageKey(value.stage ?? value.name ?? key) ?? normalizeStageKey(key);
        if (stageName) {
          mergeStageRecord(map, stageName, value);
        }
        continue;
      }
      const flattenedMatch = key.match(/^(orb\d+)[_.-]?(.+)$/i);
      if (flattenedMatch) {
        const stageName = normalizeStageKey(flattenedMatch[1]);
        if (!stageName) {
          continue;
        }
        const stage = ensureStage(map, stageName);
        assignStageMetric(stage, flattenedMatch[2], value);
      }
    }
  }
};

const collectStageDataFromLogs = (map: Map<string, StageAccumulator>, logs: RuntimeLogEntry[]) => {
  for (const log of logs) {
    const detailsRaw = log.raw && typeof log.raw === 'object' ? (log.raw as Record<string, unknown>).details : null;
    if (!detailsRaw) {
      continue;
    }
    if (Array.isArray(detailsRaw)) {
      continue;
    }
    if (!isObject(detailsRaw)) {
      continue;
    }
    const stageName =
      normalizeStageKey(detailsRaw.stage) ??
      normalizeStageKey(detailsRaw.name) ??
      parseStageNameFromMessage((log.raw as Record<string, unknown>)?.message as string) ??
      parseStageNameFromMessage(log.message);
    if (!stageName) {
      continue;
    }
    mergeStageRecord(map, stageName, detailsRaw);
  }
};

const emptyOutcome: OutcomeBreakdown = { wins: null, losses: null, total: null };

const parseOutcome = (value: unknown): OutcomeBreakdown | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    const total = parseNumber(value);
    if (total === null) {
      return null;
    }
    return { wins: null, losses: null, total };
  }
  if (!isObject(value)) {
    return null;
  }
  const wins =
    parseNumber(value.wins ?? value.win ?? value.success ?? value.profit ?? value.positive ?? value.good) ?? null;
  const losses =
    parseNumber(value.losses ?? value.loss ?? value.failed ?? value.bad ?? value.negative ?? value.red) ?? null;
  let total = parseNumber(value.total ?? value.count ?? value.trades ?? value.samples ?? value.all) ?? null;
  if (total === null && (wins !== null || losses !== null)) {
    total = (wins ?? 0) + (losses ?? 0);
  }
  if (wins === null && losses === null && total === null) {
    return null;
  }
  return { wins, losses, total };
};

const mergeOutcome = (target: OutcomeBreakdown, source: OutcomeBreakdown | null) => {
  if (!source) {
    return;
  }
  if (source.wins !== null) {
    target.wins = source.wins;
  }
  if (source.losses !== null) {
    target.losses = source.losses;
  }
  if (source.total !== null) {
    target.total = source.total;
  }
};

const deriveDynamicOrbRuntimeData = (phase: KlineRuntimePhaseViewModel): DynamicOrbRuntimeData => {
  const stageMap = new Map<string, StageAccumulator>();

  const rawRecord = (phase.raw ?? null) as Record<string, unknown> | null;
  const summary = rawRecord && isObject(rawRecord.summary) ? (rawRecord.summary as Record<string, unknown>) : null;

  collectStageRecords(stageMap, rawRecord?.stage_cache ?? rawRecord?.stageCache);
  collectStageRecords(stageMap, rawRecord?.metrics);
  collectStageRecords(stageMap, summary?.stage_cache ?? summary?.stageCache);
  collectStageRecords(stageMap, summary?.stages);
  collectStageRecords(stageMap, summary?.cache);

  collectStageDataFromLogs(stageMap, phase.logs);

  const stages = Array.from(stageMap.values())
    .filter((stage) => {
      const enabledTrue = stage.enabled === true;
      const completeTrue = stage.complete === true;
      const progress = (stage.candlesProcessed ?? 0) > 0;
      const hasMetrics = [
        stage.atrRatio,
        stage.volumeRatio,
        stage.breakoutsUp,
        stage.breakoutsDown,
        stage.retests,
        stage.failures
      ].some((v) => v !== null && v !== undefined);
      return enabledTrue || completeTrue || progress || hasMetrics;
    })
    .sort((left, right) => {
      if (left.order !== right.order) {
        return left.order - right.order;
      }
      if (left.minutes !== null && right.minutes !== null && left.minutes !== right.minutes) {
        return left.minutes - right.minutes;
      }
      return left.key.localeCompare(right.key);
    });

  const tradeOutcomes = summary && isObject(summary.trade_outcomes)
    ? (summary.trade_outcomes as Record<string, unknown>)
    : summary && isObject(summary.tradeOutcomes)
      ? (summary.tradeOutcomes as Record<string, unknown>)
      : null;
  const todayRecord = tradeOutcomes && isObject(tradeOutcomes.today)
    ? (tradeOutcomes.today as Record<string, unknown>)
    : tradeOutcomes && isObject(tradeOutcomes.session)
      ? (tradeOutcomes.session as Record<string, unknown>)
      : null;

  const today: DynamicOrbRuntimeData['today'] = todayRecord
    ? {
        breakoutUp: { ...emptyOutcome },
        breakoutDown: { ...emptyOutcome },
        retests: { ...emptyOutcome },
        totals: { ...emptyOutcome }
      }
    : null;

  if (today && todayRecord) {
    mergeOutcome(
      today.breakoutUp,
      parseOutcome(
        todayRecord.breakouts_up ??
          todayRecord.breakout_up ??
          todayRecord.long ??
          todayRecord.up ??
          todayRecord.breakoutsUp
      )
    );
    mergeOutcome(
      today.breakoutDown,
      parseOutcome(
        todayRecord.breakouts_down ??
          todayRecord.breakout_down ??
          todayRecord.short ??
          todayRecord.down ??
          todayRecord.breakoutsDown
      )
    );
    mergeOutcome(
      today.retests,
      parseOutcome(todayRecord.retests ?? todayRecord.retest ?? todayRecord.retest_opportunities)
    );
    mergeOutcome(
      today.totals,
      parseOutcome(
        todayRecord.totals ??
          todayRecord.total ??
          todayRecord.summary ??
          tradeOutcomes?.totals ??
          tradeOutcomes?.total ??
          tradeOutcomes?.overall
      )
    );
  }

  const winRateSource = summary && isObject(summary.win_rate)
    ? (summary.win_rate as Record<string, unknown>)
    : summary && isObject(summary.winRate)
      ? (summary.winRate as Record<string, unknown>)
      : tradeOutcomes && isObject(tradeOutcomes.win_rate)
        ? (tradeOutcomes.win_rate as Record<string, unknown>)
        : null;

  const winRates: DynamicOrbRuntimeData['winRates'] = {
    breakout: parseNumber(
      winRateSource?.breakout ??
        winRateSource?.breakouts ??
        winRateSource?.breakout_rate ??
        winRateSource?.breakoutWinRate
    ),
    retest: parseNumber(
      winRateSource?.retest ??
        winRateSource?.retests ??
        winRateSource?.retest_rate ??
        winRateSource?.retestWinRate
    ),
    overall: parseNumber(
      winRateSource?.overall ??
        winRateSource?.total ??
        winRateSource?.combined ??
        winRateSource?.aggregate ??
        winRateSource?.win_rate ??
        winRateSource?.winRate
    )
  };

  return {
    stages,
    today,
    winRates
  };
};

const formatCount = (value: number | null): string => {
  if (value === null || value === undefined) {
    return '—';
  }
  if (!Number.isFinite(value)) {
    return value.toString();
  }
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0,
    minimumFractionDigits: 0
  }).format(value);
};

const formatRatio = (value: number | null): string => {
  if (value === null || value === undefined) {
    return '—';
  }
  if (!Number.isFinite(value)) {
    return value.toString();
  }
  return value.toFixed(Math.abs(value) >= 10 ? 1 : 2);
};

const formatPercent = (value: number | null): string => {
  if (value === null || value === undefined) {
    return '—';
  }
  if (!Number.isFinite(value)) {
    return value.toString();
  }
  const normalized = Math.abs(value) <= 1 ? value * 100 : value;
  const rounded = Math.round(normalized * 10) / 10;
  return `${rounded.toFixed(1)}%`;
};

interface DynamicOrbRuntimePanelProps {
  phase: KlineRuntimePhaseViewModel;
}

const DynamicOrbRuntimePanel = ({ phase }: DynamicOrbRuntimePanelProps) => {
  const { t } = useTranslation();
  const derived = useMemo(() => deriveDynamicOrbRuntimeData(phase), [phase]);
  const translate = (key: string, fallback: string, options?: Record<string, unknown>) => {
    const resolved = (options ? t(key, options as never) : t(key)) as unknown as string;
    return resolved && resolved !== key ? resolved : fallback;
  };

  const hasStageRows = derived.stages.length > 0;
  const hasAtrRatio = derived.stages.some((stage) => stage.atrRatio !== null && stage.atrRatio !== undefined);
  const hasTodayStats = Boolean(
    derived.today &&
      [derived.today.breakoutUp, derived.today.breakoutDown, derived.today.retests, derived.today.totals].some(
        (entry) =>
          entry.wins !== null || entry.losses !== null || entry.total !== null
      )
  );
  const hasWinRates = Object.values(derived.winRates).some((value) => value !== null);

  if (!hasStageRows && !hasTodayStats && !hasWinRates) {
    return <div className={styles.runtimePhaseEmpty}>{translate('strategies.runtime.dynamic_orb.empty', '暂无数据')}</div>;
  }

  return (
    <div className={styles.dynamicOrbPanel}>
      {hasStageRows ? (
        <div className={styles.dynamicOrbStageScroll}>
          <div className={styles.dynamicOrbStageTable}>
            <div className={styles.dynamicOrbStageHeaderRow}>
              <span>{translate('strategies.runtime.dynamic_orb.stage_cache_title', '阶段进度')}</span>
              <span
                className={clsx(
                  styles.dynamicOrbStageHeaderMetrics,
                  !hasAtrRatio && styles.dynamicOrbStageHeaderMetricsNoAtr
                )}
              >
                {hasAtrRatio ? (
                  <span>{translate('strategies.runtime.dynamic_orb.metrics.atr_ratio', 'ATR 比例')}</span>
                ) : null}
                <span>{translate('strategies.runtime.dynamic_orb.metrics.volume_ratio', '成交量比例')}</span>
              <span>{translate('strategies.runtime.dynamic_orb.metrics.breakout_up', '突破向上')}</span>
              <span>{translate('strategies.runtime.dynamic_orb.metrics.breakout_down', '突破向下')}</span>
              <span>{translate('strategies.runtime.dynamic_orb.metrics.retest', '回测次数')}</span>
              <span>{translate('strategies.runtime.dynamic_orb.metrics.failures', '失败次数')}</span>
            </span>
          </div>
            {derived.stages.map((stage) => {
              let statusKey: 'complete' | 'pending' | 'disabled' | 'unknown' = 'unknown';
              if (stage.enabled === false) {
                statusKey = 'disabled';
              } else if (stage.complete === true) {
              statusKey = 'complete';
            } else if (stage.complete === false || stage.enabled === true || stage.candlesProcessed !== null) {
              statusKey = 'pending';
            }
            const statusClass =
              statusKey === 'complete'
                ? styles.dynamicOrbStageBadgeComplete
                : statusKey === 'pending'
                  ? styles.dynamicOrbStageBadgePending
                  : statusKey === 'disabled'
                    ? styles.dynamicOrbStageBadgeDisabled
                    : styles.dynamicOrbStageBadgeUnknown;
            const stageMinutes = stage.minutes !== null && Number.isFinite(stage.minutes)
              ? translate(
                  'strategies.runtime.dynamic_orb.stage_minutes_suffix',
                  `${stage.minutes}分钟`,
                  { minutes: stage.minutes }
                )
              : null;
            return (
              <div key={stage.key} className={styles.dynamicOrbStageRow} data-stage={stage.key}>
                <div className={styles.dynamicOrbStageInfo}>
                  <div className={styles.dynamicOrbStageLabelGroup}>
                    <span className={styles.dynamicOrbStageName}>{stage.key}</span>
                    {stageMinutes ? (
                      <span className={styles.dynamicOrbStageMinutes}>{stageMinutes}</span>
                    ) : null}
                  </div>
                  <span className={clsx(styles.dynamicOrbStageBadge, statusClass)}>
                    {translate(
                      `strategies.runtime.dynamic_orb.stage_status.${statusKey}`,
                      statusKey === 'complete'
                        ? '完成'
                        : statusKey === 'pending'
                          ? '构建中'
                          : statusKey === 'disabled'
                            ? '已禁用'
                            : '未知'
                    )}
                  </span>
                </div>
                <div
                  className={clsx(
                    styles.dynamicOrbStageMetrics,
                    !hasAtrRatio && styles.dynamicOrbStageMetricsNoAtr
                  )}
                >
                  {hasAtrRatio ? <span>{formatRatio(stage.atrRatio)}</span> : null}
                  <span>{formatRatio(stage.volumeRatio)}</span>
                  <span>{formatCount(stage.breakoutsUp)}</span>
                  <span>{formatCount(stage.breakoutsDown)}</span>
                  <span>{formatCount(stage.retests)}</span>
                  <span>{formatCount(stage.failures)}</span>
                </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {(hasTodayStats || hasWinRates) ? (
        <div className={styles.dynamicOrbSummaryGrid}>
          {hasTodayStats && derived.today ? (
            <div className={styles.dynamicOrbSummaryCard}>
              <div className={styles.dynamicOrbSummaryTitle}>
                {translate('strategies.runtime.dynamic_orb.todays_trades_title', '今日交易')}
              </div>
              <ul className={styles.dynamicOrbSummaryList}>
                <li className={styles.dynamicOrbSummaryItem}>
                  <span className={styles.dynamicOrbSummaryLabel}>
                    {translate('strategies.runtime.dynamic_orb.todays_trades.breakout_up', '突破向上')}
                  </span>
                  <span className={styles.dynamicOrbSummaryValueGroup}>
                    <span>
                      {translate(
                        'strategies.runtime.dynamic_orb.todays_trades.wins_label',
                        `胜 ${derived.today.breakoutUp.wins ?? 0}`,
                        { count: derived.today.breakoutUp.wins ?? 0 }
                      )}
                    </span>
                    <span>
                      {translate(
                        'strategies.runtime.dynamic_orb.todays_trades.losses_label',
                        `负 ${derived.today.breakoutUp.losses ?? 0}`,
                        { count: derived.today.breakoutUp.losses ?? 0 }
                      )}
                    </span>
                  </span>
                </li>
                <li className={styles.dynamicOrbSummaryItem}>
                  <span className={styles.dynamicOrbSummaryLabel}>
                    {translate('strategies.runtime.dynamic_orb.todays_trades.breakout_down', '突破向下')}
                  </span>
                  <span className={styles.dynamicOrbSummaryValueGroup}>
                    <span>
                      {translate(
                        'strategies.runtime.dynamic_orb.todays_trades.wins_label',
                        `胜 ${derived.today.breakoutDown.wins ?? 0}`,
                        { count: derived.today.breakoutDown.wins ?? 0 }
                      )}
                    </span>
                    <span>
                      {translate(
                        'strategies.runtime.dynamic_orb.todays_trades.losses_label',
                        `负 ${derived.today.breakoutDown.losses ?? 0}`,
                        { count: derived.today.breakoutDown.losses ?? 0 }
                      )}
                    </span>
                  </span>
                </li>
                <li className={styles.dynamicOrbSummaryItem}>
                  <span className={styles.dynamicOrbSummaryLabel}>
                    {translate('strategies.runtime.dynamic_orb.todays_trades.retest', '回测次数')}
                  </span>
                  <span className={styles.dynamicOrbSummaryValueGroup}>
                    <span>
                      {translate(
                        'strategies.runtime.dynamic_orb.todays_trades.wins_label',
                        `胜 ${derived.today.retests.wins ?? 0}`,
                        { count: derived.today.retests.wins ?? 0 }
                      )}
                    </span>
                    <span>
                      {translate(
                        'strategies.runtime.dynamic_orb.todays_trades.losses_label',
                        `负 ${derived.today.retests.losses ?? 0}`,
                        { count: derived.today.retests.losses ?? 0 }
                      )}
                    </span>
                  </span>
                </li>
                <li className={styles.dynamicOrbSummaryItem}>
                  <span className={styles.dynamicOrbSummaryLabel}>
                    {translate('strategies.runtime.dynamic_orb.todays_trades.total', '合计')}
                  </span>
                  <span className={styles.dynamicOrbSummaryValueGroup}>
                    <span>
                      {translate(
                        'strategies.runtime.dynamic_orb.todays_trades.wins_label',
                        `胜 ${derived.today.totals.wins ?? 0}`,
                        { count: derived.today.totals.wins ?? 0 }
                      )}
                    </span>
                    <span>
                      {translate(
                        'strategies.runtime.dynamic_orb.todays_trades.losses_label',
                        `负 ${derived.today.totals.losses ?? 0}`,
                        { count: derived.today.totals.losses ?? 0 }
                      )}
                    </span>
                  </span>
                </li>
              </ul>
            </div>
          ) : null}
          {hasWinRates ? (
            <div className={styles.dynamicOrbSummaryCard}>
              <div className={styles.dynamicOrbSummaryTitle}>
                {translate('strategies.runtime.dynamic_orb.win_rate_title', '胜率概览')}
              </div>
              <ul className={styles.dynamicOrbSummaryList}>
                <li className={styles.dynamicOrbSummaryItem}>
                  <span className={styles.dynamicOrbSummaryLabel}>
                    {translate('strategies.runtime.dynamic_orb.win_rate.breakout', '突破胜率')}
                  </span>
                  <span className={styles.dynamicOrbSummaryValue}>{formatPercent(derived.winRates.breakout)}</span>
                </li>
                <li className={styles.dynamicOrbSummaryItem}>
                  <span className={styles.dynamicOrbSummaryLabel}>
                    {translate('strategies.runtime.dynamic_orb.win_rate.retest', '回测胜率')}
                  </span>
                  <span className={styles.dynamicOrbSummaryValue}>{formatPercent(derived.winRates.retest)}</span>
                </li>
                <li className={styles.dynamicOrbSummaryItem}>
                  <span className={styles.dynamicOrbSummaryLabel}>
                    {translate('strategies.runtime.dynamic_orb.win_rate.overall', '综合胜率')}
                  </span>
                  <span className={styles.dynamicOrbSummaryValue}>{formatPercent(derived.winRates.overall)}</span>
                </li>
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

export default DynamicOrbRuntimePanel;
