import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { useTranslation } from '@i18n';
import clsx from 'clsx';
import Modal from '@components/modals/Modal';
import styles from './StrategyDetailPanel.module.css';

type RegimeKey = 'low' | 'normal' | 'high';

const REGIME_ORDER: RegimeKey[] = ['low', 'normal', 'high'];

const buildRegimeLabels = (t: (key: string) => string): Record<RegimeKey, string> => ({
  low: t('modals.volatility.labels.low'),
  normal: t('modals.volatility.labels.normal'),
  high: t('modals.volatility.labels.high')
});

const formatInitialValue = (value: number | undefined): string => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return '';
};

interface VolatilityRegimeMultipliersModalProps {
  open: boolean;
  parameterLabel: string;
  initialValue: Partial<Record<RegimeKey, number>>;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (value: Record<RegimeKey, number>) => void | Promise<void>;
}

type DraftState = Record<RegimeKey, string>;

const INITIAL_DRAFT: DraftState = {
  low: '',
  normal: '',
  high: ''
};

function VolatilityRegimeMultipliersModal({
  open,
  parameterLabel,
  initialValue,
  saving,
  error,
  onClose,
  onSubmit
}: VolatilityRegimeMultipliersModalProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<DraftState>(INITIAL_DRAFT);
  const [validationError, setValidationError] = useState<string | null>(null);
  const REGIME_LABELS = buildRegimeLabels(t);

  useEffect(() => {
    if (!open) {
      return;
    }
    setDraft({
      low: formatInitialValue(initialValue.low),
      normal: formatInitialValue(initialValue.normal),
      high: formatInitialValue(initialValue.high)
    });
    setValidationError(null);
  }, [open, initialValue.low, initialValue.normal, initialValue.high]);

  const handleInputChange = (key: RegimeKey) => (event: ChangeEvent<HTMLInputElement>) => {
    const { value } = event.target;
    setDraft((previous) => ({ ...previous, [key]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedEntries = new Map<RegimeKey, number>();
    for (const key of REGIME_ORDER) {
      const raw = draft[key].trim();
      if (!raw) {
        setValidationError(t('modals.volatility_multipliers.validation.invalid_number'));
        return;
      }
      const parsed = Number.parseFloat(raw);
      if (!Number.isFinite(parsed)) {
        setValidationError(t('modals.volatility_multipliers.validation.invalid_number'));
        return;
      }
      parsedEntries.set(key, parsed);
    }
    setValidationError(null);
    const payload = REGIME_ORDER.reduce<Record<RegimeKey, number>>((accumulator, key) => {
      accumulator[key] = parsedEntries.get(key) ?? 0;
      return accumulator;
    }, {} as Record<RegimeKey, number>);
    onSubmit(payload);
  };

  return (
    <Modal
      open={open}
      title={t('modals.volatility_multipliers.title', { parameter: parameterLabel })}
      subtitle={t('modals.volatility_multipliers.subtitle')}
      onClose={onClose}
      size="md"
    >
      <form
        className={styles.modalForm}
        onSubmit={handleSubmit}
        data-testid="volatility-multipliers-modal"
      >
        <div className={styles.modalFieldGroup}>
          {REGIME_ORDER.map((key) => (
            <div key={key} className={styles.modalFieldRow}>
              <label className={styles.modalFieldLabel} htmlFor={`volatility-${key}`}>
                {REGIME_LABELS[key]}
              </label>
              <input
                id={`volatility-${key}`}
                name={`volatility-${key}`}
                type="number"
                inputMode="decimal"
                step="any"
                className={styles.modalFieldInput}
                value={draft[key]}
                onChange={handleInputChange(key)}
                disabled={saving}
                data-testid={`volatility-input-${key}`}
              />
            </div>
          ))}
        </div>
        {validationError ? (
          <div className={styles.modalError} role="alert">
            {validationError}
          </div>
        ) : null}
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
            data-testid="volatility-submit"
          >
            {saving ? t('modals.common.saving') : t('modals.common.save')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default VolatilityRegimeMultipliersModal;
