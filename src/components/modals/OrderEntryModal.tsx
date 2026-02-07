import { ChangeEvent, FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from '@i18n';
import Modal from './Modal';
import styles from './OrderEntryModal.module.css';
import CandlestickChart from '@features/dashboard/components/CandlestickChart';
import type { CreateOrderArgs } from '@store/thunks/orders';
import type { SymbolInfo } from '@features/dashboard/types';
import useOrderPreviewMarketData from './hooks/useOrderPreviewMarketData';
import { normalizePriceByTick } from '@features/dashboard/utils/priceFormatting';

interface OrderEntryModalProps {
  open: boolean;
  symbols: SymbolInfo[];
  defaultSymbol?: string;
  submitting: boolean;
  error?: string | null;
  onSubmit: (values: CreateOrderArgs) => void;
  onClose: () => void;
}

interface OrderFormState {
  symbol: string;
  secType: string;
  side: 'buy' | 'sell';
  type: 'limit' | 'market' | 'stop';
  quantity: string;
  price: string;
  stopPrice: string;
  timeInForce: string;
  destination: string;
  tag: string;
  comment: string;
  transmit: boolean;
}

const defaultState: OrderFormState = {
  symbol: '',
  secType: 'STK',
  side: 'buy',
  type: 'limit',
  quantity: '1',
  price: '',
  stopPrice: '',
  timeInForce: 'DAY',
  destination: 'SMART',
  tag: '',
  comment: '',
  transmit: true
};

const futuresRootSymbols = [
  'ES',
  'MES',
  'NQ',
  'MNQ',
  'YM',
  'MYM',
  'RTY',
  'M2K',
  'CL',
  'NG',
  'GC',
  'SI',
  'HG',
  'LE',
  'HE',
  'ZB',
  'ZN',
  'ZF',
  'ZT',
  '6E',
  '6B',
  '6A',
  '6J',
  '6C',
  '6M',
  '6N',
  '6S',
  'BRN',
  'BRT',
  'FDAX',
  'FESX',
  'FGBL',
  'FGBM',
  'FGBS'
];

const cryptoRootSymbols = ['BTC', 'ETH', 'SOL', 'DOGE', 'BNB', 'ADA', 'XRP', 'LTC'];

const inferSecurityType = (symbol: string, exchange?: string): string => {
  const normalized = symbol.trim().toUpperCase();
  const normalizedExchange = exchange?.trim().toUpperCase() ?? '';

  if (normalizedExchange.includes('FUT') || normalizedExchange.includes('CME') || normalizedExchange.includes('GLOBEX')) {
    return 'FUT';
  }
  if (normalizedExchange.includes('OPT')) {
    return 'OPT';
  }
  if (normalizedExchange.includes('CRYPTO') || normalizedExchange.includes('DIGITAL') || normalizedExchange.includes('COIN')) {
    return 'CRYPTO';
  }
  if (normalizedExchange.includes('CFD')) {
    return 'CFD';
  }

  if (!normalized) {
    return 'STK';
  }

  if (normalizedExchange.includes('NASDAQ') || normalizedExchange.includes('NYSE') || normalizedExchange.includes('AMEX')) {
    return 'STK';
  }

  if (/^[A-Z]{1,6}\d{6}[CP]\d{8}$/.test(normalized)) {
    return 'OPT';
  }

  if (normalized.includes('-') || normalized.includes('/')) {
    if (normalized.includes('USD') || normalized.includes('USDT')) {
      return 'CRYPTO';
    }
    return 'CFD';
  }

  if (/[FGHJKMNQUVXZ]\d{1,2}$/.test(normalized)) {
    return 'FUT';
  }

  const normalizedRoot = normalized.replace(/\d+/g, '').replace(/[FGHJKMNQUVXZ]$/, '');
  if (futuresRootSymbols.some((root) => normalized.startsWith(root) || normalizedRoot === root)) {
    return 'FUT';
  }

  if (cryptoRootSymbols.some((root) => normalized.startsWith(root))) {
    return 'CRYPTO';
  }

  return 'STK';
};

const inferDestination = (secType: string, exchange?: string): string => {
  const type = secType.trim().toUpperCase();
  const normalizedExchange = exchange?.trim().toUpperCase() ?? '';

  if (type === 'FUT') {
    if (normalizedExchange.includes('CME')) {
      return 'GLOBEX';
    }
    if (normalizedExchange.includes('ICE')) {
      return 'ICE';
    }
    return 'GLOBEX';
  }

  if (type === 'CRYPTO') {
    if (normalizedExchange) {
      return normalizedExchange;
    }
    return 'CRYPTO';
  }

  if (type === 'CFD') {
    return normalizedExchange || 'CFD';
  }

  return normalizedExchange || 'SMART';
};

const parseNumber = (value: string): number | null => {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return parsed;
};

function formatNumber(value: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatSignedNumber(value: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  const formatted = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  if (value > 0) {
    return `+${formatted}`;
  }
  if (value < 0) {
    return `-${formatted}`;
  }
  return formatted;
}

function formatSignedPercent(value: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '—';
  }
  const formatted = Math.abs(value).toFixed(2);
  if (value > 0) {
    return `+${formatted}%`;
  }
  if (value < 0) {
    return `-${formatted}%`;
  }
  return `${formatted}%`;
}
const determineTickDecimals = (tickSize?: number | null) => {
  if (tickSize == null || !Number.isFinite(tickSize)) {
    return 2;
  }
  const absolute = Math.abs(tickSize);
  if (!absolute) {
    return 2;
  }
  const text = absolute.toString();
  if (text.includes('e')) {
    const exponentText = text.split('e')[1] ?? '';
    const exponent = Number.parseInt(exponentText, 10);
    if (Number.isFinite(exponent) && exponent < 0) {
      return Math.min(Math.max(-exponent, 0), 8);
    }
    return 0;
  }
  if (!text.includes('.')) {
    return 0;
  }
  const decimals = text.split('.')[1]?.length ?? 0;
  return Math.min(Math.max(decimals, 0), 8);
};

const formatPriceForInput = (
  value: number | null | undefined,
  symbol: string,
  symbolInfo: SymbolInfo | undefined
): string | null => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const trimmedSymbol = symbol.trim();
  const normalized = normalizePriceByTick(value, trimmedSymbol, {
    tickSize: symbolInfo?.tickSize ?? undefined
  });
  if (normalized == null || Number.isNaN(normalized)) {
    return null;
  }
  const decimals = determineTickDecimals(symbolInfo?.tickSize ?? null);
  if (decimals <= 0) {
    return normalized.toFixed(0);
  }
  return normalized.toFixed(decimals);
};

