import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ScreenerProfileConfig,
  ScreenerScheduleConfig,
  StrategyDetailSummary,
  StrategyItem
} from '@features/dashboard/types';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { addToast } from '@store/slices/toastSlice';
import {
  fetchScreenerMetadata,
  type ScreenerFilterDefinition,
  type ScreenerMetadataOption
} from '@services/strategyApi';
import { formatTimestamp } from './formatTimestamp';
import ScreenerResultsPanel, { type ScreenerResultsPanelHandle } from './ScreenerResultsPanel';
import styles from './ScreenerDetailPanel.module.css';

interface ScreenerDetailPanelProps {
  strategy: StrategyItem | null;
  detail: StrategyDetailSummary | null;
}

type RequestStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

type ScreenerEntry = {
  label: string;
  value: string;
  description?: string | null;
};

const BASE_FIELDS = new Set(['instrument', 'location_code', 'scan_code', 'number_of_rows']);

const MODE_LABELS: Record<string, string> = {
  manual: '仅手动筛选',
  hourly: '每小时筛选',
  daily: '每日筛选',
  weekly: '每周筛选',
  monthly: '每月筛选'
};

const STATUS_LABELS: Record<string, string> = {
  running: '定时中',
  error: '异常',
  starting: '准备中',
  stopped: '未启用'
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (typeof value === 'boolean') {
    return value ? '是' : '否';
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString();
  }
  return String(value);
};

const findOptionLabel = (options: ScreenerMetadataOption[] | null | undefined, value: unknown): string | null => {
  if (!options || value === null || value === undefined) {
    return null;
  }
  const normalized = String(value);
  const match = options.find((option) => String(option.value) === normalized);
  return match ? match.label : null;
};

const formatFilterToken = (
  value: unknown,
  definition?: ScreenerFilterDefinition | null
): string => {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (definition?.options?.length) {
    const label = findOptionLabel(definition.options, value);
    if (label) {
      return label;
    }
  }
  const normalizedType = definition?.type?.toLowerCase() ?? '';
  if (normalizedType.includes('bool')) {
    if (typeof value === 'boolean') {
      return value ? '是' : '否';
    }
    if (value === 'true' || value === 'false') {
      return value === 'true' ? '是' : '否';
    }
  }
  if (
    normalizedType.includes('int') ||
    normalizedType.includes('float') ||
    normalizedType.includes('double') ||
    normalizedType.includes('decimal') ||
    normalizedType.includes('number')
  ) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed.toLocaleString();
    }
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString();
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return String(value);
    }
  }
  return String(value);
};

const formatFilterValue = (
  value: unknown,
  definition?: ScreenerFilterDefinition | null
): string => {
  if (Array.isArray(value)) {
    const tokens = value.map((entry) => formatFilterToken(entry, definition));
    return tokens.length ? tokens.join(', ') : '—';
  }
  return formatFilterToken(value, definition);
};

const buildFilterMeta = (definition?: ScreenerFilterDefinition | null): string | null => {
  const parts: string[] = [];
  const valueType = definition?.type?.trim();
  if (valueType) {
    parts.push(`类型：${valueType}`);
  }
  const description = definition?.description?.trim();
  if (description) {
    parts.push(description);
  }
  return parts.length ? parts.join(' · ') : null;
};

