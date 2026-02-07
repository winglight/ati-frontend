import { useMemo } from 'react';
import type {
  ScreenerProfileConfig,
  ScreenerScheduleConfig,
  ScreenerScheduleMode
} from '@features/dashboard/types';
import ScreenerResultsPanel from './ScreenerResultsPanel';
import styles from './ScreenerDetailContainer.module.css';

interface ScreenerDetailContainerProps {
  strategyId: string;
  profile: ScreenerProfileConfig | null;
  schedule: ScreenerScheduleConfig | null;
  description?: string | null;
}

const MODE_LABELS: Record<ScreenerScheduleMode, string> = {
  manual: '手动',
  hourly: '每小时',
  daily: '每日',
  weekly: '每周',
  monthly: '每月'
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (typeof value === 'boolean') {
    return value ? '是' : '否';
  }
  return String(value);
};

function ScreenerDetailContainer({
  strategyId,
  profile,
  schedule,
  description
}: ScreenerDetailContainerProps) {
  const profileEntries = useMemo(
    () => [
      { label: 'Instrument', value: formatValue(profile?.instrument) },
      { label: 'Location', value: formatValue(profile?.location_code) },
      { label: 'Scan Code', value: formatValue(profile?.scan_code) },
      { label: 'Rows', value: formatValue(profile?.number_of_rows) }
    ],
    [profile]
  );

  const scheduleEntries = useMemo(() => {
    const modeLabel = schedule?.mode ? MODE_LABELS[schedule.mode] ?? schedule.mode : '—';
    return [
      { label: 'Mode', value: formatValue(modeLabel) },
      { label: 'Time', value: formatValue(schedule?.time) },
      { label: 'Minute', value: formatValue(schedule?.minute) },
      { label: 'Weekday', value: formatValue(schedule?.weekday) },
      { label: 'Day', value: formatValue(schedule?.day) },
      { label: 'Timezone', value: formatValue(schedule?.timezone) },
      { label: 'Skip Weekends', value: formatValue(schedule?.skip_weekends) }
    ];
  }, [schedule]);

  const scheduleWindows = schedule?.windows?.filter(Boolean) ?? [];

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <div className={styles.title}>Screener Strategy</div>
          <div className={styles.subtitle}>筛选详情</div>
        </div>
      </header>

      <div className={styles.sectionGrid}>
        <section className={styles.card}>
          <div className={styles.cardTitle}>筛选配置</div>
          <dl className={styles.definitionList}>
            {profileEntries.map((entry) => (
              <div key={entry.label} className={styles.definitionRow}>
                <dt>{entry.label}</dt>
                <dd>{entry.value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className={styles.card}>
          <div className={styles.cardTitle}>筛选日程</div>
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
      </div>

      {description ? (
        <section className={styles.card}>
          <div className={styles.cardTitle}>策略说明</div>
          <p className={styles.description}>{description}</p>
        </section>
      ) : null}

      <section className={styles.resultsSection}>
        <ScreenerResultsPanel strategyId={strategyId} />
      </section>
    </div>
  );
}

export default ScreenerDetailContainer;
