import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent
} from 'react';
import PanelCard, { PanelAction } from './PanelCard';
import { useTranslation } from '@i18n';
import styles from './PositionsPanel.module.css';
import type {
  MarketTickerSnapshot,
  PositionItem,
  SymbolInfo,
  WatchlistGroup
} from '../types';
import { formatPriceWithTick } from '../utils/priceFormatting';

type RequestStatus = 'idle' | 'loading' | 'succeeded' | 'failed';

type PositionsTab = 'positions' | 'watchlist';

type WatchlistQuoteSnapshot = MarketTickerSnapshot;

type WatchlistColumnKey =
  | 'last'
  | 'change'
  | 'changePercent'
  | 'extPercent'
  | 'bid'
  | 'ask'
  | 'close'
  | 'midPrice'
  | 'spread'
  | 'lastSize'
  | 'open'
  | 'high'
  | 'low';

type WatchlistColumnKind = 'price' | 'number' | 'percent';

interface WatchlistColumnOption {
  key: WatchlistColumnKey;
  label: string;
  kind: WatchlistColumnKind;
  signed?: boolean;
  aliases: string[];
}

const WATCHLIST_COLUMN_OPTIONS: WatchlistColumnOption[] = [
  {
    key: 'last',
    label: 'Last',
    kind: 'price',
    aliases: ['last', 'last_price', 'lastPrice', 'price', 'trade_price', 'mark', 'mark_price']
  },
  {
    key: 'change',
    label: 'Chg',
    kind: 'price',
    signed: true,
    aliases: ['change', 'chg', 'price_change', 'change_value']
  },
  {
    key: 'changePercent',
    label: 'Chg%',
    kind: 'percent',
    signed: true,
    aliases: ['changePercent', 'change_percent', 'chg_percent', 'chgPercent']
  },
  {
    key: 'extPercent',
    label: 'Ext%',
    kind: 'percent',
    signed: true,
    aliases: [
      'extPercent',
      'ext_percent',
      'extendedPercent',
      'extended_percent',
      'extendedChangePercent',
      'extended_change_percent',
      'preMarketChangePercent',
      'pre_market_change_percent',
      'postMarketChangePercent',
      'post_market_change_percent'
    ]
  },
  {
    key: 'bid',
    label: 'Bid',
    kind: 'price',
    aliases: ['bid', 'bid_price', 'bidPrice']
  },
  {
    key: 'ask',
    label: 'Ask',
    kind: 'price',
    aliases: ['ask', 'ask_price', 'askPrice']
  },
  {
    key: 'close',
    label: 'Close',
    kind: 'price',
    aliases: ['close', 'close_price', 'closePrice']
  },
  {
    key: 'midPrice',
    label: 'Mid',
    kind: 'price',
    aliases: ['midPrice', 'mid_price', 'mid', 'mark', 'mark_price']
  },
  {
    key: 'spread',
    label: 'Spread',
    kind: 'price',
    aliases: ['spread', 'bid_ask_spread', 'bidAskSpread']
  },
  {
    key: 'lastSize',
    label: 'Size',
    kind: 'number',
    aliases: ['lastSize', 'last_size', 'size', 'volume']
  },
  {
    key: 'open',
    label: 'Open',
    kind: 'price',
    aliases: ['open', 'open_price', 'openPrice']
  },
  {
    key: 'high',
    label: 'High',
    kind: 'price',
    aliases: ['high', 'high_price', 'highPrice']
  },
  {
    key: 'low',
    label: 'Low',
    kind: 'price',
    aliases: ['low', 'low_price', 'lowPrice']
  }
];

const WATCHLIST_COLUMN_OPTION_MAP = Object.fromEntries(
  WATCHLIST_COLUMN_OPTIONS.map((option) => [option.key, option])
) as Record<WatchlistColumnKey, WatchlistColumnOption>;

const WATCHLIST_DEFAULT_COLUMNS: WatchlistColumnKey[] = ['last', 'change', 'changePercent', 'extPercent'];
const WATCHLIST_COLUMNS_STORAGE_KEY = 'dashboard.watchlist.columns.v1';
const WATCHLIST_QUOTE_REFRESH_MS = 15000;

