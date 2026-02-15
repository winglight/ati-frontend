import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react';
import clsx from 'clsx';
import Modal from '@components/modals/Modal';
import styles from './PnLCalendarPage.module.css';
import type { TradeLogPayload, TradeLogRecord, TradeLogType } from '@services/tradeLogsApi';
import { useTranslation } from '@i18n';

interface LogDefaults {
  date: string;
  tradesCount: number;
  overallFeeling: string;
  associatedTrades: string[];
}

interface WeeklyDefaults {
  associatedTrades: string[];
}

interface LogModalProps {
  open: boolean;
  mode: 'create' | 'view' | 'edit';
  log: TradeLogRecord | null;
  date: string | null;
  dailyDefaults: LogDefaults;
  weeklyDefaults: WeeklyDefaults;
  onClose: () => void;
  onSave: (payload: TradeLogPayload, logId?: number) => void;
  onEdit: () => void;
}

interface LogFormState {
  date: string;
  type: TradeLogType;
  tradesCount: string;
  overallFeeling: string;
  factRecord: string;
  learningPoints: string;
  improvementDirection: string;
  selfAffirmation: string;
  associatedTrades: string;
  weeklyTotalTrades: string;
  weeklyPnlResult: string;
  weeklyMaxWin: string;
  weeklyMaxLoss: string;
  weeklyWinRate: string;
  followsDailyLimit: boolean | null;
  successPlannedTrades: string;
  mistakeViolatedPlans: string;
  mistakeEmotionalFactors: string;
  nextGoodHabit: string;
  nextMistakeToAvoid: string;
  nextSpecificActions: string;
  weeklyAffirmation: string;
}

const formatAssociatedTrades = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(', ');
  }
  if (value && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (_error) {
      return '';
    }
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
};

const parseAssociatedTrades = (value: string): string[] | null => {
  const parts = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return parts.length ? parts : null;
};

const formatMultiSelect = (value: unknown): string => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join('\n');
  }
  if (typeof value === 'string') {
    return value;
  }
  return '';
};

const parseMultiSelect = (value: string): string[] | null => {
  const parts = value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  return parts.length ? parts : null;
};

