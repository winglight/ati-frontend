import { useMemo, useState } from 'react';
import type { ModelMetadata, NewsServiceEvent, SentimentSignal } from '@services/newsService';
import styles from './NewsWorkbench.module.css';

export interface TrainingDashboardProps {
  events: NewsServiceEvent[];
  recentSignals: SentimentSignal[];
  modelMetadata: Record<string, ModelMetadata>;
  activeModelVersion: string | null;
  submitting: boolean;
  submissionError?: string | null;
  onSubmitTraining: (payload: { dataset: string; notes?: string | null }) => void;
  onActivateModel?: (version: string) => void;
}

const summarizeSignals = (signals: SentimentSignal[]) => {
  const versions = new Map<string, number>();
  for (const signal of signals) {
    versions.set(signal.modelVersion, (versions.get(signal.modelVersion) ?? 0) + 1);
  }
  return Array.from(versions.entries())
    .map(([version, count]) => ({ version, count }))
    .sort((a, b) => b.count - a.count);
};

const formatTimestamp = (value: string): string => {
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`;
  } catch (_error) {
    return value;
  }
};

const toDisplayPayload = (payload: Record<string, unknown>): string => {
  try {
    return JSON.stringify(payload, null, 2);
  } catch (_error) {
    return String(payload);
  }
};

function TrainingDashboard({
  events,
  recentSignals,
  modelMetadata,
  activeModelVersion,
  submitting,
  submissionError,
  onSubmitTraining,
  onActivateModel
}: TrainingDashboardProps) {
  const [dataset, setDataset] = useState('baseline');
  const [notes, setNotes] = useState('');

  const popularVersions = useMemo(() => summarizeSignals(recentSignals), [recentSignals]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmitTraining({ dataset: dataset.trim() || 'baseline', notes: notes.trim() || null });
  };

  return (
    <section className={styles.section} aria-label="training-dashboard">
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>训练监控与模型管理</h2>
          <p className={styles.sectionDescription}>
            查看实时事件流、提交新的训练任务并在候选模型之间切换灰度/激活状态。
          </p>
        </div>
        <div className={styles.sectionDescription}>
          当前激活模型：{activeModelVersion ?? '未知'}
        </div>
      </div>
      <div className={styles.sectionBody}>
        <form className={styles.formRow} onSubmit={handleSubmit}>
          <div className={styles.formControl}>
            <label htmlFor="news-training-dataset">训练数据集</label>
            <input
              id="news-training-dataset"
              value={dataset}
              onChange={(event) => setDataset(event.target.value)}
              placeholder="如 baseline / headline-2024"
            />
          </div>
          <div className={styles.formControl} style={{ flex: '2 1 240px' }}>
            <label htmlFor="news-training-notes">备注</label>
            <textarea
              id="news-training-notes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="可选，用于记录实验目的或参数"
            />
          </div>
          <div className={styles.formActions}>
            <button type="submit" className={styles.primaryButton} disabled={submitting}>
              {submitting ? '提交中…' : '提交训练任务'}
            </button>
          </div>
        </form>
        {submissionError ? <p className={styles.errorText}>{submissionError}</p> : null}
        <div>
          <h3 className={styles.sectionTitle} style={{ fontSize: '16px' }}>
            模型候选概览
          </h3>
          {popularVersions.length === 0 ? (
            <p className={styles.sectionDescription}>尚未产生情绪信号，无法统计模型热度。</p>
          ) : (
            <div className={styles.eventList} style={{ maxHeight: '160px' }}>
              {popularVersions.map(({ version, count }) => {
                const metadata = modelMetadata[version];
                const metricsText = metadata && Object.keys(metadata.metrics).length
                  ? Object.entries(metadata.metrics)
                      .map(([key, value]) => `${key}: ${value.toFixed(3)}`)
                      .join(' · ')
                  : '暂无指标';
                return (
                  <div key={version} className={styles.eventItem}>
                    <div className={styles.eventMeta}>
                      <span>版本：{version}</span>
                      <span>采样次数：{count}</span>
                    </div>
                    <div className={styles.sectionDescription}>{metricsText}</div>
                    {onActivateModel ? (
                      <div className={styles.formActions}>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          onClick={() => onActivateModel(version)}
                          disabled={activeModelVersion === version}
                        >
                          {activeModelVersion === version ? '已激活' : '激活该版本'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div>
          <h3 className={styles.sectionTitle} style={{ fontSize: '16px' }}>
            实时事件
          </h3>
          {events.length === 0 ? (
            <p className={styles.sectionDescription}>尚未接收到事件，可稍后刷新或检查服务状态。</p>
          ) : (
            <div className={styles.eventList}>
              {events.map((event) => (
                <div key={`${event.receivedAt}-${event.channel}`} className={styles.eventItem}>
                  <div className={styles.eventMeta}>
                    <span>{event.type}</span>
                    <span>{formatTimestamp(event.receivedAt)}</span>
                  </div>
                  <pre className={styles.eventPayload}>{toDisplayPayload(event.payload)}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default TrainingDashboard;