interface PositionsPanelProps {
  positions: PositionItem[];
  symbols?: SymbolInfo[];
  onSelectSymbol: (symbol: string) => void;
  onConfigureRiskRule: (position: PositionItem) => void;
  onQuickClosePosition?: (symbol: string, position: PositionItem) => void;
  onQuickReversePosition?: (symbol: string, position: PositionItem) => void;
  onRefresh?: () => void;
  quickCloseStatus?: RequestStatus;
  quickCloseError?: string | null;
  quickReverseStatus?: RequestStatus;
  quickReverseError?: string | null;
  watchlistGroups?: WatchlistGroup[];
  watchlistStatus?: RequestStatus;
  watchlistError?: string | null;
  watchlistSaving?: boolean;
  onCreateWatchlistGroup?: (name: string) => void;
  onRenameWatchlistGroup?: (groupId: string, name: string) => void;
  onDeleteWatchlistGroup?: (groupId: string) => void;
  onReorderWatchlistGroups?: (groupIds: string[]) => void;
  onAddWatchlistItem?: (groupId: string, symbol: string) => void;
  onUpdateWatchlistItem?: (itemId: string, symbol: string) => void;
  onDeleteWatchlistItem?: (itemId: string) => void;
  onMoveWatchlistItem?: (itemId: string, targetGroupId: string, targetIndex: number) => void;
  loadWatchlistQuote?: (symbol: string) => Promise<WatchlistQuoteSnapshot | null>;
}

const resolveTickSize = (symbol: string, symbols?: SymbolInfo[]) => {
  if (!symbols?.length) {
    return undefined;
  }
  const normalized = symbol.toUpperCase();
  const direct = symbols.find((item) => item.symbol.toUpperCase() === normalized);
  if (direct?.tickSize) {
    return direct.tickSize;
  }
  const root = normalized.replace(/\d+.*/, '');
  return symbols.find((item) => item.symbol.toUpperCase() === root)?.tickSize ?? undefined;
};

const formatPercent = (value: number | null): string => {
  if (value === null || Number.isNaN(value)) {
    return '—';
  }
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

const parseGroupDragData = (event: DragEvent): string | null => {
  const raw = event.dataTransfer.getData('text/plain');
  if (!raw.startsWith('group:')) {
    return null;
  }
  const groupId = raw.slice('group:'.length);
  return groupId || null;
};

const parseItemDragData = (event: DragEvent): { itemId: string; sourceGroupId: string } | null => {
  const raw = event.dataTransfer.getData('text/plain');
  if (!raw.startsWith('item:')) {
    return null;
  }
  const [, itemId, sourceGroupId] = raw.split(':');
  if (!itemId || !sourceGroupId) {
    return null;
  }
  return { itemId, sourceGroupId };
};

const coerceNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
};

const isWatchlistColumnKey = (value: unknown): value is WatchlistColumnKey =>
  typeof value === 'string' && value in WATCHLIST_COLUMN_OPTION_MAP;

const loadInitialWatchlistColumns = (): WatchlistColumnKey[] => {
  if (typeof window === 'undefined') {
    return [...WATCHLIST_DEFAULT_COLUMNS];
  }
  try {
    const raw = window.localStorage.getItem(WATCHLIST_COLUMNS_STORAGE_KEY);
    if (!raw) {
      return [...WATCHLIST_DEFAULT_COLUMNS];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [...WATCHLIST_DEFAULT_COLUMNS];
    }
    const normalized = parsed.filter(isWatchlistColumnKey).slice(0, WATCHLIST_DEFAULT_COLUMNS.length);
    if (normalized.length !== WATCHLIST_DEFAULT_COLUMNS.length) {
      return [...WATCHLIST_DEFAULT_COLUMNS];
    }
    return normalized;
  } catch (_error) {
    return [...WATCHLIST_DEFAULT_COLUMNS];
  }
};

const formatSignedValue = (value: number, text: string, signed = false): string => {
  if (!signed) {
    return text;
  }
  if (value > 0) {
    return `+${text}`;
  }
  if (value < 0) {
    return `-${text}`;
  }
  return text;
};