function OrderEntryModal({
  open,
  symbols,
  defaultSymbol,
  submitting,
  error,
  onSubmit,
  onClose
}: OrderEntryModalProps) {
  const { t } = useTranslation();
  const [formValues, setFormValues] = useState<OrderFormState>(defaultState);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [priceInitialized, setPriceInitialized] = useState(false);
  const [priceTouched, setPriceTouched] = useState(false);

  const {
    bars,
    currentPrice,
    loading: marketLoading,
    error: marketError
  } = useOrderPreviewMarketData(formValues.symbol, open);

  const latestBar = useMemo(() => (bars.length ? bars[bars.length - 1] ?? null : null), [bars]);
  const previousBar = useMemo(
    () => (bars.length > 1 ? bars[bars.length - 2] ?? null : null),
    [bars]
  );

  const priceValue = useMemo(() => {
    if (typeof currentPrice === 'number' && Number.isFinite(currentPrice)) {
      return currentPrice;
    }
    if (latestBar?.close != null && Number.isFinite(latestBar.close)) {
      return latestBar.close;
    }
    if (latestBar?.open != null && Number.isFinite(latestBar.open)) {
      return latestBar.open;
    }
    return null;
  }, [currentPrice, latestBar]);

  const referencePrice = useMemo(() => {
    if (!previousBar) {
      return null;
    }
    if (previousBar.close != null && Number.isFinite(previousBar.close)) {
      return previousBar.close;
    }
    if (previousBar.open != null && Number.isFinite(previousBar.open)) {
      return previousBar.open;
    }
    return null;
  }, [previousBar]);

  const priceChange = useMemo(() => {
    if (priceValue == null || referencePrice == null) {
      return null;
    }
    const delta = priceValue - referencePrice;
    return Number.isFinite(delta) ? delta : null;
  }, [priceValue, referencePrice]);

  const priceChangePercent = useMemo(() => {
    if (priceChange == null || referencePrice == null || referencePrice === 0) {
      return null;
    }
    const percent = (priceChange / referencePrice) * 100;
    return Number.isFinite(percent) ? percent : null;
  }, [priceChange, referencePrice]);

  const priceDirection: 'up' | 'down' | 'flat' = useMemo(() => {
    if (priceChange == null || priceChange === 0) {
      return 'flat';
    }
    return priceChange > 0 ? 'up' : 'down';
  }, [priceChange]);

  const priceValueDisplay = useMemo(() => formatNumber(priceValue), [priceValue]);
  const priceChangeDisplay = useMemo(() => {
    if (priceChange == null && priceChangePercent == null) {
      return null;
    }
    const changeString = priceChange != null ? formatSignedNumber(priceChange) : null;
    const percentString =
      priceChangePercent != null ? formatSignedPercent(priceChangePercent) : null;
    if (changeString && percentString) {
      return `${changeString} · ${percentString}`;
    }
    return changeString ?? percentString;
  }, [priceChange, priceChangePercent]);

  const priceValueClass = clsx(styles.priceValue, {
    [styles.priceValuePositive]: priceDirection === 'up',
    [styles.priceValueNegative]: priceDirection === 'down',
    [styles.priceValueNeutral]: priceDirection === 'flat'
  });

  const priceDeltaClass = clsx(styles.priceDelta, {
    [styles.priceDeltaPositive]: priceDirection === 'up',
    [styles.priceDeltaNegative]: priceDirection === 'down'
  });

  const showChartSkeleton = marketLoading && bars.length === 0;
  const hasBars = bars.length > 0;

  const symbolMap = useMemo(() => {
    const entries = new Map<string, SymbolInfo>();
    for (const item of symbols) {
      entries.set(item.symbol, item);
    }
    return entries;
  }, [symbols]);

  useEffect(() => {
    if (!open) {
      setFormValues(defaultState);
      setValidationError(null);
      setPriceInitialized(false);
      setPriceTouched(false);
      return;
    }
    const initialSymbol = defaultSymbol ?? symbols[0]?.symbol ?? '';
    const symbolInfo = symbolMap.get(initialSymbol);
    const initialSecType = inferSecurityType(initialSymbol, symbolInfo?.exchange);
    setFormValues({
      ...defaultState,
      symbol: initialSymbol,
      secType: initialSecType,
      destination: inferDestination(initialSecType, symbolInfo?.exchange)
    });
    setValidationError(null);
    setPriceInitialized(false);
    setPriceTouched(false);
  }, [open, defaultSymbol, symbols, symbolMap]);

  const symbolOptions = useMemo(() => {
    if (!symbols.length) {
      return [];
    }
    return symbols.map((item) => ({
      value: item.symbol,
      label: `${item.symbol}${item.description ? ` · ${item.description}` : ''}`
    }));
  }, [symbols]);

  const quantityNumber = useMemo(() => parseNumber(formValues.quantity) ?? 0, [formValues.quantity]);
  const limitPriceNumber = useMemo(() => parseNumber(formValues.price), [formValues.price]);
  const stopPriceNumber = useMemo(() => parseNumber(formValues.stopPrice), [formValues.stopPrice]);
  const notional = useMemo(() => {
    if (formValues.type === 'market') {
      return null;
    }
    if (limitPriceNumber === null) {
      return null;
    }
    return quantityNumber * limitPriceNumber;
  }, [formValues.type, limitPriceNumber, quantityNumber]);

  const estimatedRisk = useMemo(() => {
    if (stopPriceNumber === null || limitPriceNumber === null || formValues.type === 'market') {
      return null;
    }
    const diff = (limitPriceNumber - stopPriceNumber) * quantityNumber;
    return Number.isFinite(diff) ? diff : null;
  }, [formValues.type, limitPriceNumber, stopPriceNumber, quantityNumber]);

  const handleChange = (field: keyof OrderFormState) => (event: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const value = event.target.type === 'checkbox'
      ? (event.target as HTMLInputElement).checked
      : event.target.value;
    setFormValues((previous) => ({
      ...previous,
      [field]: value
    }));
  };

  const handleSymbolChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const symbol = event.target.value;
      const symbolInfo = symbolMap.get(symbol);
      const nextSecType = inferSecurityType(symbol, symbolInfo?.exchange);
      setFormValues((previous) => ({
        ...previous,
        symbol,
        secType: nextSecType,
        destination: inferDestination(nextSecType, symbolInfo?.exchange)
      }));
      setPriceInitialized(false);
      setPriceTouched(false);
    },
    [symbolMap]
  );

  const handleTypeChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextType = event.target.value as OrderFormState['type'];
    setFormValues((previous) => ({
      ...previous,
      type: nextType,
      price: nextType === 'market' ? '' : previous.price,
      stopPrice: nextType === 'stop' ? previous.stopPrice : ''
    }));
    setPriceInitialized(false);
  };

  const handlePriceChange = (event: ChangeEvent<HTMLInputElement>) => {
    setPriceTouched(true);
    setPriceInitialized(true);
    setFormValues((previous) => ({
      ...previous,
      price: event.target.value
    }));
  };

  const autoPrice = useMemo(() => {
    if (!open) {
      return null;
    }
    if (formValues.type === 'market') {
      return null;
    }
    const formatted = formatPriceForInput(priceValue, formValues.symbol, symbolMap.get(formValues.symbol));
    return formatted;
  }, [priceValue, formValues.symbol, formValues.type, open, symbolMap]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (formValues.type === 'market') {
      return;
    }
    if (priceTouched) {
      return;
    }
    if (priceInitialized) {
      return;
    }
    if (!autoPrice) {
      return;
    }
    const targetSymbol = formValues.symbol;
    setFormValues((previous) => {
      if (previous.symbol !== targetSymbol) {
        return previous;
      }
      if (previous.type === 'market') {
        return previous;
      }
      if (previous.price === autoPrice) {
        return previous;
      }
      return {
        ...previous,
        price: autoPrice
      };
    });
    setPriceInitialized(true);
  }, [autoPrice, formValues.symbol, formValues.type, open, priceInitialized, priceTouched]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const quantity = parseNumber(formValues.quantity);
    if (!formValues.symbol.trim()) {
      setValidationError('请选择要下单的合约。');
      return;
    }
    if (quantity === null || quantity <= 0) {
      setValidationError('请输入有效的下单数量。');
      return;
    }
    let price: number | null = null;
    if (formValues.type !== 'market') {
      price = parseNumber(formValues.price);
      if (price === null || price <= 0) {
        setValidationError('限价 / 触发价需要大于 0。');
        return;
      }
    }
    let stopPrice: number | null = null;
    if (formValues.type === 'stop') {
      stopPrice = parseNumber(formValues.stopPrice);
      if (stopPrice === null || stopPrice <= 0) {
        setValidationError('止损触发价需要大于 0。');
        return;
      }
    }

    setValidationError(null);

    onSubmit({
      symbol: formValues.symbol,
      secType: formValues.secType,
      side: formValues.side,
      type: formValues.type,
      quantity,
      price: price ?? undefined,
      stopPrice: stopPrice ?? undefined,
      timeInForce: formValues.timeInForce || undefined,
      destination: formValues.destination || undefined,
      transmit: formValues.transmit,
      tag: formValues.tag || undefined,
      comment: formValues.comment || undefined
    });
  };

  const selectedSymbolLabel = useMemo(() => {
    const match = symbolOptions.find((option) => option.value === formValues.symbol);
    return match?.label ?? formValues.symbol ?? '—';
  }, [symbolOptions, formValues.symbol]);

  const formValid = useMemo(() => {
    if (!formValues.symbol.trim()) {
      return false;
    }
    if (!formValues.secType.trim()) {
      return false;
    }
    const quantity = parseNumber(formValues.quantity);
    if (quantity === null || quantity <= 0) {
      return false;
    }
    if (formValues.type !== 'market') {
      const price = parseNumber(formValues.price);
      if (price === null || price <= 0) {
        return false;
      }
    }
    if (formValues.type === 'stop') {
      const stop = parseNumber(formValues.stopPrice);
      if (stop === null || stop <= 0) {
        return false;
      }
    }
    return true;
  }, [formValues]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('modals.order_entry.title')}
      subtitle={t('modals.order_entry.subtitle')}
      size="lg"
    >
      <form className={styles.container} onSubmit={handleSubmit}>
        <div className={styles.formLayout}>
          <div className={styles.formSection}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>{t('modals.order_entry.basic.title')}</span>
              <span className={styles.sectionSubtitle}>{t('modals.order_entry.basic.subtitle')}</span>
            </div>
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span className={styles.label}>{t('modals.order_entry.fields.symbol.label')}</span>
                <select className={styles.select} value={formValues.symbol} onChange={handleSymbolChange} required>
                  <option value="" disabled>
                    {t('modals.order_entry.select_symbol_placeholder')}
                  </option>
                  {symbolOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>{t('modals.order_entry.fields.side.label')}</span>
                <select className={styles.select} value={formValues.side} onChange={handleChange('side')}>
                  <option value="buy">{t('modals.order_entry.side.buy')}</option>
                  <option value="sell">{t('modals.order_entry.side.sell')}</option>
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>{t('modals.order_entry.fields.type.label')}</span>
                <select className={styles.select} value={formValues.type} onChange={handleTypeChange}>
                  <option value="limit">{t('modals.order_entry.type.limit')}</option>
                  <option value="market">{t('modals.order_entry.type.market')}</option>
                  <option value="stop">{t('modals.order_entry.type.stop')}</option>
                </select>
              </label>
              <label className={styles.field}>
                <span className={styles.label}>{t('modals.order_entry.fields.quantity.label')}</span>
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  step="1"
                  value={formValues.quantity}
                  onChange={handleChange('quantity')}
                />
              </label>
              {formValues.type !== 'market' ? (
                <label className={styles.field}>
                  <span className={styles.label}>{t('modals.order_entry.fields.limit_price.label')}</span>
                  <input
                    className={styles.input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={formValues.price}
                    onFocus={() => setPriceTouched(true)}
                    onChange={handlePriceChange}
                  />
                </label>
              ) : null}
              {formValues.type === 'stop' ? (
                <label className={styles.field}>
                  <span className={styles.label}>{t('modals.order_entry.fields.stop_price.label')}</span>
                  <input
                    className={styles.input}
                    type="number"
                    min="0"
                    step="0.01"
                    value={formValues.stopPrice}
                    onChange={handleChange('stopPrice')}
                  />
                </label>
              ) : null}
            </div>
            <div className={styles.optionalRow}>
              <label className={clsx(styles.field, styles.optionalField)}>
                <span className={styles.optionalLabel}>{t('modals.order_entry.fields.tag.label')}</span>
                <input
                  className={styles.input}
                  type="text"
                  value={formValues.tag}
                  onChange={handleChange('tag')}
                  placeholder={t('modals.order_entry.fields.tag.placeholder')}
                />
              </label>
              <label className={clsx(styles.field, styles.optionalField)}>
                <span className={styles.optionalLabel}>{t('modals.order_entry.fields.comment.label')}</span>
                <textarea
                  className={styles.textarea}
                  value={formValues.comment}
                  onChange={handleChange('comment')}
                  placeholder={t('modals.order_entry.fields.comment.placeholder')}
                />
              </label>
            </div>
            <label className={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={formValues.transmit}
                onChange={handleChange('transmit')}
              />
              <span className={styles.checkboxLabel}>{t('modals.order_entry.fields.transmit.label')}</span>
            </label>
          </div>
          <aside className={styles.secondaryColumn}>
            <div className={styles.marketPanel}>
              <div className={styles.priceTicker}>
                <div className={styles.priceHeader}>
                  <span className={styles.priceSymbol}>{selectedSymbolLabel || '—'}</span>
                  <span className={priceValueClass}>{priceValueDisplay}</span>
                </div>
                <div className={styles.priceMeta}>
                  {priceChangeDisplay ? (
                    <span className={priceDeltaClass}>{priceChangeDisplay}</span>
                  ) : null}
                  {marketLoading ? <span className={styles.priceStatus}>{t('modals.order_entry.market.loading')}</span> : null}
                  {!marketLoading && marketError ? (
                    <span className={styles.priceStatusError}>{t('modals.order_entry.market.error', { error: marketError })}</span>
                  ) : null}
                </div>
              </div>
              <div className={styles.chartPanel}>
                {showChartSkeleton ? (
                  <div className={styles.chartSkeleton} aria-hidden />
                ) : hasBars ? (
                  <CandlestickChart bars={bars} height={160} />
                ) : (
                  <div className={styles.chartPlaceholder} role="status">
                    {formValues.symbol ? t('modals.order_entry.chart.no_data') : t('modals.order_entry.chart.no_symbol_hint')}
                  </div>
                )}
              </div>
            </div>
            <div className={styles.summaryCard}>
              <div className={styles.summaryTitle}>{t('modals.order_entry.summary.title')}</div>
              <div className={styles.metaList}>
                <div>
                  <div className={styles.metaLabel}>{t('modals.order_entry.summary.contract')}</div>
                  <div className={styles.metaValue}>{selectedSymbolLabel || '—'}</div>
                </div>
                <div>
                  <div className={styles.metaLabel}>{t('modals.order_entry.summary.security_type')}</div>
                  <div className={styles.metaValue}>
                    {t(`modals.order_entry.security_type.${formValues.secType}`, { code: formValues.secType }) ?? formValues.secType ?? '—'}
                  </div>
                </div>
                <div>
                  <div className={styles.metaLabel}>{t('modals.order_entry.summary.side')}</div>
                  <div className={styles.metaValue}>{formValues.side === 'buy' ? t('modals.order_entry.side.buy') : t('modals.order_entry.side.sell')}</div>
                </div>
                <div>
                  <div className={styles.metaLabel}>{t('modals.order_entry.summary.order_type')}</div>
                  <div className={styles.metaValue}>
                    {formValues.type === 'market'
                      ? t('modals.order_entry.type.market')
                      : formValues.type === 'limit'
                        ? t('modals.order_entry.type.limit')
                        : t('modals.order_entry.type.stop')}
                  </div>
                </div>
              </div>
              <div className={styles.summaryRow}>
                <span>{t('modals.order_entry.summary.rows.quantity')}</span>
                <span className={styles.summaryValueNeutral}>{quantityNumber || '—'}</span>
              </div>
              <div className={styles.summaryRow}>
                <span>{t('modals.order_entry.summary.rows.price')}</span>
                <span className={styles.summaryValueNeutral}>
                  {formValues.type === 'market' ? t('modals.order_entry.summary.rows.market_exec') : formatNumber(limitPriceNumber)}
                </span>
              </div>
              <div className={styles.summaryRow}>
                <span>{t('modals.order_entry.summary.rows.notional')}</span>
                <span className={styles.summaryValueNeutral}>{formatNumber(notional)}</span>
              </div>
              {formValues.type === 'stop' ? (
                <div className={styles.summaryRow}>
                  <span>{t('modals.order_entry.fields.stop_price.label')}</span>
                  <span className={styles.summaryValueNeutral}>{formatNumber(stopPriceNumber)}</span>
                </div>
              ) : null}
              {estimatedRisk !== null ? (
                <div className={styles.summaryRow}>
                  <span>{t('modals.order_entry.summary.rows.spread_risk')}</span>
                  <span className={estimatedRisk <= 0 ? styles.summaryValueNeutral : styles.summaryValuePositive}>
                    {formatNumber(Math.abs(estimatedRisk))}
                  </span>
                </div>
              ) : null}
              <div className={styles.hintRow}>
                <span className={styles.hintBadge}>{t('modals.order_entry.summary.hint_label')}</span>
                <span className={styles.summaryHint}>
                  {t('modals.order_entry.summary.hint_text')}
                </span>
              </div>
            </div>
          </aside>
        </div>
        {validationError ? <div className={styles.validationError}>{validationError}</div> : null}
        {error ? <div className={styles.submitError}>{error}</div> : null}
        <div className={styles.footer}>
          <div className={styles.footerMeta}>{t('modals.order_entry.footer.meta')}</div>
          <div className={styles.footerActions}>
            <button type="button" className={styles.secondaryButton} onClick={onClose} disabled={submitting}>
              {t('modals.common.cancel')}
            </button>
            <button type="submit" className={styles.primaryButton} disabled={!formValid || submitting}>
              {submitting ? t('modals.order_entry.actions.submitting') : t('modals.order_entry.actions.submit')}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export default OrderEntryModal;
