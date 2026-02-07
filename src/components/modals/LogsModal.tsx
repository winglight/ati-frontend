import { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from './Modal';
import styles from './LogsModal.module.css';
import { DEFAULT_LOG_LEVELS, expandLevels, sortLevels } from '../../utils/logLevels';
import { useAppDispatch, useAppSelector } from '@store/hooks';
import { fetchLogs, pollLogs } from '@store/thunks/logs';
import { useTranslation } from '@i18n';
import {
  resetFilters,
  setAutoTail,
  setDateRange,
  setLevels,
  setModule,
  setPage,
  setRange,
  setRequestId,
  setSearch
} from '@store/slices/logsSlice';

interface LogsModalProps {
  open: boolean;
  onClose: () => void;
}


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
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}T${pad(
    parsed.getHours()
  )}:${pad(parsed.getMinutes())}`;
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

const normalize = (value: string | null | undefined): string => value?.trim() ?? '';

const resolveRange = (
  range: 'today' | 'week' | 'custom',
  customStart: string,
  customEnd: string
): { start: string | null; end: string | null } => {
  if (range === 'custom') {
    return { start: fromInputValue(customStart), end: fromInputValue(customEnd) };
  }
  const now = new Date();
  const end = now.toISOString();
  const startDate = new Date(now);
  if (range === 'today') {
    startDate.setHours(0, 0, 0, 0);
  } else {
    startDate.setDate(now.getDate() - 6);
    startDate.setHours(0, 0, 0, 0);
  }
  return { start: startDate.toISOString(), end };
};

function LogsModal({ open, onClose }: LogsModalProps) {
  const dispatch = useAppDispatch();
  const logsState = useAppSelector((state) => state.logs);
  const { t } = useTranslation();
  const [moduleSelect, setModuleSelect] = useState(logsState.filters.module);
  const [rangeSelect, setRangeSelect] = useState(logsState.filters.range);
  const [levelSelect, setLevelSelect] = useState(() => logsState.filters.levels[0] ?? 'all');
  const [requestInput, setRequestInput] = useState(logsState.filters.requestId);
  const [searchInput, setSearchInput] = useState(logsState.filters.search);
  const [customStart, setCustomStart] = useState(toInputValue(logsState.filters.start));
  const [customEnd, setCustomEnd] = useState(toInputValue(logsState.filters.end));
  const logStreamRef = useRef<HTMLDivElement | null>(null);

  const filtersSnapshotRef = useRef<{
    moduleSelect: string;
    rangeSelect: 'today' | 'week' | 'custom';
    levelSelect: string;
    requestInput: string;
    searchInput: string;
    customStart: string;
    customEnd: string;
  }>({
    moduleSelect,
    rangeSelect,
    levelSelect,
    requestInput,
    searchInput,
    customStart,
    customEnd
  });

  filtersSnapshotRef.current = {
    moduleSelect,
    rangeSelect,
    levelSelect,
    requestInput,
    searchInput,
    customStart,
    customEnd
  };

  useEffect(() => {
    if (!open) {
      return;
    }
    if (logsState.status === 'idle') {
      void dispatch(fetchLogs(undefined));
    }
  }, [dispatch, logsState.status, open]);

  useEffect(() => {
    if (!open || !logsState.autoTail) {
      return;
    }
    const interval = window.setInterval(() => {
      void dispatch(pollLogs());
    }, 5000);
    return () => {
      window.clearInterval(interval);
    };
  }, [dispatch, logsState.autoTail, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setModuleSelect(logsState.filters.module);
    setRangeSelect(logsState.filters.range);
    setLevelSelect(logsState.filters.levels[0] ?? 'all');
    setRequestInput(logsState.filters.requestId);
    setSearchInput(logsState.filters.search);
    setCustomStart(toInputValue(logsState.filters.start));
    setCustomEnd(toInputValue(logsState.filters.end));
  }, [
    logsState.filters.end,
    logsState.filters.levels,
    logsState.filters.module,
    logsState.filters.range,
    logsState.filters.requestId,
    logsState.filters.search,
    logsState.filters.start,
    open
  ]);

  const levelOptions = useMemo(() => {
    const ordered = sortLevels([...DEFAULT_LOG_LEVELS, ...logsState.availableLevels]);
    return ['all', ...ordered];
  }, [logsState.availableLevels]);

  const rangeOptions = useMemo(
    () => [
      { value: 'today' as const, label: t('logs.modal.filters.range_options.today') },
      { value: 'week' as const, label: t('logs.modal.filters.range_options.week') },
      { value: 'custom' as const, label: t('logs.modal.filters.range_options.custom') }
    ],
    [t]
  );

  const moduleOptions = useMemo(() => {
    const modules = logsState.availableModules.length > 0 ? logsState.availableModules : [];
    const unique = new Set<string>();
    modules.forEach((module) => {
      if (module && module.trim()) {
        unique.add(module.trim());
      }
    });
    const currentModule = logsState.filters.module;
    if (currentModule && currentModule !== 'all') {
      unique.add(currentModule);
    }
    if (moduleSelect && moduleSelect !== 'all') {
      unique.add(moduleSelect);
    }
    const sortedWithCurrent = Array.from(unique.values()).sort((a, b) => a.localeCompare(b));
    return ['all', ...sortedWithCurrent];
  }, [logsState.availableModules, logsState.filters.module, moduleSelect]);

  const totalPages = useMemo(() => {
    if (logsState.pageSize <= 0) {
      return 1;
    }
    const computed = Math.ceil(logsState.total / logsState.pageSize);
    if (computed > 0) {
      return computed;
    }
    return logsState.hasNext ? logsState.page + 1 : Math.max(logsState.page, 1);
  }, [logsState.hasNext, logsState.page, logsState.pageSize, logsState.total]);

  const filteredEntries = useMemo(() => {
    const moduleTokens =
      logsState.filters.module && logsState.filters.module !== 'all'
        ? logsState.filters.module
            .split(',')
            .map((token) => token.trim().toLowerCase())
            .filter(Boolean)
        : [];
    const requestTerm = normalize(logsState.filters.requestId).toLowerCase();
    const searchTerm = normalize(logsState.filters.search).toLowerCase();
    const levelFilter = expandLevels(logsState.filters.levels);

    return logsState.entries.filter((entry) => {
      if (moduleTokens.length > 0) {
        const logger = normalize(entry.logger).toLowerCase();
        const moduleMatch = moduleTokens.some((token) => logger.includes(token));
        if (!moduleMatch) {
          return false;
        }
      }
      if (requestTerm) {
        const request = normalize(entry.requestId).toLowerCase();
        if (!request.includes(requestTerm)) {
          return false;
        }
      }
      if (searchTerm) {
        const haystack = [entry.message, entry.raw, entry.logger, entry.requestId]
          .map((item) => normalize(item).toLowerCase())
          .join('\n');
        if (!haystack.includes(searchTerm)) {
          return false;
        }
      }
      if (levelFilter.length > 0) {
        const level = (entry.level ?? 'INFO').toUpperCase();
        if (!levelFilter.includes(level)) {
          return false;
        }
      }
      return true;
    });
  }, [logsState.entries, logsState.filters]);

  const sortedEntries = useMemo(
    () => [...filteredEntries].sort((a, b) => a.sequence - b.sequence),
    [filteredEntries]
  );

  useEffect(() => {
    if (!open || !logsState.autoTail) {
      return;
    }
    const container = logStreamRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [sortedEntries, logsState.autoTail, open]);

  const statusText = useMemo(() => {
    if (logsState.streamStatus === 'failed') {
      return logsState.streamError ?? t('logs.modal.status.failed');
    }
    if (logsState.streamStatus === 'polling') {
      return t('logs.modal.status.polling');
    }
    if (logsState.streamStatus === 'active') {
      return t('logs.modal.status.active');
    }
    if (logsState.status === 'loading') {
      return t('logs.modal.status.loading');
    }
    return t('logs.modal.status.ready');
  }, [logsState.status, logsState.streamError, logsState.streamStatus, t]);

  const loading = logsState.status === 'loading';

  const handleApplyFilters = useCallback(() => {
    const {
      searchInput: currentSearch,
      requestInput: currentRequest,
      rangeSelect: currentRange,
      customStart: currentCustomStart,
      customEnd: currentCustomEnd,
      levelSelect: currentLevel,
      moduleSelect: currentModule
    } = filtersSnapshotRef.current;

    const trimmedSearch = currentSearch.trim();
    const trimmedRequest = currentRequest.trim();
    const { start, end } = resolveRange(currentRange, currentCustomStart, currentCustomEnd);
    const baseLevels = currentLevel === 'all' ? [] : [currentLevel.toUpperCase()];
    const expandedLevels = expandLevels(baseLevels);
    const selectedModule = currentModule || 'all';

    dispatch(setRange(currentRange));
    dispatch(setModule(selectedModule));
    dispatch(setRequestId(trimmedRequest));
    dispatch(setSearch(trimmedSearch));
    dispatch(setDateRange({ start, end }));
    dispatch(setLevels(baseLevels));
    dispatch(setPage(1));
    void dispatch(
      fetchLogs({
        page: 1,
        start: start ?? undefined,
        end: end ?? undefined,
        levels: expandedLevels.length ? expandedLevels : undefined,
        search: trimmedSearch || undefined,
        module: selectedModule
      })
    );
  }, [dispatch]);

  const applyDebounceRef = useRef<number | null>(null);

  const scheduleApply = useCallback(
    (updater: () => void) => {
      updater();
      if (applyDebounceRef.current !== null) {
        window.clearTimeout(applyDebounceRef.current);
      }
      applyDebounceRef.current = window.setTimeout(() => {
        applyDebounceRef.current = null;
        handleApplyFilters();
      }, 350);
    },
    [handleApplyFilters]
  );

  useEffect(() => {
    return () => {
      if (applyDebounceRef.current !== null) {
        window.clearTimeout(applyDebounceRef.current);
      }
    };
  }, []);

  const handleReset = () => {
    if (applyDebounceRef.current !== null) {
      window.clearTimeout(applyDebounceRef.current);
      applyDebounceRef.current = null;
    }
    dispatch(resetFilters());
    dispatch(setAutoTail(true));
    setModuleSelect('all');
    setRangeSelect('today');
    setLevelSelect('all');
    setRequestInput('');
    setSearchInput('');
    setCustomStart('');
    setCustomEnd('');
    void dispatch(fetchLogs({ page: 1 }));
  };

  const handlePageChange = (next: number) => {
    if (next < 1 || next === logsState.page) {
      return;
    }
    dispatch(setPage(next));
    if (next !== 1 && logsState.autoTail) {
      dispatch(setAutoTail(false));
    }
    void dispatch(fetchLogs({ page: next }));
  };

  const handleToggleTail = (event: ChangeEvent<HTMLInputElement>) => {
    const enabled = event.target.checked;
    dispatch(setAutoTail(enabled));
    if (enabled) {
      void dispatch(pollLogs());
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('logs.modal.title')} size="lg">
      <div className={styles.container}>
        <div className={styles.controlSection}>
          <div className={styles.controlRow}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="logModule">
                {t('logs.modal.filters.module')}
              </label>
              <select
                id="logModule"
                className={styles.select}
                value={moduleSelect}
                onChange={(event) => scheduleApply(() => setModuleSelect(event.target.value))}
              >
                {moduleOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === 'all' ? t('logs.modal.filters.module_all') : option}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="logRange">
                {t('logs.modal.filters.range')}
              </label>
              <select
                id="logRange"
                className={styles.select}
                value={rangeSelect}
                onChange={(event) =>
                  scheduleApply(() => setRangeSelect(event.target.value as 'today' | 'week' | 'custom'))
                }
              >
                {rangeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="logLevel">
                {t('logs.modal.filters.level')}
              </label>
              <select
                id="logLevel"
                className={styles.select}
                value={levelSelect}
                onChange={(event) => scheduleApply(() => setLevelSelect(event.target.value))}
              >
                {levelOptions.map((level) => (
                  <option key={level} value={level}>
                    {level === 'all' ? t('logs.modal.filters.level_all') : level}
                  </option>
                ))}
              </select>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="logRequest">
                {t('logs.modal.filters.request')}
              </label>
              <input
                id="logRequest"
                className={styles.input}
                type="text"
                placeholder={t('logs.modal.placeholders.request')}
                value={requestInput}
                onChange={(event) => scheduleApply(() => setRequestInput(event.target.value))}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="logSearch">
                {t('logs.modal.filters.search')}
              </label>
              <input
                id="logSearch"
                className={styles.input}
                type="text"
                placeholder={t('logs.modal.placeholders.search')}
                value={searchInput}
                onChange={(event) => scheduleApply(() => setSearchInput(event.target.value))}
              />
            </div>
          </div>
          {rangeSelect === 'custom' ? (
            <div className={styles.controlRow}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="logStart">
                  {t('logs.modal.filters.custom_start')}
                </label>
                <input
                  id="logStart"
                  className={styles.input}
                  type="datetime-local"
                  value={customStart}
                  onChange={(event) => scheduleApply(() => setCustomStart(event.target.value))}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="logEnd">
                  {t('logs.modal.filters.custom_end')}
                </label>
                <input
                  id="logEnd"
                  className={styles.input}
                  type="datetime-local"
                  value={customEnd}
                  onChange={(event) => scheduleApply(() => setCustomEnd(event.target.value))}
                />
              </div>
            </div>
          ) : null}
          <div className={styles.actionsRow}>
            <button type="button" className={styles.secondaryButton} onClick={handleReset}>
              {t('logs.modal.actions.reset')}
            </button>
            <span className={styles.autoHint}>{t('logs.modal.hints.auto_refresh')}</span>
          </div>
        </div>
        <div className={styles.secondaryBar}>
          <div className={styles.pagination}>
            <button
              type="button"
              className={styles.pageButton}
              onClick={() => handlePageChange(logsState.page - 1)}
            >
              {t('logs.modal.pagination.prev')}
            </button>
            <button
              type="button"
              className={styles.pageButton}
              onClick={() => handlePageChange(logsState.page + 1)}
            >
              {t('logs.modal.pagination.next')}
            </button>
          </div>
          <label className={styles.tailToggle}>
            <input
              type="checkbox"
              checked={logsState.autoTail}
              onChange={handleToggleTail}
            />
            <span className={styles.tailLabel}>{t('logs.modal.tail.auto_follow')}</span>
          </label>
          <div className={styles.status}>{statusText}</div>
        </div>
        <div className={styles.logStream} ref={logStreamRef}>
          {sortedEntries.map((entry) => {
            const level = (entry.level ?? 'INFO').toUpperCase();
            return (
              <div
                key={entry.sequence}
                className={`${styles.logLine} ${styles[`level-${level.toLowerCase()}`] ?? ''}`.trim()}
              >
                <span className={styles.time}>{formatTimestamp(entry.timestamp)}</span>
                <span className={styles.level}>{level}</span>
                <span className={styles.logger}>{entry.logger ?? '—'}</span>
                {entry.requestId ? (
                  <span className={styles.request}>{entry.requestId}</span>
                ) : null}
                <span className={styles.message}>{entry.message || entry.raw || '—'}</span>
              </div>
            );
          })}
          {!sortedEntries.length && !loading ? (
            <div className={styles.empty}>{t('logs.modal.empty')}</div>
          ) : null}
          {loading ? <div className={styles.loading}>{t('logs.modal.loading')}</div> : null}
        </div>
        <div className={styles.metaRow}>
          <div className={styles.pageInfo}>
            {t('logs.modal.meta.page_info', { page: logsState.page, total: totalPages })}
          </div>
          <div className={styles.metaDetails}>
            {logsState.sourcePaths.length > 0 ? (
              <span title={logsState.sourcePaths.join('\n')}>
                {t('logs.modal.meta.source_files', { count: logsState.sourcePaths.length })}
              </span>
            ) : logsState.sourcePath ? (
              <span>{t('logs.modal.meta.source_path', { path: logsState.sourcePath })}</span>
            ) : null}
            {logsState.sourceUpdatedAt ? (
              <span>
                {t('logs.modal.meta.updated_prefix')}
                {formatTimestamp(logsState.sourceUpdatedAt)}
              </span>
            ) : null}
            {logsState.generatedAt ? (
              <span>
                {t('logs.modal.meta.snapshot_prefix')}
                {formatTimestamp(logsState.generatedAt)}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default LogsModal;
