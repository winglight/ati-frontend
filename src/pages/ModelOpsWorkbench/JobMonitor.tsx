import { useMemo } from 'react';
import type {
  JobStatusPayload,
  ModelOpsProgressEvent,
  ModelOpsResultEvent,
  ModelVersion
} from '@services/aiModelOps';
import type { ModelOpsActiveModel } from '@services/integration';
import styles from './ModelOpsWorkbench.module.css';

const formatTimestamp = (value: string | undefined | null): string => {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour12: false })}`;
};

interface JobMonitorProps {
  jobs: JobStatusPayload[];
  selectedJobId: string | null;
  onSelectJob: (jobId: string) => void;
  progressEvents: ModelOpsProgressEvent[];
  resultEvent?: ModelOpsResultEvent | null;
  modelVersions: ModelVersion[];
  activeModel?: ModelOpsActiveModel | null;
  overviewLoading?: boolean;
  overviewError?: string | null;
  onActivateModel: (version: string) => Promise<void> | void;
  onRollbackModel: (version: string) => Promise<void> | void;
  activatingVersion?: string | null;
  rollingBackVersion?: string | null;
}

function JobMonitor({
  jobs,
  selectedJobId,
  onSelectJob,
  progressEvents,
  resultEvent,
  modelVersions,
  activeModel = null,
  overviewLoading = false,
  overviewError = null,
  onActivateModel,
  onRollbackModel,
  activatingVersion = null,
  rollingBackVersion = null
}: JobMonitorProps) {
  const selectedJob = useMemo(
    () => jobs.find((job) => job.jobId === selectedJobId) ?? null,
    [jobs, selectedJobId]
  );

  const jobTimeline = useMemo(() => {
    if (!selectedJobId) {
      return [];
    }
    return progressEvents
      .filter((event) => event.jobId === selectedJobId)
      .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
  }, [progressEvents, selectedJobId]);

  const metrics = useMemo(() => {
    const result = resultEvent?.result ?? null;
    if (!result) {
      return [] as Array<{ key: string; value: number }>;
    }
    const metricsPayload =
      (result.metrics as Record<string, unknown> | undefined) ??
      (result.summary as Record<string, unknown> | undefined) ??
      null;
    if (!metricsPayload) {
      return [] as Array<{ key: string; value: number }>;
    }
    const entries: Array<{ key: string; value: number }> = [];
    for (const [key, raw] of Object.entries(metricsPayload)) {
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        entries.push({ key, value: raw });
      } else if (typeof raw === 'string') {
        const parsed = Number.parseFloat(raw);
        if (Number.isFinite(parsed)) {
          entries.push({ key, value: parsed });
        }
      }
    }
    return entries;
  }, [resultEvent]);

  const activationHandler = (version: string) => {
    const outcome = onActivateModel(version);
    if (outcome && typeof (outcome as Promise<void>).then === 'function') {
      void (outcome as Promise<void>);
    }
  };

  const rollbackHandler = (version: string) => {
    const outcome = onRollbackModel(version);
    if (outcome && typeof (outcome as Promise<void>).then === 'function') {
      void (outcome as Promise<void>);
    }
  };

  const activeVersion = activeModel?.version ?? null;

  const eventMetrics = (event: ModelOpsProgressEvent) => {
    const metrics: Array<{ key: string; value: number | string }> = [];
    const metricsPayload = event.metrics;
    if (metricsPayload && typeof metricsPayload === 'object') {
      for (const [key, raw] of Object.entries(metricsPayload as Record<string, unknown>)) {
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          metrics.push({ key, value: raw });
        } else if (typeof raw === 'string' && raw) {
          metrics.push({ key, value: raw });
        }
      }
    }
    if (metrics.length > 0) {
      return metrics;
    }
    const ignored = new Set(['channel', 'jobId', 'stage', 'status', 'jobType', 'receivedAt', 'message', 'metrics']);
    for (const [key, value] of Object.entries(event)) {
      if (ignored.has(key)) {
        continue;
      }
      if (typeof value === 'number' && Number.isFinite(value)) {
        metrics.push({ key, value });
      } else if (typeof value === 'string' && value.length > 0 && value.length < 40) {
        metrics.push({ key, value });
      }
    }
    return metrics;
  };

  return (
    <section className={styles.panel} aria-label="模型任务监控">
      <div>
        <h2 className={styles.sectionTitle}>任务监控</h2>
        <p className={styles.sectionDescription}>
          查看训练与超参任务的执行轨迹、指标产出以及已注册的模型版本，可直接在此激活最新模型。
        </p>
      </div>

      <div>
        <h3 className={styles.sectionTitle}>任务列表</h3>
        {jobs.length === 0 ? (
          <div className={styles.emptyState}>当前暂无任务，创建训练任务后将自动出现在列表中。</div>
        ) : (
          <div className={styles.jobList} role="list">
            {jobs.map((job) => {
              const detail = job.detail ?? undefined;
              const subtitleParts: string[] = [];
              if (detail?.symbol) {
                subtitleParts.push(detail.symbol);
              }
              if (detail?.timeframe) {
                subtitleParts.push(detail.timeframe);
              }
              return (
                <button
                  key={job.jobId}
                  type="button"
                  className={
                    job.jobId === selectedJobId
                      ? `${styles.jobItem} ${styles.jobItemActive}`
                      : styles.jobItem
                  }
                  onClick={() => onSelectJob(job.jobId)}
                >
                  <span className={styles.jobStatus}>{job.status.toUpperCase()}</span>
                  <strong>{job.jobId}</strong>
                  <span className={styles.jobMeta}>
                    {subtitleParts.join(' · ')}
                    {detail?.startAt ? ` · ${formatTimestamp(detail.startAt)}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selectedJob ? (
        <div>
          <h3 className={styles.sectionTitle}>任务详情</h3>
          {jobTimeline.length === 0 ? (
            <div className={styles.emptyState}>正在等待调度器上报阶段事件...</div>
          ) : (
            <div className={styles.timeline}>
              {jobTimeline.map((event) => {
                const metricsList = eventMetrics(event);
                return (
                  <div key={`${event.jobId}-${event.receivedAt}-${event.stage}`} className={styles.timelineItem}>
                    <div className={styles.timelineHeader}>
                      <span className={styles.timelineStage}>{event.stage}</span>
                      <span>{formatTimestamp(event.receivedAt)}</span>
                    </div>
                    <div className={styles.jobMeta}>状态：{event.status}</div>
                    {'message' in event && typeof event.message === 'string' ? (
                      <div className={styles.jobMeta}>说明：{event.message}</div>
                    ) : null}
                    {metricsList.length > 0 ? (
                      <div className={styles.eventMetrics}>
                        {metricsList.slice(0, 6).map((metric) => (
                          <span key={metric.key} className={styles.eventMetric}>
                            {metric.key}: {typeof metric.value === 'number' ? metric.value.toFixed(4) : metric.value}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      {metrics.length > 0 ? (
        <div>
          <h3 className={styles.sectionTitle}>关键指标</h3>
          <div className={styles.metricsGrid}>
            {metrics.map((metric) => (
              <div key={metric.key} className={styles.metricCard}>
                <span className={styles.metricLabel}>{metric.key}</span>
                <span className={styles.metricValue}>{metric.value.toFixed(4)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <h3 className={styles.sectionTitle}>当前激活模型</h3>
        {overviewLoading ? (
          <div className={styles.emptyState}>正在加载激活信息...</div>
        ) : overviewError ? (
          <div className={styles.error}>{overviewError}</div>
        ) : activeModel ? (
          <div className={styles.activeModelCard}>
            <div>
              <div className={styles.activeModelTitle}>
                <strong>{activeModel.modelName}</strong>
                <span className={styles.activeBadge}>Active</span>
              </div>
              <div className={styles.jobMeta}>版本：{activeModel.version}</div>
              <div className={styles.jobMeta}>
                激活时间：{activeModel.activatedAt ? formatTimestamp(activeModel.activatedAt) : '—'}
              </div>
              {activeModel.reason ? <div className={styles.jobMeta}>原因：{activeModel.reason}</div> : null}
            </div>
            {activeModel.metrics && Object.keys(activeModel.metrics).length > 0 ? (
              <div className={styles.activeMetrics}>
                {Object.entries(activeModel.metrics)
                  .slice(0, 4)
                  .map(([key, value]) => (
                    <div key={key} className={styles.metricChip}>
                      <span>{key}</span>
                      <strong>{value.toFixed(4)}</strong>
                    </div>
                  ))}
              </div>
            ) : (
              <div className={styles.jobMeta}>暂无激活模型指标摘要。</div>
            )}
          </div>
        ) : (
          <div className={styles.emptyState}>尚未检测到激活模型。</div>
        )}
      </div>

      <div>
        <h3 className={styles.sectionTitle}>模型版本</h3>
        {modelVersions.length === 0 ? (
          <div className={styles.emptyState}>暂无已注册的模型版本</div>
        ) : (
          <table className={styles.modelTable}>
            <thead>
              <tr>
                <th>版本号</th>
                <th>来源任务</th>
                <th>指标摘要</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {modelVersions.map((version) => (
                <tr key={version.version}>
                  <td>{version.version}</td>
                  <td>{version.jobId || '—'}</td>
                  <td>
                    {Object.keys(version.metrics).length === 0
                      ? '—'
                      : Object.entries(version.metrics)
                          .map(([key, value]) => `${key}: ${value.toFixed(4)}`)
                          .join(' / ')}
                  </td>
                  <td>
                    <div className={styles.modelActions}>
                      {activeVersion === version.version ? (
                        <span className={styles.activeBadge}>当前</span>
                      ) : (
                        <button
                          type="button"
                          className={styles.activateButton}
                          onClick={() => activationHandler(version.version)}
                          disabled={activatingVersion === version.version}
                        >
                          {activatingVersion === version.version ? '上线中...' : '上线'}
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.rollbackButton}
                        onClick={() => rollbackHandler(version.version)}
                        disabled={rollingBackVersion === version.version}
                      >
                        {rollingBackVersion === version.version ? '回滚中...' : '回滚'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {jobTimeline.length > 0 ? (
        <div>
          <h3 className={styles.sectionTitle}>日志</h3>
          <div className={styles.logList}>
            {jobTimeline.map((event) => (
              <span key={`log-${event.jobId}-${event.receivedAt}-${event.stage}`}>
                [{formatTimestamp(event.receivedAt)}] {event.stage} → {event.status}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default JobMonitor;