const resolveNumber = (value: string): number | null => {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveInputValue = (value: number | string | null | undefined): string => {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
};

const getDefaultDate = (value: string | null): string => {
  if (value) {
    return value;
  }
  return new Date().toISOString().slice(0, 10);
};

const getInitialFormState = (
  log: TradeLogRecord | null,
  date: string | null,
  dailyDefaults: LogDefaults,
  weeklyDefaults: WeeklyDefaults
): LogFormState => {
  const baseType = log?.type ?? 'daily';
  const baseDate = log?.date ?? getDefaultDate(date ?? dailyDefaults.date);

  return {
    date: baseDate,
    type: baseType,
    tradesCount: resolveInputValue(log?.trades_count ?? dailyDefaults.tradesCount),
    overallFeeling: log?.overall_feeling ?? dailyDefaults.overallFeeling,
    factRecord: log?.fact_record ?? '',
    learningPoints: log?.learning_points ?? '',
    improvementDirection: log?.improvement_direction ?? '',
    selfAffirmation: log?.self_affirmation ?? '',
    associatedTrades: formatAssociatedTrades(
      log?.associated_trades ??
        (baseType === 'weekly' ? weeklyDefaults.associatedTrades : dailyDefaults.associatedTrades)
    ),
    weeklyTotalTrades: resolveInputValue(log?.weekly_total_trades),
    weeklyPnlResult: resolveInputValue(log?.weekly_pnl_result),
    weeklyMaxWin: resolveInputValue(log?.weekly_max_win),
    weeklyMaxLoss: resolveInputValue(log?.weekly_max_loss),
    weeklyWinRate: resolveInputValue(log?.weekly_win_rate),
    followsDailyLimit: log?.follows_daily_limit ?? null,
    successPlannedTrades: formatMultiSelect(log?.success_planned_trades),
    mistakeViolatedPlans: formatMultiSelect(log?.mistake_violated_plans),
    mistakeEmotionalFactors: formatMultiSelect(log?.mistake_emotional_factors),
    nextGoodHabit: log?.next_good_habit ?? '',
    nextMistakeToAvoid: log?.next_mistake_to_avoid ?? '',
    nextSpecificActions: log?.next_specific_actions ?? '',
    weeklyAffirmation: log?.weekly_affirmation ?? ''
  };
};

function LogModal({
  open,
  mode,
  log,
  date,
  dailyDefaults,
  weeklyDefaults,
  onClose,
  onSave,
  onEdit
}: LogModalProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<LogFormState>(() =>
    getInitialFormState(log, date, dailyDefaults, weeklyDefaults)
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setForm(getInitialFormState(log, date, dailyDefaults, weeklyDefaults));
  }, [open, mode, log, date, dailyDefaults, weeklyDefaults]);

  const readOnly = mode === 'view';
  const isWeekly = form.type === 'weekly';
  const modalTitle = mode === 'create' ? t('pnl_calendar.log_modal.create_title') : t('pnl_calendar.log_modal.title');
  const modalSubtitle = useMemo(() => {
    if (mode === 'create') {
      return t('pnl_calendar.log_modal.create_subtitle');
    }
    return log
      ? t('pnl_calendar.log_modal.subtitle_with_date', {
          date: log.date,
          type: log.type === 'weekly' ? t('pnl_calendar.logs.type_weekly') : t('pnl_calendar.logs.type_daily')
        })
      : undefined;
  }, [log, mode, t]);

  const handleFieldChange = (key: keyof LogFormState) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleTypeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextType = event.target.value as TradeLogType;
    setForm((prev) => {
      const associatedTrades = formatAssociatedTrades(
        nextType === 'weekly' ? weeklyDefaults.associatedTrades : dailyDefaults.associatedTrades
      );
      const shouldUpdateAssociated = mode === 'create' || prev.associatedTrades.trim() === '';
      return {
        ...prev,
        type: nextType,
        tradesCount: nextType === 'daily' ? resolveInputValue(dailyDefaults.tradesCount) : prev.tradesCount,
        overallFeeling: nextType === 'daily' ? dailyDefaults.overallFeeling : prev.overallFeeling,
        associatedTrades: shouldUpdateAssociated ? associatedTrades : prev.associatedTrades
      };
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (readOnly) {
      return;
    }

    const payload: TradeLogPayload = {
      date: form.date,
      type: form.type,
      associated_trades: parseAssociatedTrades(form.associatedTrades)
    };

    if (form.type === 'daily') {
      payload.trades_count = resolveNumber(form.tradesCount);
      payload.overall_feeling = form.overallFeeling || null;
      payload.fact_record = form.factRecord || null;
      payload.learning_points = form.learningPoints || null;
      payload.improvement_direction = form.improvementDirection || null;
      payload.self_affirmation = form.selfAffirmation || null;
    } else {
      payload.success_planned_trades = parseMultiSelect(form.successPlannedTrades);
      payload.mistake_violated_plans = parseMultiSelect(form.mistakeViolatedPlans);
      payload.mistake_emotional_factors = parseMultiSelect(form.mistakeEmotionalFactors);
      payload.next_good_habit = form.nextGoodHabit || null;
      payload.next_mistake_to_avoid = form.nextMistakeToAvoid || null;
      payload.next_specific_actions = form.nextSpecificActions || null;
      payload.weekly_affirmation = form.weeklyAffirmation || null;
    }

    onSave(payload, log?.id);
  };

  const renderWeeklyMetrics = () => (
    <div className={styles.logMetrics}>
      <div className={styles.logMetricItem}>
        <span>{t('pnl_calendar.log_modal.weekly_total_trades')}</span>
        <strong>{form.weeklyTotalTrades || t('pnl_calendar.common.empty')}</strong>
      </div>
      <div className={styles.logMetricItem}>
        <span>{t('pnl_calendar.log_modal.weekly_pnl')}</span>
        <strong>{form.weeklyPnlResult || t('pnl_calendar.common.empty')}</strong>
      </div>
      <div className={styles.logMetricItem}>
        <span>{t('pnl_calendar.log_modal.weekly_max_win')}</span>
        <strong>{form.weeklyMaxWin || t('pnl_calendar.common.empty')}</strong>
      </div>
      <div className={styles.logMetricItem}>
        <span>{t('pnl_calendar.log_modal.weekly_max_loss')}</span>
        <strong>{form.weeklyMaxLoss || t('pnl_calendar.common.empty')}</strong>
      </div>
      <div className={styles.logMetricItem}>
        <span>{t('pnl_calendar.log_modal.weekly_win_rate')}</span>
        <strong>
          {form.weeklyWinRate
            ? t('pnl_calendar.common.percent', { value: (Number(form.weeklyWinRate) * 100).toFixed(1) })
            : t('pnl_calendar.common.empty')}
        </strong>
      </div>
      <div className={styles.logMetricItem}>
        <span>{t('pnl_calendar.log_modal.follows_daily_limit')}</span>
        <strong>
          {form.followsDailyLimit === null
            ? t('pnl_calendar.common.empty')
            : form.followsDailyLimit
            ? t('pnl_calendar.common.yes')
            : t('pnl_calendar.common.no')}
        </strong>
      </div>
    </div>
  );

  return (
    <Modal
      open={open}
      title={modalTitle}
      subtitle={modalSubtitle}
      onClose={onClose}
      size="lg"
    >
      <form className={styles.logForm} onSubmit={handleSubmit}>
        <div className={styles.logFormRow}>
          <div className={styles.logFormGroup}>
            <label className={styles.logFormLabel} htmlFor="trade-log-date">
              {t('pnl_calendar.log_modal.fields.date')}
            </label>
            <input
              id="trade-log-date"
              type="date"
              className={styles.logFormInput}
              value={form.date}
              onChange={handleFieldChange('date')}
              disabled={readOnly}
            />
          </div>
          <div className={styles.logFormGroup}>
            <label className={styles.logFormLabel} htmlFor="trade-log-type">
              {t('pnl_calendar.log_modal.fields.type')}
            </label>
            <select
              id="trade-log-type"
              className={styles.logFormSelect}
              value={form.type}
              onChange={handleTypeChange}
              disabled={readOnly}
            >
              <option value="daily">{t('pnl_calendar.logs.type_daily')}</option>
              <option value="weekly">{t('pnl_calendar.logs.type_weekly')}</option>
            </select>
          </div>
          <div className={styles.logFormGroup}>
            <label className={styles.logFormLabel} htmlFor="trade-log-associated">
              {t('pnl_calendar.log_modal.fields.associated_trades')}
            </label>
            <input
              id="trade-log-associated"
              type="text"
              className={styles.logFormInput}
              value={form.associatedTrades}
              onChange={handleFieldChange('associatedTrades')}
              placeholder={t('pnl_calendar.log_modal.placeholders.comma_split')}
              disabled={readOnly}
            />
            <span className={styles.logFormHint}>{t('pnl_calendar.log_modal.hints.associated_trades')}</span>
          </div>
        </div>

        {isWeekly ? (
          <div className={styles.logSection}>
            <h4 className={styles.logSectionTitle}>{t('pnl_calendar.log_modal.weekly_section')}</h4>
            {renderWeeklyMetrics()}
            <div className={styles.logFormGrid}>
              <div className={styles.logFormGroup}>
                <label className={styles.logFormLabel} htmlFor="trade-log-success">
                  {t('pnl_calendar.log_modal.weekly.success_planned')}
                </label>
                <textarea
                  id="trade-log-success"
                  className={styles.logFormTextarea}
                  value={form.successPlannedTrades}
                  onChange={handleFieldChange('successPlannedTrades')}
                  placeholder={t('pnl_calendar.log_modal.placeholders.multi_line')}
                  disabled={readOnly}
                />
              </div>
              <div className={styles.logFormGroup}>
                <label className={styles.logFormLabel} htmlFor="trade-log-violated">
                  {t('pnl_calendar.log_modal.weekly.mistake_violated')}
                </label>
                <textarea
                  id="trade-log-violated"
                  className={styles.logFormTextarea}
                  value={form.mistakeViolatedPlans}
                  onChange={handleFieldChange('mistakeViolatedPlans')}
                  placeholder={t('pnl_calendar.log_modal.placeholders.multi_line')}
                  disabled={readOnly}
                />
              </div>
              <div className={styles.logFormGroup}>
                <label className={styles.logFormLabel} htmlFor="trade-log-emotional">
                  {t('pnl_calendar.log_modal.weekly.mistake_emotional')}
                </label>
                <textarea
                  id="trade-log-emotional"
                  className={styles.logFormTextarea}
                  value={form.mistakeEmotionalFactors}
                  onChange={handleFieldChange('mistakeEmotionalFactors')}
                  placeholder={t('pnl_calendar.log_modal.placeholders.multi_line')}
                  disabled={readOnly}
                />
              </div>
              <div className={styles.logFormGroup}>
                <label className={styles.logFormLabel} htmlFor="trade-log-good-habit">
                  {t('pnl_calendar.log_modal.weekly.next_good_habit')}
                </label>
                <input
                  id="trade-log-good-habit"
                  type="text"
                  className={styles.logFormInput}
                  value={form.nextGoodHabit}
                  onChange={handleFieldChange('nextGoodHabit')}
                  disabled={readOnly}
                />
              </div>
              <div className={styles.logFormGroup}>
                <label className={styles.logFormLabel} htmlFor="trade-log-avoid">
                  {t('pnl_calendar.log_modal.weekly.next_mistake_avoid')}
                </label>
                <input
                  id="trade-log-avoid"
                  type="text"
                  className={styles.logFormInput}
                  value={form.nextMistakeToAvoid}
                  onChange={handleFieldChange('nextMistakeToAvoid')}
                  disabled={readOnly}
                />
              </div>
            </div>
            <div className={styles.logFormGroup}>
              <label className={styles.logFormLabel} htmlFor="trade-log-actions">
                {t('pnl_calendar.log_modal.weekly.next_actions')}
              </label>
              <textarea
                id="trade-log-actions"
                className={styles.logFormTextarea}
                value={form.nextSpecificActions}
                onChange={handleFieldChange('nextSpecificActions')}
                disabled={readOnly}
              />
            </div>
            <div className={styles.logFormGroup}>
              <label className={styles.logFormLabel} htmlFor="trade-log-weekly-affirmation">
                {t('pnl_calendar.log_modal.weekly.affirmation')}
              </label>
              <textarea
                id="trade-log-weekly-affirmation"
                className={styles.logFormTextarea}
                value={form.weeklyAffirmation}
                onChange={handleFieldChange('weeklyAffirmation')}
                disabled={readOnly}
              />
            </div>
          </div>
        ) : (
          <div className={styles.logSection}>
            <h4 className={styles.logSectionTitle}>{t('pnl_calendar.log_modal.daily_section')}</h4>
            <div className={styles.logFormGrid}>
              <div className={styles.logFormGroup}>
                <label className={styles.logFormLabel} htmlFor="trade-log-trades-count">
                  {t('pnl_calendar.log_modal.daily.trades_count')}
                </label>
                <input
                  id="trade-log-trades-count"
                  type="number"
                  min={0}
                  className={styles.logFormInput}
                  value={form.tradesCount}
                  onChange={handleFieldChange('tradesCount')}
                  disabled={readOnly}
                />
              </div>
              <div className={styles.logFormGroup}>
                <label className={styles.logFormLabel} htmlFor="trade-log-feeling">
                  {t('pnl_calendar.log_modal.daily.overall_feeling')}
                </label>
                <input
                  id="trade-log-feeling"
                  type="text"
                  className={styles.logFormInput}
                  value={form.overallFeeling}
                  onChange={handleFieldChange('overallFeeling')}
                  disabled={readOnly}
                />
              </div>
            </div>
            <div className={styles.logFormGroup}>
              <label className={styles.logFormLabel} htmlFor="trade-log-fact">
                {t('pnl_calendar.log_modal.daily.fact_record')}
              </label>
              <textarea
                id="trade-log-fact"
                className={styles.logFormTextarea}
                value={form.factRecord}
                onChange={handleFieldChange('factRecord')}
                disabled={readOnly}
              />
            </div>
            <div className={styles.logFormGroup}>
              <label className={styles.logFormLabel} htmlFor="trade-log-learning">
                {t('pnl_calendar.log_modal.daily.learning_points')}
              </label>
              <textarea
                id="trade-log-learning"
                className={styles.logFormTextarea}
                value={form.learningPoints}
                onChange={handleFieldChange('learningPoints')}
                disabled={readOnly}
              />
            </div>
            <div className={styles.logFormGroup}>
              <label className={styles.logFormLabel} htmlFor="trade-log-improvement">
                {t('pnl_calendar.log_modal.daily.improvement_direction')}
              </label>
              <textarea
                id="trade-log-improvement"
                className={styles.logFormTextarea}
                value={form.improvementDirection}
                onChange={handleFieldChange('improvementDirection')}
                disabled={readOnly}
              />
            </div>
            <div className={styles.logFormGroup}>
              <label className={styles.logFormLabel} htmlFor="trade-log-affirmation">
                {t('pnl_calendar.log_modal.daily.self_affirmation')}
              </label>
              <textarea
                id="trade-log-affirmation"
                className={styles.logFormTextarea}
                value={form.selfAffirmation}
                onChange={handleFieldChange('selfAffirmation')}
                disabled={readOnly}
              />
            </div>
          </div>
        )}

        <div className={styles.logFormActions}>
          {mode === 'view' ? (
            <>
              <button type="button" className={styles.logSecondaryButton} onClick={onEdit}>
                {t('pnl_calendar.log_modal.actions.edit')}
              </button>
              <button type="button" className={styles.logPrimaryButton} onClick={onClose}>
                {t('pnl_calendar.log_modal.actions.close')}
              </button>
            </>
          ) : (
            <>
              <button
                type="submit"
                className={clsx(styles.logPrimaryButton, {
                  [styles.logPrimaryButtonDisabled]: readOnly
                })}
                disabled={readOnly}
              >
                {t('pnl_calendar.log_modal.actions.save')}
              </button>
              <button type="button" className={styles.logSecondaryButton} onClick={onClose}>
                {t('pnl_calendar.log_modal.actions.cancel')}
              </button>
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}

export default LogModal;
