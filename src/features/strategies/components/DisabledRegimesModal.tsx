import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@i18n';
import clsx from 'clsx';
import Modal from '@components/modals/Modal';
import styles from './StrategyDetailPanel.module.css';

type RegimeKey = 'low' | 'normal' | 'high';

interface RegimeOption {
  value: RegimeKey;
  label: string;
  description: string;
}

interface DisabledRegimesModalProps {
  open: boolean;
  parameterLabel: string;
  initialValue: RegimeKey[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (values: string[]) => void | Promise<void>;
}

const buildRegimeOptions = (t: (key: string, opts?: Record<string, unknown>) => string): RegimeOption[] => (
  [
    {
      value: 'low' as RegimeKey,
      label: t('modals.volatility.labels.low'),
      description: t('modals.volatility.desc.low')
    },
    {
      value: 'normal' as RegimeKey,
      label: t('modals.volatility.labels.normal'),
      description: t('modals.volatility.desc.normal')
    },
    {
      value: 'high' as RegimeKey,
      label: t('modals.volatility.labels.high'),
      description: t('modals.volatility.desc.high')
    }
  ]
);

const toNormalizedSelection = (values: RegimeKey[], options: RegimeOption[]): Set<RegimeKey> => {
  const normalized = new Set<RegimeKey>();
  values
    .map((value) => value.toLowerCase() as RegimeKey)
    .forEach((value) => {
      if (options.some((option) => option.value === value)) {
        normalized.add(value);
      }
    });
  return normalized;
};

function DisabledRegimesModal({
  open,
  parameterLabel,
  initialValue,
  saving,
  error,
  onClose,
  onSubmit
}: DisabledRegimesModalProps) {
  const { t } = useTranslation();
  const regimeOptions = useMemo(() => buildRegimeOptions(t), [t]);
  const [selection, setSelection] = useState<Set<RegimeKey>>(() => toNormalizedSelection(initialValue, regimeOptions));

  useEffect(() => {
    if (!open) {
      return;
    }
    setSelection(toNormalizedSelection(initialValue, regimeOptions));
  }, [open, initialValue, regimeOptions]);

  const handleToggle = (value: RegimeKey) => (event: ChangeEvent<HTMLInputElement>) => {
    const next = new Set(selection);
    if (event.target.checked) {
      next.add(value);
    } else {
      next.delete(value);
    }
    setSelection(next);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(Array.from(selection));
  };

  const selectedValues = useMemo(() => Array.from(selection), [selection]);

  return (
    <Modal
      open={open}
      title={t('modals.disabled_regimes.title', { parameter: parameterLabel })}
      subtitle={t('modals.disabled_regimes.subtitle')}
      onClose={onClose}
      size="md"
    >
      <form
        className={styles.modalForm}
        onSubmit={handleSubmit}
        data-testid="disabled-regimes-modal"
      >
        <div className={styles.modalCheckboxGroup}>
          {regimeOptions.map((option) => (
            <label key={option.value} className={styles.modalCheckboxOption} htmlFor={`disabled-${option.value}`}>
              <input
                id={`disabled-${option.value}`}
                type="checkbox"
                checked={selection.has(option.value)}
                onChange={handleToggle(option.value)}
                disabled={saving}
                data-testid={`disabled-checkbox-${option.value}`}
              />
              <div className={styles.modalCheckboxLabelGroup}>
                <span className={styles.modalCheckboxLabel}>{option.label}</span>
                <span className={styles.modalCheckboxDescription}>{option.description}</span>
              </div>
            </label>
          ))}
        </div>
        <div className={styles.modalTagList}>
          {selectedValues.length ? (
            selectedValues.map((value) => (
              <span key={value} className={styles.modalTag} data-testid="disabled-tag">
                {regimeOptions.find((option) => option.value === value)?.label ?? value}
              </span>
            ))
          ) : (
            <span className={styles.modalEmptyTagHint}>{t('modals.disabled_regimes.empty_tag_hint')}</span>
          )}
        </div>
        {error ? (
          <div className={styles.modalError} role="alert">
            {error}
          </div>
        ) : null}
        <div className={styles.modalActions}>
          <button
            type="button"
            className={clsx(styles.modalButton, styles.modalButtonSecondary)}
            onClick={onClose}
            disabled={saving}
          >
            {t('modals.common.cancel')}
          </button>
          <button
            type="submit"
            className={clsx(styles.modalButton, styles.modalButtonPrimary)}
            disabled={saving}
            data-testid="disabled-submit"
          >
            {saving ? t('modals.common.saving') : t('modals.common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default DisabledRegimesModal;
