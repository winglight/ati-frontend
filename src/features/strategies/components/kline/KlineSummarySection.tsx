import type {
  ChangeEvent,
  KeyboardEvent,
  RefObject
} from 'react';
import { useTranslation } from '@i18n';
import clsx from 'clsx';
import type { StrategyScheduleWindow } from '@features/dashboard/types';
import panelStyles from '../StrategyDetailPanel.module.css';
import styles from './KlineSummarySection.module.css';

interface KlineSummarySectionProps {
  summarySymbol: string;
  resolvedSymbol: string;
  isEditing: boolean;
  summarySaving: boolean;
  summaryMessage: string | null;
  summaryTone: 'info' | 'success' | 'error' | 'neutral';
  onStartEdit: () => void;
  onSymbolChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onSymbolBlur: () => void;
  onSymbolKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  symbolEditorRef: RefObject<HTMLInputElement>;
  canEditSymbol: boolean;
  scheduleWindows: StrategyScheduleWindow[];
  timezone: string;
  timezoneNotice?: string | null;
  timezoneOptions: Array<{ label: string; value: string }>;
  timezoneDraft: string;
  isTimezoneEditing: boolean;
  timezoneDisabled?: boolean;
  canEditTimezone?: boolean;
  onTimezoneStartEdit: () => void;
  onTimezoneChange: (value: string) => void;
  onTimezoneSave: () => void;
  onTimezoneCancel: () => void;
  timezoneSelectRef?: RefObject<HTMLSelectElement>;
  description: string;
  dataSourceLabel: string;
  intervalLabel?: string | null;
  lookbackLabel?: string | null;
  aggregationLabel?: string | null;
  intervalOptions: Array<{ label: string; value: string }>;
  lookbackOptions: Array<{ label: string; value: string }>;
  aggregationOptions: Array<{ label: string; value: string }>;
  intervalValue: string;
  lookbackValue: string;
  aggregationValue: string;
  isIntervalEditing: boolean;
  isLookbackEditing: boolean;
  isAggregationEditing: boolean;
  intervalDisabled?: boolean;
  lookbackDisabled?: boolean;
  aggregationDisabled?: boolean;
  onIntervalStartEdit: () => void;
  onLookbackStartEdit: () => void;
  onAggregationStartEdit: () => void;
  onIntervalChange: (value: string) => void;
  onLookbackChange: (value: string) => void;
  onAggregationChange: (value: string) => void;
  onIntervalSave: () => void;
  onLookbackSave: () => void;
  onAggregationSave: () => void;
  onIntervalCancel: () => void;
  onLookbackCancel: () => void;
  onAggregationCancel: () => void;
  canEditInterval?: boolean;
  canEditLookback?: boolean;
  canEditAggregation?: boolean;
  placeholder?: string;
  exitModeLabel?: string | null;
  exitModeOptions?: Array<{ label: string; value: string }>;
  exitModeValue?: string;
  isExitModeEditing?: boolean;
  exitModeDisabled?: boolean;
  canEditExitMode?: boolean;
  onExitModeStartEdit?: () => void;
  onExitModeChange?: (value: string) => void;
  onExitModeSave?: () => void;
  onExitModeCancel?: () => void;
  extraFields?: Array<{ label: string; value: string }>;
}

const toneClassNameMap: Record<string, string | undefined> = {
  success: panelStyles.statusSuccess,
  error: panelStyles.statusError
};

const wrapSingleValueChange = (handler?: (value: string) => void) => (value: string | string[]) => {
  if (typeof value === 'string' && handler) {
    handler(value);
  }
};