const buildProfileEntries = (
  profile: ScreenerProfileConfig | null,
  filterDefinitions: Record<string, ScreenerFilterDefinition>,
  metadataOptions: {
    instruments: ScreenerMetadataOption[];
    locations: ScreenerMetadataOption[];
    scanCodes: ScreenerMetadataOption[];
  }
): ScreenerEntry[] => {
  if (!profile) {
    return [];
  }

  const instrumentLabel =
    findOptionLabel(metadataOptions.instruments, profile.instrument) ??
    formatValue(profile.instrument);
  const locationLabel =
    findOptionLabel(metadataOptions.locations, profile.location_code) ??
    formatValue(profile.location_code);
  const scanCodeLabel =
    findOptionLabel(metadataOptions.scanCodes, profile.scan_code) ??
    formatValue(profile.scan_code);

  const entries: ScreenerEntry[] = [
    { label: '资产类型', value: instrumentLabel },
    { label: '市场范围', value: locationLabel },
    { label: '扫描代码', value: scanCodeLabel },
    { label: '结果数量', value: formatValue(profile.number_of_rows) }
  ];

  Object.entries(profile)
    .filter(([key]) => !BASE_FIELDS.has(key))
    .forEach(([key, value]) => {
      const definition = filterDefinitions[key];
      entries.push({
        label: definition?.label ?? key,
        description: buildFilterMeta(definition),
        value: formatFilterValue(value, definition)
      });
    });

  return entries;
};

const buildScheduleEntries = (schedule: ScreenerScheduleConfig | null): ScreenerEntry[] => {
  const modeLabel = schedule?.mode ? MODE_LABELS[schedule.mode] ?? schedule.mode : '—';
  const skipWeekendsLabel =
    schedule?.skip_weekends === null || schedule?.skip_weekends === undefined
      ? null
      : schedule.skip_weekends
        ? '跳过周末'
        : '不跳过周末';
  return [
    { label: '运行方式', value: formatValue(modeLabel) },
    { label: '执行时间', value: formatValue(schedule?.time) },
    { label: '分钟', value: formatValue(schedule?.minute) },
    { label: '星期', value: formatValue(schedule?.weekday) },
    { label: '日期', value: formatValue(schedule?.day) },
    { label: '时区', value: formatValue(schedule?.timezone) },
    { label: '周末处理', value: formatValue(skipWeekendsLabel) }
  ];
};

