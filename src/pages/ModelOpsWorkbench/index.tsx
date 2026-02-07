import { useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from '../components/PageHeader';
import layoutStyles from '../PageLayout.module.css';
import JobCreator from './JobCreator';
import JobMonitor from './JobMonitor';
import styles from './ModelOpsWorkbench.module.css';
import {
  activateModelVersion,
  createTrainingJob,
  fetchJobStatus,
  listAvailableNewsModels,
  listModelVersions,
  rollbackModelVersion,
  subscribeToModelOpsEvents,
  type CreateTrainingJobPayload,
  type JobStatusPayload,
  type ModelOpsProgressEvent,
  type ModelOpsResultEvent,
  type ModelVersion,
  type NewsModelSummary
} from '@services/aiModelOps';
import { fetchModelOpsOverview, type ModelOpsActiveModel } from '@services/integration';
import { useAppSelector } from '@store/hooks';

const MODEL_NAME = 'trend-probability';
const MAX_PROGRESS_EVENTS = 200;

const mergeJobDetail = (
  detail: JobStatusPayload['detail'],
  extra: Record<string, unknown>
): JobStatusPayload['detail'] => {
  const current = detail ? { ...detail } : {};
  if (typeof extra.symbol === 'string' && extra.symbol) {
    current.symbol = extra.symbol;
  }
  if (typeof extra.timeframe === 'string' && extra.timeframe) {
    current.timeframe = extra.timeframe;
  }
  if (typeof extra.start_at === 'string' && extra.start_at) {
    current.startAt = extra.start_at;
  } else if (typeof extra.startAt === 'string' && extra.startAt) {
    current.startAt = extra.startAt;
  }
  if (typeof extra.end_at === 'string' && extra.end_at) {
    current.endAt = extra.end_at;
  } else if (typeof extra.endAt === 'string' && extra.endAt) {
    current.endAt = extra.endAt;
  }
  if (Array.isArray(extra.features)) {
    current.features = extra.features.filter((entry): entry is string => typeof entry === 'string');
  }
  if (typeof extra.resource_template === 'string' && extra.resource_template) {
    current.resourceTemplate = extra.resource_template;
  } else if (typeof extra.resourceTemplate === 'string' && extra.resourceTemplate) {
    current.resourceTemplate = extra.resourceTemplate;
  }
  return Object.keys(current).length > 0 ? current : null;
};

const upsertJob = (
  jobs: JobStatusPayload[],
  update: JobStatusPayload,
  extraDetail?: Record<string, unknown>
): JobStatusPayload[] => {
  const mergedDetail = extraDetail ? mergeJobDetail(update.detail ?? null, extraDetail) : update.detail;
  const withDetail = { ...update, detail: mergedDetail ?? update.detail ?? null };
  const index = jobs.findIndex((job) => job.jobId === withDetail.jobId);
  if (index === -1) {
    return [withDetail, ...jobs];
  }
  const next = jobs.slice();
  next[index] = { ...next[index], ...withDetail, detail: withDetail.detail ?? next[index].detail ?? null };
  return next;
};

function ModelOpsWorkbenchPage() {
  const token = useAppSelector((state) => state.auth.token);

  const [jobs, setJobs] = useState<JobStatusPayload[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const [progressEvents, setProgressEvents] = useState<ModelOpsProgressEvent[]>([]);
  const [resultEvents, setResultEvents] = useState<Record<string, ModelOpsResultEvent>>({});
  const [newsModels, setNewsModels] = useState<NewsModelSummary[]>([]);
  const [modelVersions, setModelVersions] = useState<ModelVersion[]>([]);
  const [activatingVersion, setActivatingVersion] = useState<string | null>(null);
  const [rollingBackVersion, setRollingBackVersion] = useState<string | null>(null);
  const [activeModel, setActiveModel] = useState<ModelOpsActiveModel | null>(null);
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  const selectedResultEvent = useMemo(
    () => (selectedJobId ? resultEvents[selectedJobId] ?? null : null),
    [resultEvents, selectedJobId]
  );

  useEffect(() => {
    if (!token) {
      setNewsModels([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const models = await listAvailableNewsModels(token);
        if (!cancelled) {
          setNewsModels(models);
        }
      } catch (error) {
        console.warn('[ModelOpsWorkbench] 获取新闻模型列表失败', error);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const resolvedModelName = activeModel?.modelName ?? MODEL_NAME;

  const refreshModelVersions = useCallback(async () => {
    if (!token) {
      return;
    }
    try {
      const versions = await listModelVersions(resolvedModelName, token);
      setModelVersions(versions);
    } catch (error) {
      console.warn('[ModelOpsWorkbench] 获取模型版本失败', error);
    }
  }, [resolvedModelName, token]);

  const refreshOverview = useCallback(async () => {
    if (!token) {
      setActiveModel(null);
      return;
    }
    setOverviewLoading(true);
    try {
      const overview = await fetchModelOpsOverview(token);
      setActiveModel(overview.activeModel ?? null);
      setOverviewError(null);
    } catch (error) {
      console.warn('[ModelOpsWorkbench] 获取模型概要失败', error);
      setOverviewError('无法加载当前激活模型信息');
    } finally {
      setOverviewLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      setModelVersions([]);
      return;
    }
    void refreshModelVersions();
  }, [token, refreshModelVersions]);

  useEffect(() => {
    if (!token) {
      setActiveModel(null);
      setOverviewError(null);
      return;
    }
    void refreshOverview();
  }, [token, refreshOverview]);

  useEffect(() => {
    if (!token) {
      return;
    }
    const subscription = subscribeToModelOpsEvents({
      tokenProvider: () => token,
      onProgress: (event) => {
        setProgressEvents((prev) => {
          const next = [...prev, event];
          if (next.length > MAX_PROGRESS_EVENTS) {
            return next.slice(next.length - MAX_PROGRESS_EVENTS);
          }
          return next;
        });
        setJobs((prev) =>
          upsertJob(prev, { jobId: event.jobId, status: event.status, jobType: event.jobType, detail: null }, event)
        );
      },
      onResult: (event) => {
        setResultEvents((prev) => ({ ...prev, [event.jobId]: event }));
        setJobs((prev) =>
          upsertJob(prev, { jobId: event.jobId, status: event.status, jobType: event.jobType, detail: null })
        );
        void refreshModelVersions();
        void refreshOverview();
      }
    });
    return () => {
      subscription.dispose();
    };
  }, [token, refreshModelVersions, refreshOverview]);

  useEffect(() => {
    if (!selectedJobId && jobs.length > 0) {
      setSelectedJobId(jobs[0].jobId);
      return;
    }
    if (selectedJobId && !jobs.some((job) => job.jobId === selectedJobId) && jobs.length > 0) {
      setSelectedJobId(jobs[0].jobId);
    }
  }, [jobs, selectedJobId]);

  const handleCreateJob = useCallback(
    async (payload: CreateTrainingJobPayload) => {
      if (!token) {
        setCreationError('当前尚未登录，无法提交任务。');
        return;
      }
      setCreating(true);
      setCreationError(null);
      try {
        const accepted = await createTrainingJob(payload, token);
        let status: JobStatusPayload | null = null;
        try {
          status = await fetchJobStatus(accepted.jobId, token);
        } catch (error) {
          console.warn('[ModelOpsWorkbench] 初始查询任务状态失败', error);
        }
        const newJob: JobStatusPayload =
          status ?? {
            jobId: accepted.jobId,
            status: 'accepted',
            jobType: 'training',
            detail: {
              symbol: payload.symbol,
              timeframe: payload.timeframe,
              startAt: payload.startAt,
              endAt: payload.endAt,
              features: payload.features,
              resourceTemplate: payload.resourceTemplate ?? null,
              fusion: payload.fusion
            }
          };
        setJobs((prev) => upsertJob(prev, newJob));
        setSelectedJobId((current) => current ?? newJob.jobId);
      } catch (error) {
        console.error('[ModelOpsWorkbench] 创建训练任务失败', error);
        setCreationError(error instanceof Error ? error.message : '创建训练任务失败');
      } finally {
        setCreating(false);
      }
    },
    [token]
  );

  const handleSelectJob = useCallback((jobId: string) => {
    setSelectedJobId(jobId);
  }, []);

  const handleActivateModel = useCallback(
    async (version: string) => {
      if (!token) {
        return;
      }
      setActivatingVersion(version);
      try {
        await activateModelVersion(version, token, {}, resolvedModelName);
        await refreshModelVersions();
        await refreshOverview();
      } catch (error) {
        console.error('[ModelOpsWorkbench] 激活模型失败', error);
      } finally {
        setActivatingVersion(null);
      }
    },
    [resolvedModelName, token, refreshModelVersions, refreshOverview]
  );

  const handleRollbackModel = useCallback(
    async (version: string) => {
      if (!token) {
        return;
      }
      setRollingBackVersion(version);
      try {
        await rollbackModelVersion(version, token, {}, resolvedModelName);
        await refreshModelVersions();
        await refreshOverview();
      } catch (error) {
        console.error('[ModelOpsWorkbench] 模型回滚失败', error);
      } finally {
        setRollingBackVersion(null);
      }
    },
    [resolvedModelName, token, refreshModelVersions, refreshOverview]
  );

  const selectedProgressEvents = useMemo(
    () => progressEvents.filter((event) => !selectedJobId || event.jobId === selectedJobId),
    [progressEvents, selectedJobId]
  );

  return (
    <div className={`${layoutStyles.page} ${styles.container}`}>
      <PageHeader
        title="预测模型工作台"
        description="管理趋势模型的训练、优化与模型版本，实时查看调度事件并执行模型激活。"
      />

      <div className={styles.grid}>
        <JobCreator
          onSubmit={handleCreateJob}
          submitting={creating}
          error={creationError}
          availableNewsModels={newsModels}
        />
        <JobMonitor
          jobs={jobs}
          selectedJobId={selectedJobId}
          onSelectJob={handleSelectJob}
          progressEvents={selectedProgressEvents}
          resultEvent={selectedResultEvent}
          modelVersions={modelVersions}
          activeModel={activeModel}
          overviewLoading={overviewLoading}
          overviewError={overviewError}
          onActivateModel={handleActivateModel}
          onRollbackModel={handleRollbackModel}
          activatingVersion={activatingVersion}
          rollingBackVersion={rollingBackVersion}
        />
      </div>
    </div>
  );
}

export default ModelOpsWorkbenchPage;