const KlineSummarySection = ({
  summarySymbol,
  resolvedSymbol,
  isEditing,
  summarySaving,
  summaryMessage,
  summaryTone,
  onStartEdit,
  onSymbolChange,
  onSymbolBlur,
  onSymbolKeyDown,
  symbolEditorRef,
  canEditSymbol,
  scheduleWindows,
  timezone,
  timezoneNotice = null,
  timezoneOptions,
  timezoneDraft,
  isTimezoneEditing,
  timezoneDisabled = false,
  canEditTimezone = true,
  onTimezoneStartEdit,
  onTimezoneChange,
  onTimezoneSave,
  onTimezoneCancel,
  timezoneSelectRef,
  description,
  dataSourceLabel,
  intervalLabel,
  lookbackLabel,
  aggregationLabel,
  intervalOptions,
  lookbackOptions,
  aggregationOptions,
  intervalValue,
  lookbackValue,
  aggregationValue,
  isIntervalEditing,
  isLookbackEditing,
  isAggregationEditing,
  intervalDisabled = false,
  lookbackDisabled = false,
  aggregationDisabled = false,
  onIntervalStartEdit,
  onLookbackStartEdit,
  onAggregationStartEdit,
  onIntervalChange,
  onLookbackChange,
  onAggregationChange,
  onIntervalSave,
  onLookbackSave,
  onAggregationSave,
  onIntervalCancel,
  onLookbackCancel,
  onAggregationCancel,
  canEditInterval = true,
  canEditLookback = true,
  canEditAggregation = true,
  placeholder = '例如：MNQ'
  ,
  exitModeLabel,
  exitModeOptions = [],
  exitModeValue = '',
  isExitModeEditing = false,
  exitModeDisabled = false,
  canEditExitMode = true,
  onExitModeStartEdit,
  onExitModeChange,
  onExitModeSave,
  onExitModeCancel,
  extraFields = []
}: KlineSummarySectionProps) => {
  const { t } = useTranslation();
  const scheduleHint =
    scheduleWindows.length > 0
      ? `${scheduleWindows[0]!.start} → ${scheduleWindows[0]!.end}`
      : t('strategies.kline.summary.fallback.default_all_day');

  const summaryToneClassName = summaryTone ? toneClassNameMap[summaryTone] : undefined;

  const renderEditableSelect = (
    props: {
      label: string;
      value: string | string[];
      options: Array<{ label: string; value: string }>;
      disabled: boolean;
      isEditing: boolean;
      canEdit: boolean;
      onStartEdit: () => void;
      onChange: (value: string | string[]) => void;
      onSave: () => void;
      onCancel: () => void;
      testId: string;
      displayValue: string | null | undefined;
      editorRef?: RefObject<HTMLSelectElement>;
      multiple?: boolean;
    }
  ) => {
    const {
      label,
      value,
      options,
      disabled,
      isEditing,
      canEdit,
      onStartEdit,
      onChange,
      onSave,
      onCancel,
      testId,
      displayValue,
      editorRef,
      multiple
    } = props;
    
    // Helper to handle multiple select change
    const handleMultiChange = (event: ChangeEvent<HTMLSelectElement>) => {
        const selected = Array.from(event.target.selectedOptions, option => option.value);
        onChange(selected);
    };

    return (
      <div className={styles.field}>
        <div className={panelStyles.detailLabel}>{label}</div>
        <div
          className={clsx(
            panelStyles.detailValue,
            canEdit && panelStyles.detailValueEditable,
            isEditing && panelStyles.detailValueEditing,
            !canEdit && styles.readonlyValue
          )}
          onDoubleClick={canEdit ? onStartEdit : undefined}
        >
          {isEditing ? (
            <select
              ref={editorRef}
              className={panelStyles.detailInlineInput}
              value={value}
              multiple={multiple}
              onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                  if (multiple) {
                      handleMultiChange(event);
                  } else {
                      onChange(event.target.value);
                  }
              }}
              onKeyDown={(event: KeyboardEvent<HTMLSelectElement>) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onSave();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  onCancel();
                }
              }}
              onBlur={onCancel}
              disabled={disabled}
              aria-label={label}
              data-testid={testId}
              style={multiple ? { height: 'auto', minHeight: '100px' } : undefined}
            >
              {options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            displayValue ?? t('common.unconfigured')
          )}
        </div>
      </div>
    );
  };

  return (
    <section className={clsx(panelStyles.sectionCard, styles.klineCard)}>
      <div className={panelStyles.sectionHeader}>{t('strategies.kline.summary.title')}</div>
      <div className={styles.klineGrid}>
        <div className={styles.field}>
          <div className={panelStyles.detailLabel}>{t('strategies.kline.summary.labels.primary_symbol')}</div>
          <div className={panelStyles.detailValueRow}>
            <div
              className={clsx(
                panelStyles.detailValue,
                panelStyles.detailValueEditable,
                isEditing && panelStyles.detailValueEditing,
                !canEditSymbol && styles.readonlyValue
              )}
              onDoubleClick={canEditSymbol ? onStartEdit : undefined}
            >
              {isEditing ? (
                <input
                  ref={symbolEditorRef}
                  className={panelStyles.detailInlineInput}
                  value={summarySymbol}
                  onChange={onSymbolChange}
                  onBlur={onSymbolBlur}
                  onKeyDown={onSymbolKeyDown}
                  disabled={summarySaving || !canEditSymbol}
                  placeholder={placeholder}
                />
              ) : (
                resolvedSymbol.trim() || '—'
              )}
            </div>
            <button
              type="button"
              className={panelStyles.detailEditButton}
              onClick={onStartEdit}
              disabled={summarySaving || isEditing || !canEditSymbol}
              aria-label={t('strategies.kline.summary.actions.edit_symbol_aria')}
            >
              {t('strategies.kline.summary.actions.edit')}
            </button>
          </div>
        </div>
        <div className={styles.field}>
          <div className={panelStyles.detailLabel}>{t('strategies.kline.summary.labels.data_feed')}</div>
          <div className={panelStyles.detailValue}>{dataSourceLabel || t('strategies.kline.summary.fallback.market_data_feed')}</div>
        </div>
        {renderEditableSelect({
          label: t('strategies.kline.summary.labels.kline_interval'),
          value: intervalValue,
          options: intervalOptions,
          disabled: intervalDisabled,
          isEditing: isIntervalEditing,
          canEdit: canEditInterval,
          onStartEdit: onIntervalStartEdit,
          onChange: wrapSingleValueChange(onIntervalChange),
          onSave: onIntervalSave,
          onCancel: onIntervalCancel,
          testId: 'kline-interval-select',
          displayValue: intervalLabel
        })}
        {renderEditableSelect({
          label: t('strategies.kline.summary.labels.lookback_window'),
          value: lookbackValue,
          options: lookbackOptions,
          disabled: lookbackDisabled,
          isEditing: isLookbackEditing,
          canEdit: canEditLookback,
          onStartEdit: onLookbackStartEdit,
          onChange: wrapSingleValueChange(onLookbackChange),
          onSave: onLookbackSave,
          onCancel: onLookbackCancel,
          testId: 'kline-lookback-select',
          displayValue: lookbackLabel
        })}
        {renderEditableSelect({
          label: t('strategies.kline.summary.labels.aggregation'),
          value: aggregationValue,
          options: aggregationOptions,
          disabled: aggregationDisabled,
          isEditing: isAggregationEditing,
          canEdit: canEditAggregation,
          onStartEdit: onAggregationStartEdit,
          onChange: wrapSingleValueChange(onAggregationChange),
          onSave: onAggregationSave,
          onCancel: onAggregationCancel,
          testId: 'kline-aggregation-select',
          displayValue: aggregationLabel
        })}
        {renderEditableSelect({
          label: '退出方式',
          value: exitModeValue,
          options: exitModeOptions,
          disabled: exitModeDisabled,
          isEditing: isExitModeEditing,
          canEdit: canEditExitMode ?? true,
          onStartEdit: onExitModeStartEdit ?? (() => undefined),
          onChange: wrapSingleValueChange(onExitModeChange),
          onSave: onExitModeSave ?? (() => undefined),
          onCancel: onExitModeCancel ?? (() => undefined),
          testId: 'kline-exit-mode-select',
          displayValue: exitModeLabel ?? undefined
        })}
        {extraFields.map((field, index) => (
          <div key={`exit-extra-${index}`} className={styles.field}>
            <div className={panelStyles.detailLabel}>{field.label}</div>
            <div className={panelStyles.detailValue}>{field.value || t('common.unconfigured')}</div>
          </div>
        ))}
        <div className={styles.field}>
        <div className={panelStyles.detailLabel}>{t('strategies.kline.summary.labels.trading_window')}</div>
        <div className={panelStyles.detailValue}>{scheduleHint}</div>
      </div>
      {renderEditableSelect({
        label: t('strategies.kline.summary.labels.timezone'),
        value: timezoneDraft,
        options: timezoneOptions,
        disabled: timezoneDisabled,
        isEditing: isTimezoneEditing,
        canEdit: canEditTimezone,
        onStartEdit: onTimezoneStartEdit,
        onChange: wrapSingleValueChange(onTimezoneChange),
        onSave: onTimezoneSave,
        onCancel: onTimezoneCancel,
        testId: 'kline-timezone-select',
        displayValue: timezone,
        editorRef: timezoneSelectRef
      })}
      {timezoneNotice ? (
        <div className={clsx(panelStyles.statusMessage, panelStyles.statusWarning)}>
          {timezoneNotice}
        </div>
      ) : null}
      </div>
      <div className={styles.descriptionBlock}>
        <div className={panelStyles.detailLabel}>{t('strategies.kline.summary.labels.description')}</div>
        <div className={panelStyles.detailValue}>{description || t('strategies.kline.summary.fallback.description_none')}</div>
      </div>
      {scheduleWindows.length > 1 ? (
        <div className={panelStyles.scheduleList}>
          {scheduleWindows.slice(1).map((window) => (
            <span key={`${window.start}-${window.end}`} className={panelStyles.scheduleBadge}>
              {window.start} → {window.end}
            </span>
          ))}
        </div>
      ) : null}
      {summaryMessage ? (
        <div className={clsx(panelStyles.statusMessage, summaryToneClassName)}>{summaryMessage}</div>
      ) : null}
    </section>
  );
};

export default KlineSummarySection;
