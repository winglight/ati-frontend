import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import PageHeader from './components/PageHeader';
import layoutStyles from './PageLayout.module.css';
import styles from './LogsPage.module.css';
import { DEFAULT_LOG_LEVELS, compressLevels, expandLevels, sortLevels } from '../utils/logLevels';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { fetchLogs, pollLogs } from '@store/thunks/logs';
import {
  resetFilters,
  setDateRange,
  setLevels,
  setPage,
  setPageSize,
  setSearch
} from '@store/slices/logsSlice';
import type { LogEntry } from '@services/logsApi';

const formatTimestamp = (value: string | null | undefined): string => {
  if (!value) {
    return '—';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return `${parsed.toLocaleDateString()} ${parsed.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })}`;
};

const toInputValue = (value: string | null): string => {
  if (!value) {
    return '';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return '';
  }
  const pad = (num: number) => num.toString().padStart(2, '0');
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`;
};

const fromInputValue = (value: string): string | null => {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString();
};

const levelClassMap: Record<string, string> = {
  DEBUG: styles.levelDebug,
  INFO: styles.levelInfo,
  NOTICE: styles.levelInfo,
  WARNING: styles.levelWarning,
  WARN: styles.levelWarning,
  ERROR: styles.levelError,
  CRITICAL: styles.levelCritical,
  FATAL: styles.levelCritical
};

const renderContext = (entry: LogEntry): JSX.Element => {
  if (entry.context && Object.keys(entry.context).length > 0) {
    return (
      <pre className={styles.contextBox}>{JSON.stringify(entry.context, null, 2)}</pre>
    );
  }
  if (entry.raw) {
    return <code className={styles.rawLine}>{entry.raw}</code>;
  }
  return <span className={styles.emptyPlaceholder}>—</span>;
};

function LogsPage() {
  const dispatch = useAppDispatch();
  const logsState = useAppSelector((state) => state.logs);
  const [searchInput, setSearchInput] = useState(logsState.filters.search);
  const [startInput, setStartInput] = useState(toInputValue(logsState.filters.start));
  const [endInput, setEndInput] = useState(toInputValue(logsState.filters.end));

  useEffect(() => {
    if (logsState.status === 'idle') {
      void dispatch(fetchLogs(undefined));
    }
  }, [dispatch, logsState.status]);

  useEffect(() => {
    if (logsState.page !== 1 || logsState.status === 'idle') {
      return;
    }

    const tick = () => {
      void dispatch(pollLogs());
    };

    tick();
    const interval = window.setInterval(tick, 5000);
    return () => {
      window.clearInterval(interval);
    };
  }, [dispatch, logsState.page, logsState.status, logsState.pageSize]);

  useEffect(() => {
    setSearchInput(logsState.filters.search);
    setStartInput(toInputValue(logsState.filters.start));
    setEndInput(toInputValue(logsState.filters.end));
  }, [logsState.filters.search, logsState.filters.start, logsState.filters.end]);

  const levelOptions = useMemo(
    () => sortLevels([...DEFAULT_LOG_LEVELS, ...logsState.availableLevels]),
    [logsState.availableLevels]
  );

  const totalPages = useMemo(() => {
    if (logsState.pageSize <= 0) {
      return 1;
    }
    const computed = Math.ceil(logsState.total / logsState.pageSize);
    if (computed > 0) {
      return computed;
    }
    return logsState.hasNext ? logsState.page + 1 : Math.max(logsState.page, 1);
  }, [logsState.total, logsState.pageSize, logsState.hasNext, logsState.page]);

  const toggleLevel = useCallback(
    (level: string) => {
      const normalized = level.toUpperCase();
      const activeLevels = logsState.filters.levels;
      const nextLevels = compressLevels(
        activeLevels.includes(normalized)
          ? activeLevels.filter((item) => item !== normalized)
          : [...activeLevels, normalized]
      );
      const expandedLevels = expandLevels(nextLevels);
      dispatch(setLevels(nextLevels));
      void dispatch(
        fetchLogs({ page: 1, levels: expandedLevels.length > 0 ? expandedLevels : undefined })
      );
    },
    [dispatch, logsState.filters.levels]
  );

  const handleApplySearch = useCallback(() => {
    dispatch(setSearch(searchInput.trim()));
    void dispatch(fetchLogs({ page: 1, search: searchInput.trim() }));
  }, [dispatch, searchInput]);

  const handleRefresh = useCallback(() => {
    void dispatch(fetchLogs({ page: logsState.page }));
  }, [dispatch, logsState.page]);

  const handlePageChange = useCallback(
    (nextPage: number) => {
      if (nextPage < 1 || nextPage === logsState.page) {
        return;
      }
      dispatch(setPage(nextPage));
      void dispatch(fetchLogs({ page: nextPage }));
    },
    [dispatch, logsState.page]
  );

  const handlePageSizeChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const nextSize = Number(event.target.value);
      if (!Number.isFinite(nextSize) || nextSize <= 0) {
        return;
      }
      dispatch(setPageSize(nextSize));
      void dispatch(fetchLogs({ page: 1, pageSize: nextSize }));
    },
    [dispatch]
  );

  const handleStartChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;
      setStartInput(nextValue);
      const iso = fromInputValue(nextValue);
      dispatch(setDateRange({ start: iso, end: logsState.filters.end }));
      void dispatch(fetchLogs({ page: 1 }));
    },
    [dispatch, logsState.filters.end]
  );

  const handleEndChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const nextValue = event.target.value;
      setEndInput(nextValue);
      const iso = fromInputValue(nextValue);
      dispatch(setDateRange({ start: logsState.filters.start, end: iso }));
      void dispatch(fetchLogs({ page: 1 }));
    },
    [dispatch, logsState.filters.start]
  );

  const handleResetFilters = useCallback(() => {
    dispatch(resetFilters());
    setSearchInput('');
    setStartInput('');
    setEndInput('');
    void dispatch(fetchLogs({ page: 1 }));
  }, [dispatch]);

  const isLoading = logsState.status === 'loading';
  const streamStatusLabel = useMemo(() => {
    switch (logsState.streamStatus) {
      case 'polling':
        return '检查更新中…';
      case 'active':
        return '自动刷新已开启';
      case 'failed':
        return logsState.streamError ? `实时更新失败：${logsState.streamError}` : '实时更新失败';
      default:
        return '待命';
    }
  }, [logsState.streamStatus, logsState.streamError]);

  return (
    <div className={layoutStyles.page}>
      <PageHeader
        title="系统日志"
        description="查询运行日志、过滤关键事件并追踪请求上下文。"
        actions={[
          {
            label: isLoading ? '刷新中…' : '刷新数据',
            variant: 'outline',
            onClick: handleRefresh,
            disabled: isLoading
          }
        ]}
      />

      <div className={styles.pageContent}>
        <section className={styles.filtersPanel}>
          <div className={styles.filterRow}>
            <div className={styles.filterField}>
              <label className={styles.filterLabel} htmlFor="startTime">
                起始时间
              </label>
              <input
                id="startTime"
                type="datetime-local"
                className={styles.input}
                value={startInput}
                onChange={handleStartChange}
              />
            </div>
            <div className={styles.filterField}>
              <label className={styles.filterLabel} htmlFor="endTime">
                结束时间
              </label>
              <input
                id="endTime"
                type="datetime-local"
                className={styles.input}
                value={endInput}
                onChange={handleEndChange}
              />
            </div>
            <div className={styles.filterField}>
              <label className={styles.filterLabel} htmlFor="searchText">
                关键字
              </label>
              <div className={styles.searchRow}>
                <input
                  id="searchText"
                  type="text"
                  className={styles.input}
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="模块、请求 ID、关键字…"
                />
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={handleApplySearch}
                  disabled={isLoading}
                >
                  应用
                </button>
              </div>
            </div>
          </div>

          <div className={styles.levelsRow}>
            <span className={styles.filterLabel}>日志级别</span>
            <div className={styles.levelChips}>
              {levelOptions.map((level) => {
                const active = logsState.filters.levels.includes(level);
                const className = active ? styles.levelChipActive : styles.levelChip;
                return (
                  <button
                    type="button"
                    key={level}
                    className={className}
                    onClick={() => toggleLevel(level)}
                  >
                    {level}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              className={styles.resetButton}
              onClick={handleResetFilters}
              disabled={isLoading}
            >
              重置
            </button>
          </div>

          {logsState.error ? (
            <div className={styles.errorBanner}>{logsState.error}</div>
          ) : null}
          {logsState.streamStatus === 'failed' && logsState.streamError && logsState.status !== 'failed' ? (
            <div className={styles.warningBanner}>{logsState.streamError}</div>
          ) : null}

          <div className={styles.metaGrid}>
            <div className={styles.metaCard}>
              <span className={styles.metaLabel}>日志文件</span>
              <span
                className={styles.metaValue}
                title={logsState.sourcePaths.length > 0 ? logsState.sourcePaths.join('\n') : undefined}
              >
                {logsState.sourcePaths.length > 0
                  ? `${logsState.sourcePaths.length} 个文件`
                  : logsState.sourcePath ?? '未配置'}
              </span>
              {logsState.sourcePaths.length > 0 ? (
                <span className={styles.metaHint}>
                  {logsState.sourcePaths
                    .map((path) => {
                      const parts = path.split(/[\\/]/);
                      return parts[parts.length - 1] || path;
                    })
                    .join(' / ')}
                </span>
              ) : null}
            </div>
            <div className={styles.metaCard}>
              <span className={styles.metaLabel}>文件更新时间</span>
              <span className={styles.metaValue}>{formatTimestamp(logsState.sourceUpdatedAt)}</span>
            </div>
            <div className={styles.metaCard}>
              <span className={styles.metaLabel}>总条目</span>
              <span className={styles.metaValue}>{logsState.total}</span>
            </div>
            <div className={styles.metaCard}>
              <span className={styles.metaLabel}>可选级别</span>
              <span className={styles.metaValue}>
                {logsState.availableLevels.length > 0
                  ? logsState.availableLevels.join(' / ')
                  : '—'}
              </span>
            </div>
            <div className={styles.metaCard}>
              <span className={styles.metaLabel}>实时状态</span>
              <span className={styles.metaValue}>{streamStatusLabel}</span>
              {logsState.streamStatus === 'active' && logsState.generatedAt ? (
                <span className={styles.metaHint}>
                  最近同步：{formatTimestamp(logsState.generatedAt)}
                </span>
              ) : null}
            </div>
          </div>
        </section>

        <section className={styles.tableSection}>
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>级别</th>
                  <th>日志内容</th>
                  <th>模块</th>
                  <th>请求 ID</th>
                  <th>上下文</th>
                </tr>
              </thead>
              <tbody>
                {logsState.entries.length === 0 && !isLoading ? (
                  <tr>
                    <td colSpan={6} className={styles.emptyCell}>
                      暂无日志记录，调整筛选条件后重试。
                    </td>
                  </tr>
                ) : null}
                {logsState.entries.map((entry) => {
                  const level = entry.level.toUpperCase();
                  const badgeClass = levelClassMap[level] ?? styles.levelDefault;
                  return (
                    <tr key={entry.sequence}>
                      <td>{formatTimestamp(entry.timestamp)}</td>
                      <td>
                        <span className={`${styles.levelBadge} ${badgeClass}`}>{level}</span>
                      </td>
                      <td className={styles.messageCell}>{entry.message}</td>
                      <td>{entry.logger ?? '—'}</td>
                      <td>{entry.requestId ?? '—'}</td>
                      <td>{renderContext(entry)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.paginationBar}>
            <div className={styles.paginationInfo}>
              第 {logsState.page} / {totalPages} 页 · 每页
              <select
                className={styles.pageSizeSelect}
                value={logsState.pageSize}
                onChange={handlePageSizeChange}
              >
                {[25, 50, 100, 200].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              条 · 共 {logsState.total} 条
            </div>
            <div className={styles.paginationControls}>
              <button
                type="button"
                className={styles.pageButton}
                onClick={() => handlePageChange(logsState.page - 1)}
                disabled={logsState.page <= 1 || isLoading}
              >
                上一页
              </button>
              <button
                type="button"
                className={styles.pageButton}
                onClick={() => handlePageChange(logsState.page + 1)}
                disabled={isLoading || (!logsState.hasNext && logsState.page >= totalPages)}
              >
                下一页
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default LogsPage;