function PositionsPanel({
  positions,
  symbols,
  onSelectSymbol,
  onConfigureRiskRule,
  onQuickClosePosition,
  onQuickReversePosition,
  onRefresh,
  quickCloseStatus = 'idle',
  quickCloseError,
  quickReverseStatus = 'idle',
  quickReverseError,
  watchlistGroups = [],
  watchlistStatus = 'idle',
  watchlistError = null,
  watchlistSaving = false,
  onCreateWatchlistGroup,
  onRenameWatchlistGroup,
  onDeleteWatchlistGroup,
  onReorderWatchlistGroups,
  onAddWatchlistItem,
  onUpdateWatchlistItem,
  onDeleteWatchlistItem,
  onMoveWatchlistItem,
  loadWatchlistQuote
}: PositionsPanelProps) {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<PositionsTab>('positions');
  const [watchlistColumns, setWatchlistColumns] = useState<WatchlistColumnKey[]>(
    loadInitialWatchlistColumns
  );
  const [watchlistQuotes, setWatchlistQuotes] = useState<Record<string, WatchlistQuoteSnapshot>>({});
  const [watchlistAddMenuOpen, setWatchlistAddMenuOpen] = useState(false);
  const [watchlistColumnsMenuOpen, setWatchlistColumnsMenuOpen] = useState(false);
  const [composerMode, setComposerMode] = useState<'none' | 'group' | 'symbol'>('none');
  const [composerGroupName, setComposerGroupName] = useState('');
  const [composerSymbol, setComposerSymbol] = useState('');
  const [composerGroupId, setComposerGroupId] = useState<string>('');
  const [editingGroup, setEditingGroup] = useState<{ groupId: string; value: string } | null>(null);
  const [editingItem, setEditingItem] = useState<{ itemId: string; value: string } | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const watchlistToolbarRef = useRef<HTMLDivElement | null>(null);
  const quoteRequestInFlightRef = useRef(false);

  const actions: PanelAction[] = [onRefresh ? { label: t('dashboard.positions.actions.refresh'), onClick: onRefresh } : null].filter(Boolean) as PanelAction[];

  const isClosingPosition = quickCloseStatus === 'loading';
  const isReversingPosition = quickReverseStatus === 'loading';
  const quickActionError = quickCloseStatus === 'failed'
    ? quickCloseError
    : quickReverseStatus === 'failed'
      ? quickReverseError
      : null;

  const watchlistBusy = watchlistStatus === 'loading' || watchlistSaving;

  const headerMeta = (
    <div className={styles.tabBar}>
      <button
        type="button"
        className={`${styles.tabButton} ${activeTab === 'positions' ? styles.tabActive : ''}`.trim()}
        onClick={() => setActiveTab('positions')}
      >
        {t('dashboard.positions.tabs.positions', '持仓')}
      </button>
      <button
        type="button"
        className={`${styles.tabButton} ${activeTab === 'watchlist' ? styles.tabActive : ''}`.trim()}
        onClick={() => setActiveTab('watchlist')}
      >
        {t('dashboard.positions.tabs.watchlist', '自选股')}
      </button>
    </div>
  );

  const sortedWatchlistGroups = useMemo(
    () => [...watchlistGroups].sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name)),
    [watchlistGroups]
  );

  const manualWatchlistGroups = useMemo(
    () => sortedWatchlistGroups.filter((group) => group.groupType === 'manual'),
    [sortedWatchlistGroups]
  );

  const watchlistSymbols = useMemo(() => {
    const seen = new Set<string>();
    for (const group of sortedWatchlistGroups) {
      for (const item of group.items) {
        const symbol = item.symbol.trim().toUpperCase();
        if (symbol) {
          seen.add(symbol);
        }
      }
    }
    return Array.from(seen);
  }, [sortedWatchlistGroups]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(WATCHLIST_COLUMNS_STORAGE_KEY, JSON.stringify(watchlistColumns));
  }, [watchlistColumns]);

  useEffect(() => {
    if (!watchlistAddMenuOpen && !watchlistColumnsMenuOpen) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (!watchlistToolbarRef.current) {
        return;
      }
      if (watchlistToolbarRef.current.contains(event.target as Node)) {
        return;
      }
      setWatchlistAddMenuOpen(false);
      setWatchlistColumnsMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [watchlistAddMenuOpen, watchlistColumnsMenuOpen]);

  useEffect(() => {
    setWatchlistQuotes((previous) => {
      const next: Record<string, WatchlistQuoteSnapshot> = {};
      for (const symbol of watchlistSymbols) {
        const cached = previous[symbol];
        if (cached) {
          next[symbol] = cached;
        }
      }
      if (Object.keys(next).length === Object.keys(previous).length) {
        return previous;
      }
      return next;
    });
  }, [watchlistSymbols]);

  const refreshWatchlistQuotes = useCallback(async () => {
    if (!loadWatchlistQuote || watchlistSymbols.length === 0 || quoteRequestInFlightRef.current) {
      return;
    }
    quoteRequestInFlightRef.current = true;
    try {
      const results = await Promise.allSettled(
        watchlistSymbols.map(async (symbol) => {
          const quote = await loadWatchlistQuote(symbol);
          return { symbol, quote };
        })
      );
      setWatchlistQuotes((previous) => {
        const next: Record<string, WatchlistQuoteSnapshot> = {};
        for (const symbol of watchlistSymbols) {
          const cached = previous[symbol];
          if (cached) {
            next[symbol] = cached;
          }
        }
        for (const result of results) {
          if (result.status !== 'fulfilled') {
            continue;
          }
          const normalizedSymbol = result.value.symbol.toUpperCase();
          const quote = result.value.quote;
          if (!quote) {
            continue;
          }
          next[normalizedSymbol] = {
            ...quote,
            symbol: normalizedSymbol
          };
        }
        return next;
      });
    } finally {
      quoteRequestInFlightRef.current = false;
    }
  }, [loadWatchlistQuote, watchlistSymbols]);

  useEffect(() => {
    if (activeTab !== 'watchlist' || !loadWatchlistQuote || watchlistSymbols.length === 0) {
      return;
    }
    void refreshWatchlistQuotes();
    const timer = window.setInterval(() => {
      void refreshWatchlistQuotes();
    }, WATCHLIST_QUOTE_REFRESH_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [activeTab, loadWatchlistQuote, refreshWatchlistQuotes, watchlistSymbols.length]);

  const reorderGroupToTarget = (sourceGroupId: string, targetGroupId: string) => {
    if (!onReorderWatchlistGroups || sourceGroupId === targetGroupId) {
      return;
    }
    const ids = sortedWatchlistGroups.map((group) => group.id);
    const sourceIndex = ids.indexOf(sourceGroupId);
    const targetIndex = ids.indexOf(targetGroupId);
    if (sourceIndex < 0 || targetIndex < 0) {
      return;
    }
    const [moved] = ids.splice(sourceIndex, 1);
    ids.splice(targetIndex, 0, moved);
    onReorderWatchlistGroups(ids);
  };

  const submitCreateGroup = () => {
    const trimmed = composerGroupName.trim();
    if (!trimmed || !onCreateWatchlistGroup) {
      return;
    }
    onCreateWatchlistGroup(trimmed);
    setComposerGroupName('');
    setComposerMode('none');
  };

  const submitAddSymbol = () => {
    const groupId = composerGroupId.trim();
    const symbol = composerSymbol.trim().toUpperCase();
    if (!groupId || !symbol || !onAddWatchlistItem) {
      return;
    }
    onAddWatchlistItem(groupId, symbol);
    setComposerSymbol('');
    setComposerMode('none');
  };

  const submitRenameGroup = (group: WatchlistGroup) => {
    if (!editingGroup || editingGroup.groupId !== group.id) {
      return;
    }
    const trimmed = editingGroup.value.trim();
    setEditingGroup(null);
    if (!trimmed || trimmed === group.name || !onRenameWatchlistGroup) {
      return;
    }
    onRenameWatchlistGroup(group.id, trimmed);
  };

  const submitRenameItem = (itemId: string, currentSymbol: string) => {
    if (!editingItem || editingItem.itemId !== itemId || !onUpdateWatchlistItem) {
      setEditingItem(null);
      return;
    }
    const trimmed = editingItem.value.trim().toUpperCase();
    setEditingItem(null);
    if (!trimmed || trimmed === currentSymbol) {
      return;
    }
    onUpdateWatchlistItem(itemId, trimmed);
  };

  const toggleGroupCollapsed = (groupId: string) => {
    setCollapsedGroups((previous) => ({
      ...previous,
      [groupId]: !previous[groupId]
    }));
  };

  const updateWatchlistColumn = (index: number, key: WatchlistColumnKey) => {
    setWatchlistColumns((previous) => {
      if (index < 0 || index >= previous.length) {
        return previous;
      }
      if (previous[index] === key) {
        return previous;
      }
      const next = [...previous];
      next[index] = key;
      return next;
    });
  };

  const getQuoteForSymbol = (symbol: string): WatchlistQuoteSnapshot | null => {
    const normalized = symbol.trim().toUpperCase();
    return watchlistQuotes[normalized] ?? null;
  };

  const extractColumnValue = (
    quote: WatchlistQuoteSnapshot | null,
    option: WatchlistColumnOption
  ): number | null => {
    if (!quote) {
      return null;
    }
    const source = quote as unknown as Record<string, unknown>;
    for (const alias of option.aliases) {
      const value = coerceNumber(source[alias]);
      if (value !== null) {
        return value;
      }
    }

    if (option.key === 'change') {
      const last = coerceNumber(quote.last);
      const close = coerceNumber(quote.close);
      if (last !== null && close !== null) {
        return last - close;
      }
    }

    if (option.key === 'changePercent') {
      const change = coerceNumber(quote.change);
      const close = coerceNumber(quote.close);
      if (change !== null && close !== null && Math.abs(close) > 1e-9) {
        return (change / close) * 100;
      }
    }

    return null;
  };

  const formatColumnValue = (
    value: number | null,
    option: WatchlistColumnOption,
    symbol: string,
    quote: WatchlistQuoteSnapshot | null
  ): string => {
    if (value === null || Number.isNaN(value)) {
      return '—';
    }
    const signed = Boolean(option.signed);
    const absolute = signed ? Math.abs(value) : value;

    if (option.kind === 'percent') {
      const text = `${absolute.toFixed(2)}%`;
      return formatSignedValue(value, text, signed);
    }

    if (option.kind === 'price') {
      const reference = coerceNumber(quote?.last) ?? coerceNumber(quote?.close) ?? undefined;
      const priceText = formatPriceWithTick(absolute, symbol, {
        tickSize: resolveTickSize(symbol, symbols),
        reference,
        allowDownscale: true
      });
      return formatSignedValue(value, priceText, signed);
    }

    const maxFractionDigits = Math.abs(absolute) >= 100 ? 2 : 3;
    const text = absolute.toLocaleString(undefined, {
      maximumFractionDigits: maxFractionDigits
    });
    return formatSignedValue(value, text, signed);
  };

  const resolveColumnToneClass = (value: number | null, option: WatchlistColumnOption): string => {
    if (!option.signed || value === null || Math.abs(value) < 1e-9) {
      return '';
    }
    return value > 0 ? styles.valuePositive : styles.valueNegative;
  };

  const renderPositionsTab = () => {
    if (positions.length === 0) {
      return <div className={styles.emptyState}>{t('dashboard.positions.empty')}</div>;
    }
    return (
      <div className={styles.cardsList}>
        {positions.map((position, index) => {
          const quantityValue = position.quantity ?? 0;
          const absoluteQuantity = Math.abs(quantityValue);
          const avgPrice = position.avgPrice ?? 0;
          const notional =
            absoluteQuantity && avgPrice
              ? absoluteQuantity * avgPrice * (position.multiplier ?? 1)
              : null;
          const pnlPercent = notional ? (position.pnl / notional) * 100 : null;
          const formattedPnlPercent = formatPercent(pnlPercent);
          const pnlPercentLabel = formattedPnlPercent === '—' ? '—' : `(${formattedPnlPercent})`;

          return (
            <article key={position.id} className={styles.positionCard}>
              <div className={styles.positionHeader}>
                <button
                  type="button"
                  className={styles.symbolButton}
                  onClick={() => onSelectSymbol(position.symbol)}
                >
                  {position.symbol}
                </button>
                <span
                  className={`${styles.directionTag} ${
                    position.direction === 'long' ? styles.directionLong : styles.directionShort
                  }`}
                >
                  {position.direction === 'long' ? t('dashboard.positions.direction.long') : t('dashboard.positions.direction.short')}
                </span>
              </div>
              <div className={styles.positionDetails}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>{t('dashboard.positions.labels.quantity')}</span>
                  <span className={styles.detailValue}>{position.quantity.toLocaleString()}</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>{t('dashboard.positions.labels.avg_price')}</span>
                  <span className={styles.detailValue}>
                    {formatPriceWithTick(position.avgPrice, position.symbol, {
                      tickSize: resolveTickSize(position.symbol, symbols),
                      reference: position.markPrice ?? undefined,
                      allowDownscale: true
                    })}
                  </span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>{t('dashboard.positions.labels.mark_price')}</span>
                  <span className={styles.detailValue}>
                    {formatPriceWithTick(position.markPrice, position.symbol, {
                      tickSize: resolveTickSize(position.symbol, symbols)
                    })}
                  </span>
                </div>
                <div className={`${styles.detailItem} ${styles.pnlItem}`}>
                  <span className={styles.detailLabel}>{t('dashboard.positions.labels.pnl')}</span>
                  <span
                    className={`${styles.detailValue} ${
                      position.pnl >= 0 ? styles.pnlPositive : styles.pnlNegative
                    }`}
                  >
                    <span className={styles.pnlAmount}>{position.pnl.toFixed(2)}</span>
                    <span className={styles.pnlPercent}>{pnlPercentLabel}</span>
                  </span>
                </div>
              </div>
              <div className={styles.cardFooter}>
                {(onQuickClosePosition || onQuickReversePosition) && (
                  <div className={styles.quickActions}>
                    {onQuickClosePosition && (
                      <button
                        type="button"
                        className={styles.quickButton}
                        onClick={() => onQuickClosePosition(position.symbol, position)}
                        disabled={isClosingPosition || isReversingPosition}
                      >
                        {isClosingPosition ? t('dashboard.positions.quick.closing') : t('dashboard.positions.quick.close')}
                      </button>
                    )}
                    {onQuickReversePosition && (
                      <button
                        type="button"
                        className={styles.quickButton}
                        onClick={() => onQuickReversePosition(position.symbol, position)}
                        disabled={isClosingPosition || isReversingPosition}
                      >
                        {isReversingPosition ? t('dashboard.positions.quick.reversing') : t('dashboard.positions.quick.reverse')}
                      </button>
                    )}
                  </div>
                )}
                {quickActionError && index === 0 ? (
                  <div className={styles.quickError} role="alert">
                    {quickActionError}
                  </div>
                ) : null}
                <button
                  type="button"
                  className={styles.riskButton}
                  onClick={() => onConfigureRiskRule(position)}
                >
                  {t('dashboard.positions.configure_risk')}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    );
  };

  const renderWatchlistTab = () => {
    const quotePending = activeTab === 'watchlist' && Boolean(loadWatchlistQuote) && watchlistSymbols.length > 0 && Object.keys(watchlistQuotes).length === 0;

    return (
      <div className={styles.watchlistSection}>
        <div className={styles.watchlistToolbar} ref={watchlistToolbarRef}>
          <div className={styles.watchlistTitle}>Watchlist</div>
          <div className={styles.watchlistToolbarActions}>
            <button
              type="button"
              className={styles.watchlistIconButton}
              title={t('dashboard.positions.watchlist.add', '添加')}
              onClick={() => {
                setWatchlistAddMenuOpen((previous) => !previous);
                setWatchlistColumnsMenuOpen(false);
              }}
              disabled={watchlistBusy || !onCreateWatchlistGroup}
            >
              +
            </button>
            <button
              type="button"
              className={styles.watchlistIconButton}
              title={t('dashboard.positions.watchlist.columns', '列设置')}
              onClick={() => {
                setWatchlistColumnsMenuOpen((previous) => !previous);
                setWatchlistAddMenuOpen(false);
              }}
            >
              ...
            </button>
          </div>

          {watchlistAddMenuOpen ? (
            <div className={styles.watchlistMenu}>
              <button
                type="button"
                className={styles.watchlistMenuButton}
                onClick={() => {
                  setComposerMode('group');
                  setComposerGroupName('');
                  setWatchlistAddMenuOpen(false);
                }}
              >
                {t('dashboard.positions.watchlist.create_group', '添加分组')}
              </button>
              <button
                type="button"
                className={styles.watchlistMenuButton}
                onClick={() => {
                  setComposerMode('symbol');
                  setComposerSymbol('');
                  setComposerGroupId((previous) => {
                    if (manualWatchlistGroups.some((group) => group.id === previous)) {
                      return previous;
                    }
                    return manualWatchlistGroups[0]?.id ?? '';
                  });
                  setWatchlistAddMenuOpen(false);
                }}
                disabled={manualWatchlistGroups.length === 0}
              >
                {t('dashboard.positions.watchlist.add_symbol', '添加 Symbol')}
              </button>
            </div>
          ) : null}

          {watchlistColumnsMenuOpen ? (
            <div className={`${styles.watchlistMenu} ${styles.watchlistColumnsMenu}`}>
              {watchlistColumns.map((column, index) => {
                const slotLabel = `${t('dashboard.positions.watchlist.column_slot', '列')} ${index + 1}`;
                return (
                  <label key={`${column}-${index}`} className={styles.watchlistColumnsRow}>
                    <span className={styles.watchlistColumnsLabel}>{slotLabel}</span>
                    <select
                      className={styles.watchlistColumnsSelect}
                      value={column}
                      onChange={(event) => updateWatchlistColumn(index, event.target.value as WatchlistColumnKey)}
                    >
                      {WATCHLIST_COLUMN_OPTIONS.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                );
              })}
            </div>
          ) : null}
        </div>

        {composerMode === 'group' ? (
          <div className={styles.watchlistComposerRow}>
            <input
              type="text"
              className={styles.watchlistInput}
              placeholder={t('dashboard.positions.watchlist.group_placeholder', '新分组名称')}
              value={composerGroupName}
              onChange={(event) => setComposerGroupName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitCreateGroup();
                }
                if (event.key === 'Escape') {
                  setComposerMode('none');
                }
              }}
              disabled={watchlistBusy || !onCreateWatchlistGroup}
            />
            <button
              type="button"
              className={styles.watchlistActionButton}
              onClick={submitCreateGroup}
              disabled={watchlistBusy || !composerGroupName.trim() || !onCreateWatchlistGroup}
            >
              {t('dashboard.common.save', '保存')}
            </button>
            <button
              type="button"
              className={styles.watchlistGhostButton}
              onClick={() => setComposerMode('none')}
            >
              {t('dashboard.common.cancel', '取消')}
            </button>
          </div>
        ) : null}

        {composerMode === 'symbol' ? (
          <div className={styles.watchlistComposerRow}>
            <select
              className={styles.watchlistSelect}
              value={composerGroupId}
              onChange={(event) => setComposerGroupId(event.target.value)}
              disabled={watchlistBusy || manualWatchlistGroups.length === 0}
            >
              {manualWatchlistGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              className={styles.watchlistInput}
              placeholder={t('dashboard.positions.watchlist.symbol_placeholder', '输入 symbol，例如 AAPL')}
              value={composerSymbol}
              onChange={(event) => setComposerSymbol(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  submitAddSymbol();
                }
                if (event.key === 'Escape') {
                  setComposerMode('none');
                }
              }}
              disabled={watchlistBusy || !onAddWatchlistItem || manualWatchlistGroups.length === 0}
            />
            <button
              type="button"
              className={styles.watchlistActionButton}
              onClick={submitAddSymbol}
              disabled={
                watchlistBusy ||
                !composerGroupId ||
                !composerSymbol.trim() ||
                !onAddWatchlistItem ||
                manualWatchlistGroups.length === 0
              }
            >
              {t('dashboard.common.save', '保存')}
            </button>
            <button
              type="button"
              className={styles.watchlistGhostButton}
              onClick={() => setComposerMode('none')}
            >
              {t('dashboard.common.cancel', '取消')}
            </button>
          </div>
        ) : null}

        {watchlistError ? <div className={styles.watchlistError}>{watchlistError}</div> : null}

        {watchlistStatus === 'loading' && sortedWatchlistGroups.length === 0 ? (
          <div className={styles.emptyState}>{t('dashboard.positions.watchlist.loading', '加载自选股中...')}</div>
        ) : null}

        {sortedWatchlistGroups.length === 0 && watchlistStatus !== 'loading' ? (
          <div className={styles.emptyState}>{t('dashboard.positions.watchlist.empty', '暂无自选股分组')}</div>
        ) : null}

        {quotePending ? (
          <div className={styles.watchlistQuoteHint}>{t('dashboard.positions.watchlist.quote_loading', '更新报价中...')}</div>
        ) : null}

        {sortedWatchlistGroups.length > 0 ? (
          <div className={styles.watchlistTable}>
            <div className={styles.watchlistHeaderRow}>
              <div className={styles.watchlistHeaderCell}>{t('dashboard.positions.watchlist.columns.symbol', 'Symbol')}</div>
              {watchlistColumns.map((column, columnIndex) => (
                <div key={`${column}-${columnIndex}`} className={styles.watchlistHeaderCell}>
                  {WATCHLIST_COLUMN_OPTION_MAP[column].label}
                </div>
              ))}
            </div>

            {sortedWatchlistGroups.map((group) => {
              const isManual = group.groupType === 'manual';
              const groupCollapsed = Boolean(collapsedGroups[group.id]);
              const groupBadge = isManual
                ? t('dashboard.positions.watchlist.group_type.manual', '手动')
                : t('dashboard.positions.watchlist.group_type.screener', '策略');

              return (
                <section
                  key={group.id}
                  className={styles.watchlistGroupBlock}
                  draggable={Boolean(onReorderWatchlistGroups)}
                  onDragStart={(event) => {
                    if (!onReorderWatchlistGroups) {
                      return;
                    }
                    event.dataTransfer.setData('text/plain', `group:${group.id}`);
                    event.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(event) => {
                    if (!onReorderWatchlistGroups && !(isManual && onMoveWatchlistItem)) {
                      return;
                    }
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const itemData = parseItemDragData(event);
                    if (itemData && isManual && onMoveWatchlistItem) {
                      onMoveWatchlistItem(itemData.itemId, group.id, group.items.length);
                      return;
                    }
                    const sourceGroupId = parseGroupDragData(event);
                    if (!sourceGroupId) {
                      return;
                    }
                    reorderGroupToTarget(sourceGroupId, group.id);
                  }}
                >
                  <div className={styles.watchlistGroupBar}>
                    <button
                      type="button"
                      className={styles.watchlistCollapseButton}
                      onClick={() => toggleGroupCollapsed(group.id)}
                      title={groupCollapsed ? t('dashboard.common.expand', '展开') : t('dashboard.common.collapse', '收起')}
                    >
                      {groupCollapsed ? '>' : 'v'}
                    </button>
                    <span className={styles.watchlistDragHandle}>==</span>
                    {editingGroup?.groupId === group.id ? (
                      <input
                        type="text"
                        className={styles.watchlistInlineInput}
                        value={editingGroup.value}
                        onChange={(event) =>
                          setEditingGroup({
                            groupId: group.id,
                            value: event.target.value
                          })
                        }
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            submitRenameGroup(group);
                          }
                          if (event.key === 'Escape') {
                            setEditingGroup(null);
                          }
                        }}
                        onBlur={() => setEditingGroup(null)}
                        autoFocus
                      />
                    ) : (
                      <button
                        type="button"
                        className={styles.watchlistGroupTitleButton}
                        onDoubleClick={() => {
                          if (!isManual || !onRenameWatchlistGroup || watchlistBusy) {
                            return;
                          }
                          setEditingGroup({ groupId: group.id, value: group.name });
                        }}
                      >
                        {group.name}
                      </button>
                    )}
                    <span
                      className={`${styles.groupTypeBadge} ${isManual ? styles.groupTypeManual : styles.groupTypeScreener}`}
                    >
                      {groupBadge}
                    </span>
                    {isManual ? (
                      <button
                        type="button"
                        className={styles.watchlistDeleteButton}
                        onClick={() => onDeleteWatchlistGroup?.(group.id)}
                        disabled={watchlistBusy || !onDeleteWatchlistGroup}
                      >
                        Del
                      </button>
                    ) : null}
                  </div>

                  {!groupCollapsed ? (
                    <div
                      className={styles.watchlistRows}
                      onDragOver={(event) => {
                        if (!isManual || !onMoveWatchlistItem) {
                          return;
                        }
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'move';
                      }}
                      onDrop={(event) => {
                        if (!isManual || !onMoveWatchlistItem) {
                          return;
                        }
                        event.preventDefault();
                        const data = parseItemDragData(event);
                        if (!data) {
                          return;
                        }
                        onMoveWatchlistItem(data.itemId, group.id, group.items.length);
                      }}
                    >
                      {group.items.length === 0 ? (
                        <div className={styles.watchlistEmptyGroup}>{t('dashboard.positions.watchlist.empty_group', '该分组暂无 symbol')}</div>
                      ) : null}

                      {group.items.map((item, index) => {
                        const quote = getQuoteForSymbol(item.symbol);
                        const isEditingItem = editingItem?.itemId === item.id;

                        return (
                          <div
                            key={item.id}
                            className={styles.watchlistQuoteRow}
                            draggable={isManual && Boolean(onMoveWatchlistItem)}
                            onDragStart={(event) => {
                              if (!isManual || !onMoveWatchlistItem) {
                                return;
                              }
                              event.dataTransfer.setData('text/plain', `item:${item.id}:${group.id}`);
                              event.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragOver={(event) => {
                              if (!isManual || !onMoveWatchlistItem) {
                                return;
                              }
                              event.preventDefault();
                              event.dataTransfer.dropEffect = 'move';
                            }}
                            onDrop={(event) => {
                              if (!isManual || !onMoveWatchlistItem) {
                                return;
                              }
                              event.preventDefault();
                              event.stopPropagation();
                              const data = parseItemDragData(event);
                              if (!data) {
                                return;
                              }
                              onMoveWatchlistItem(data.itemId, group.id, index);
                            }}
                          >
                            <div className={styles.watchlistSymbolCell}>
                              <span className={styles.watchlistDragHandle}>::</span>
                              {isEditingItem ? (
                                <input
                                  type="text"
                                  className={styles.watchlistInlineInput}
                                  value={editingItem.value}
                                  onChange={(event) =>
                                    setEditingItem({ itemId: item.id, value: event.target.value })
                                  }
                                  onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                      event.preventDefault();
                                      submitRenameItem(item.id, item.symbol);
                                    }
                                    if (event.key === 'Escape') {
                                      setEditingItem(null);
                                    }
                                  }}
                                  onBlur={() => setEditingItem(null)}
                                  autoFocus
                                />
                              ) : (
                                <button
                                  type="button"
                                  className={styles.watchlistSymbolButton}
                                  onClick={() => onSelectSymbol(item.symbol)}
                                  onDoubleClick={() => {
                                    if (!isManual || !onUpdateWatchlistItem || watchlistBusy) {
                                      return;
                                    }
                                    setEditingItem({ itemId: item.id, value: item.symbol });
                                  }}
                                >
                                  {item.symbol}
                                </button>
                              )}
                              {isManual ? (
                                <button
                                  type="button"
                                  className={styles.watchlistDeleteButton}
                                  onClick={() => onDeleteWatchlistItem?.(item.id)}
                                  disabled={watchlistBusy || !onDeleteWatchlistItem}
                                >
                                  Del
                                </button>
                              ) : null}
                            </div>

                            {watchlistColumns.map((column, columnIndex) => {
                              const option = WATCHLIST_COLUMN_OPTION_MAP[column];
                              const value = extractColumnValue(quote, option);
                              const display = formatColumnValue(value, option, item.symbol, quote);
                              const toneClass = resolveColumnToneClass(value, option);

                              return (
                                <div
                                  key={`${item.id}-${column}-${columnIndex}`}
                                  className={`${styles.watchlistValueCell} ${toneClass}`.trim()}
                                  title={display}
                                >
                                  {display}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </section>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <PanelCard
      title={t('dashboard.positions.title')}
      actions={actions}
      className={styles.card}
      headerMeta={headerMeta}
    >
      {activeTab === 'positions' ? renderPositionsTab() : renderWatchlistTab()}
    </PanelCard>
  );
}

export default PositionsPanel;
