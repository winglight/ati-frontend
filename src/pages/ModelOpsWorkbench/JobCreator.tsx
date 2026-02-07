import { useEffect, useMemo, useState } from 'react';
import type { CreateTrainingJobPayload, NewsModelSummary } from '@services/aiModelOps';
import styles from './ModelOpsWorkbench.module.css';

const FEATURE_OPTIONS = [
  { id: 'price_trend', label: '价格趋势' },
  { id: 'volume_spike', label: '成交量异动' },
  { id: 'volatility', label: '波动率' },
  { id: 'kalman_signal', label: '卡尔曼平滑信号' }
];

const TIMEFRAME_OPTIONS = [
  { id: '1d', label: '1D 日线' },
  { id: '4h', label: '4H 四小时' },
  { id: '1h', label: '1H 小时线' },
  { id: '15m', label: '15M 15 分钟' }
];

const formatDateTimeLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hour = `${date.getHours()}`.padStart(2, '0');
  const minute = `${date.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
};

const toIsoString = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }
  return parsed.toISOString();
};

interface JobCreatorProps {
  onSubmit: (payload: CreateTrainingJobPayload) => Promise<void> | void;
  submitting?: boolean;
  error?: string | null;
  availableNewsModels?: NewsModelSummary[];
}

function JobCreator({
  onSubmit,
  submitting = false,
  error,
  availableNewsModels = []
}: JobCreatorProps) {
  const now = useMemo(() => new Date(), []);
  const defaultStart = useMemo(() => {
    const clone = new Date(now);
    clone.setDate(clone.getDate() - 30);
    clone.setHours(0, 0, 0, 0);
    return formatDateTimeLocal(clone);
  }, [now]);
  const defaultEnd = useMemo(() => formatDateTimeLocal(now), [now]);

  const [symbol, setSymbol] = useState('MNQ');
  const [timeframe, setTimeframe] = useState(TIMEFRAME_OPTIONS[2]?.id ?? '1h');
  const [startAt, setStartAt] = useState(defaultStart);
  const [endAt, setEndAt] = useState(defaultEnd);
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>(() =>
    FEATURE_OPTIONS.map((feature) => feature.id)
  );
  const [resourceTemplate, setResourceTemplate] = useState('gpu-medium');
  const [enableNews, setEnableNews] = useState(true);
  const [newsModel, setNewsModel] = useState<string | null>(() => {
    if (!availableNewsModels.length) {
      return null;
    }
    return availableNewsModels[0]?.id ?? null;
  });

  useEffect(() => {
    if (!availableNewsModels.length) {
      setNewsModel(null);
      return;
    }
    setNewsModel((current) => current ?? availableNewsModels[0]?.id ?? null);
  }, [availableNewsModels]);

  const handleFeatureToggle = (featureId: string) => {
    setSelectedFeatures((current) => {
      if (current.includes(featureId)) {
        return current.filter((id) => id !== featureId);
      }
      return [...current, featureId];
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const payload: CreateTrainingJobPayload = {
      symbol: symbol.trim() || 'MNQ',
      timeframe,
      startAt: toIsoString(startAt),
      endAt: toIsoString(endAt),
      features: selectedFeatures.length > 0 ? selectedFeatures : [FEATURE_OPTIONS[0]?.id ?? 'price_trend'],
      resourceTemplate: resourceTemplate ? resourceTemplate.trim() : null,
      fusion: {
        enableNewsFeatures: enableNews,
        weights: null,
        newsModelVersion: enableNews ? newsModel : null
      }
    };
    const result = onSubmit(payload);
    if (result && typeof (result as Promise<void>).then === 'function') {
      await result;
    }
  };

  return (
    <form className={styles.panel} onSubmit={handleSubmit} aria-label="创建训练任务表单">
      <div>
        <h2 className={styles.sectionTitle}>创建训练任务</h2>
        <p className={styles.sectionDescription}>
          选择训练区间与资源配置，工作台会通过 AI Model Ops 调度器创建独立任务并跟踪执行进度。
        </p>
      </div>

      <div className={styles.formGrid}>
        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="model-ops-symbol">
            训练标的
          </label>
          <input
            id="model-ops-symbol"
            className={styles.input}
            value={symbol}
            onChange={(event) => setSymbol(event.target.value)}
            placeholder="例如：MNQ"
            required
          />
        </div>

        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="model-ops-timeframe">
            K 线周期
          </label>
          <select
            id="model-ops-timeframe"
            className={styles.select}
            value={timeframe}
            onChange={(event) => setTimeframe(event.target.value)}
          >
            {TIMEFRAME_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="model-ops-start">
            开始时间
          </label>
          <input
            id="model-ops-start"
            className={styles.input}
            type="datetime-local"
            value={startAt}
            onChange={(event) => setStartAt(event.target.value)}
            required
          />
        </div>

        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="model-ops-end">
            结束时间
          </label>
          <input
            id="model-ops-end"
            className={styles.input}
            type="datetime-local"
            value={endAt}
            onChange={(event) => setEndAt(event.target.value)}
            required
          />
        </div>

        <div className={styles.formRow}>
          <span className={styles.label}>特征管线</span>
          <div className={styles.checkboxGroup}>
            {FEATURE_OPTIONS.map((feature) => (
              <label key={feature.id} className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={selectedFeatures.includes(feature.id)}
                  onChange={() => handleFeatureToggle(feature.id)}
                />
                {feature.label}
              </label>
            ))}
          </div>
        </div>

        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="model-ops-resource">
            资源模板
          </label>
          <input
            id="model-ops-resource"
            className={styles.input}
            value={resourceTemplate}
            onChange={(event) => setResourceTemplate(event.target.value)}
            placeholder="例如：gpu-medium"
          />
        </div>

        <div className={styles.formRow}>
          <label className={styles.label} htmlFor="model-ops-enable-news">
            新闻子模型
          </label>
          <div className={styles.checkboxGroup}>
            <label className={styles.checkboxLabel}>
              <input
                id="model-ops-enable-news"
                type="checkbox"
                checked={enableNews}
                onChange={(event) => setEnableNews(event.target.checked)}
              />
              启用新闻特征融合
            </label>
            <select
              className={styles.select}
              value={newsModel ?? ''}
              onChange={(event) => setNewsModel(event.target.value || null)}
              disabled={!enableNews}
            >
              {availableNewsModels.length === 0 ? (
                <option value="">暂无可选新闻模型</option>
              ) : (
                availableNewsModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                    {model.latencyMs != null ? ` · ${model.latencyMs}ms` : ''}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </div>

      {error ? <p role="alert" className={styles.error}>{error}</p> : null}

      <div className={styles.actions}>
        <button type="submit" className={styles.primaryButton} disabled={submitting}>
          {submitting ? '提交中...' : '创建训练任务'}
        </button>
      </div>
    </form>
  );
}

export default JobCreator;