function ScreenerDetailPanel({ strategy, detail }: ScreenerDetailPanelProps) {
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.auth.token);
  const [metadataStatus, setMetadataStatus] = useState<RequestStatus>('idle');
  const [metadataDefinitions, setMetadataDefinitions] = useState<Record<string, ScreenerFilterDefinition>>({});
  const [metadataOptions, setMetadataOptions] = useState<{
    instruments: ScreenerMetadataOption[];
    locations: ScreenerMetadataOption[];
    scanCodes: ScreenerMetadataOption[];
  }>({ instruments: [], locations: [], scanCodes: [] });
  const [lastResultCount, setLastResultCount] = useState<number | null>(null);
  const [lastErrorMessage, setLastErrorMessage] = useState<string | null>(null);
  const resultsRef = useRef<ScreenerResultsPanelHandle>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    if (metadataStatus === 'loading' || metadataStatus === 'succeeded') {
      return;
    }
    setMetadataStatus('loading');
    fetchScreenerMetadata(token)
      .then((metadata) => {
        const definitionMap = metadata.filters.reduce<Record<string, ScreenerFilterDefinition>>(
          (acc, definition) => {
            acc[definition.name] = definition;
            return acc;
          },
          {}
        );
        setMetadataDefinitions(definitionMap);
        setMetadataOptions({
          instruments: metadata.instruments ?? [],
          locations: metadata.locations ?? [],
          scanCodes: metadata.scanCodes ?? []
        });
        setMetadataStatus('succeeded');
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : '加载筛选器元数据失败';
        dispatch(addToast({ message, variant: 'error', preventDuplicates: true }));
        setMetadataStatus('failed');
      });
  }, [dispatch, metadataStatus, token]);

  const strategyId = strategy?.id ?? '';
  const profile = detail?.screenerProfile ?? strategy?.screenerProfile ?? null;
  const schedule = detail?.screenerSchedule ?? strategy?.screenerSchedule ?? null;

  const profileEntries = useMemo(
    () => buildProfileEntries(profile, metadataDefinitions, metadataOptions),
    [metadataDefinitions, metadataOptions, profile]
  );

  const scheduleEntries = useMemo(() => buildScheduleEntries(schedule), [schedule]);
  const scheduleWindows = schedule?.windows?.filter(Boolean) ?? [];

  const name = detail?.name ?? strategy?.name ?? '—';
  const template = detail?.strategyType ?? strategy?.templateId ?? '—';
  const lastRun =
    detail?.lastTriggeredAt ??
    strategy?.lastTriggeredAt ??
    detail?.updatedAt ??
    strategy?.lastUpdatedAt ??
    null;
  const status = strategy?.status ?? 'stopped';
  const statusLabel = STATUS_LABELS[status] ?? status;
  const handleRun = useCallback(() => {
    resultsRef.current?.run();
  }, []);

  const handleRefresh = useCallback(() => {
    resultsRef.current?.refresh();
  }, []);

  const handleResultsSummary = useCallback(
    (summary: { lastResultCount: number | null; lastError: string | null }) => {
      setLastResultCount(summary.lastResultCount);
      setLastErrorMessage(summary.lastError);
    },
    []
  );

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <div className={styles.title}>{name}</div>
          <div className={styles.subtitle}>模板：{template}</div>
        </div>
        <div className={styles.headerAside}>
          <div className={styles.statusGroup}>
            <div className={styles.statusItem}>
              <span className={styles.statusLabel}>最近运行</span>
              <span className={styles.statusValue}>{formatTimestamp(lastRun)}</span>
            </div>
            <div className={styles.statusItem}>
              <span className={styles.statusLabel}>最后结果数量</span>
              <span className={styles.statusValue}>{formatValue(lastResultCount)}</span>
            </div>
            <div className={styles.statusItem}>
              <span className={styles.statusLabel}>定时状态</span>
              <span className={`${styles.statusBadge} ${styles[`status-${status}`] ?? ''}`}>
                {statusLabel}
              </span>
            </div>
          </div>
          <div className={styles.actions}>
            <button type="button" className={styles.primaryButton} onClick={handleRun}>
              手动筛选
            </button>
            <button type="button" className={styles.secondaryButton} onClick={handleRefresh}>
              刷新
            </button>
          </div>
        </div>
      </header>

      <div className={styles.sectionGrid}>
        <section className={styles.card}>
          <div className={styles.cardTitle}>筛选条件</div>
          {profileEntries.length ? (
            <dl className={styles.definitionList}>
              {profileEntries.map((entry) => (
                <div key={entry.label} className={styles.definitionRow}>
                  <dt>
                    <div className={styles.definitionLabel}>{entry.label}</div>
                    {entry.description ? (
                      <div className={styles.definitionDescription}>{entry.description}</div>
                    ) : null}
                  </dt>
                  <dd>{entry.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className={styles.emptyState}>暂无筛选条件。</div>
          )}
        </section>

        <section className={styles.card}>
          <div className={styles.cardTitle}>调度</div>
          <dl className={styles.definitionList}>
            {scheduleEntries.map((entry) => (
              <div key={entry.label} className={styles.definitionRow}>
                <dt>{entry.label}</dt>
                <dd>{entry.value}</dd>
              </div>
            ))}
          </dl>
          {scheduleWindows.length ? (
            <div className={styles.windowList}>
              {scheduleWindows.map((window) => (
                <span
                  key={`${window?.start ?? ''}-${window?.end ?? ''}`}
                  className={styles.windowBadge}
                >
                  {formatValue(window?.start)} → {formatValue(window?.end)}
                </span>
              ))}
            </div>
          ) : null}
        </section>

        <section className={styles.resultsCard}>
          <ScreenerResultsPanel
            ref={resultsRef}
            strategyId={strategyId}
            showHeader={false}
            showActions={false}
            variant="embedded"
            onSummaryChange={handleResultsSummary}
          />
          {lastErrorMessage ? (
            <div className={styles.errorBanner}>{lastErrorMessage}</div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export default ScreenerDetailPanel;
