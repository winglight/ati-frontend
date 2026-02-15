import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import clsx from 'clsx';
import { listPnLCalendarTrades, type PnLCalendarTrade } from '@services/pnlCalendarApi';
import { useAppSelector } from '@store/hooks';
import { useTranslation } from '@i18n';
import layoutStyles from '../PageLayout.module.css';
import styles from './PnLCalendarPage.module.css';
import StatsCards from './StatsCards';
import ChartsSection from './ChartsSection';
import Modal from '@components/modals/Modal';
import LogSidebar from './LogSidebar';
import LogModal from './LogModal';
import { formatDateKey, getMonthLayout } from '@features/strategies/utils/dateAggregation';
import { extractBaseSymbol } from '@utils/symbols';
import {
  createTradeLog,
  deleteTradeLog,
  listTradeLogs,
  updateTradeLog,
  type TradeLogPayload,
  type TradeLogRecord
} from '@services/tradeLogsApi';

const WEEKDAYS: Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'> = [
  'mon',
  'tue',
  'wed',
  'thu',
  'fri',
  'sat',
  'sun'
];

interface MergedTradeGroup {
  key: string;
  date: string;
  symbol: string;
  instrument: string | null;
  side: 'Long' | 'Short';
  tradeTimes: number;
  netPnl: number;
  winCount: number;
  absPnl: number;
  openDateTime: string | null;
  trades: PnLCalendarTrade[];
}

interface DayAggregate {
  date: string;
  netPnl: number;
  tradeCount: number;
  symbolCount: number;
  winRate: number | null;
  roi: number | null;
  trades: PnLCalendarTrade[];
  groups: MergedTradeGroup[];
}

const QUICK_RANGES = [
  { key: 'week', labelKey: 'pnl_calendar.filters.range_week' },
  { key: 'month', labelKey: 'pnl_calendar.filters.range_month' },
  { key: 'last30', labelKey: 'pnl_calendar.filters.range_last30' },
  { key: 'quarter', labelKey: 'pnl_calendar.filters.range_quarter' },
  { key: 'ytd', labelKey: 'pnl_calendar.filters.range_ytd' }
];

const resolveTradeDurationMinutes = (openTime?: string | null, closeTime?: string | null): number | null => {
  if (!openTime || !closeTime) {
    return null;
  }
  const open = new Date(openTime).valueOf();
  const close = new Date(closeTime).valueOf();
  if (Number.isNaN(open) || Number.isNaN(close) || close < open) {
    return null;
  }
  return (close - open) / 60000;
};

const resolveNetRoi = (netPnl: number, absPnl: number): number | null => {
  if (!absPnl) {
    return null;
  }
  return netPnl / absPnl;
};

const parseDateKey = (value: string): Date | null => {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
};

const buildMonthWeeks = (year: number, monthIndex: number): (string | null)[][] => {
  const { leadingWeekday, totalDays } = getMonthLayout(year, monthIndex);
  const cells: (string | null)[] = [];
  for (let index = 0; index < leadingWeekday; index += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= totalDays; day += 1) {
    const dateKey = formatDateKey(new Date(year, monthIndex, day));
    cells.push(dateKey);
  }
  const trailing = (7 - (cells.length % 7 || 7)) % 7;
  for (let index = 0; index < trailing; index += 1) {
    cells.push(null);
  }
  const weeks: (string | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
};

const formatDateInput = (value: Date): string => formatDateKey(value);

const startOfWeek = (value: Date): Date => {
  const day = value.getDay();
  const offset = (day + 6) % 7;
  const start = new Date(value);
  start.setDate(value.getDate() - offset);
  start.setHours(0, 0, 0, 0);
  return start;
};

const startOfMonth = (value: Date): Date => new Date(value.getFullYear(), value.getMonth(), 1);

const startOfQuarter = (value: Date): Date => {
  const quarterStartMonth = Math.floor(value.getMonth() / 3) * 3;
  return new Date(value.getFullYear(), quarterStartMonth, 1);
};

const startOfYear = (value: Date): Date => new Date(value.getFullYear(), 0, 1);

const formatChartLabel = (value: string): string => value.slice(5);

const resolveStrategyLabel = (trade: PnLCalendarTrade): string => {
  const label = trade.StrategyName || trade.Strategy || '';
  return typeof label === 'string' ? label.trim() : '';
};

const sortTradeLogs = (logs: TradeLogRecord[]): TradeLogRecord[] =>
  [...logs].sort((a, b) => {
    const dateCompare = b.date.localeCompare(a.date);
    if (dateCompare !== 0) {
      return dateCompare;
    }
    if (a.id !== undefined && b.id !== undefined) {
      return b.id - a.id;
    }
    return 0;
  });

function PnLCalendarPage() {
  const token = useAppSelector((state) => state.auth.token);
  const authUser = useAppSelector((state) => state.auth.user);
  const accountSummary = useAppSelector((state) => state.account.summary);
  const { t, i18n } = useTranslation();
  const [allTrades, setAllTrades] = useState<PnLCalendarTrade[]>([]);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [symbolFilter, setSymbolFilter] = useState('');
  const [strategyFilter, setStrategyFilter] = useState('all');
  const [activeRangeKey, setActiveRangeKey] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [detailGroupKey, setDetailGroupKey] = useState<string | null>(null);
  const [monthAnchor, setMonthAnchor] = useState<Date>(() => new Date());
  const monthLockedRef = useRef(false);
  const [tradeLogs, setTradeLogs] = useState<TradeLogRecord[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logModalOpen, setLogModalOpen] = useState(false);
  const [logModalMode, setLogModalMode] = useState<'create' | 'view' | 'edit'>('create');
  const [activeLog, setActiveLog] = useState<TradeLogRecord | null>(null);
  const [logDate, setLogDate] = useState<string | null>(null);
  const [showLogSidebar, setShowLogSidebar] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const locale = i18n.language === 'en' ? 'en-US' : 'zh-CN';

  const formatPnlValue = (value: number): string => {
    const formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    const sign = value > 0 ? '+' : '';
    return `${sign}${formatter.format(value)}`;
  };

  const formatPercent = (value: number | null): string => {
    if (value === null) {
      return '';
    }
    const percent = value * 100;
    return `${percent.toFixed(1)}%`;
  };

  const formatDateTime = (value?: string | null): string => {
    if (!value) {
      return t('pnl_calendar.common.empty');
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.valueOf())) {
      return value;
    }
    return parsed.toLocaleString(locale, { hour12: false });
  };

  const formatInstrument = (value?: string | null): string => {
    if (!value) {
      return t('pnl_calendar.common.empty');
    }
    const trimmed = value.trim();
    return trimmed || t('pnl_calendar.common.empty');
  };

  const formatTradeDuration = (minutes: number | null): string => {
    if (minutes === null) {
      return t('pnl_calendar.common.empty');
    }
    const rounded = Math.max(Math.round(minutes), 1);
    if (rounded < 60) {
      return t('pnl_calendar.duration.minutes', { count: rounded });
    }
    const hours = Math.floor(rounded / 60);
    const remaining = rounded % 60;
    if (!remaining) {
      return t('pnl_calendar.duration.hours', { count: hours });
    }
    return t('pnl_calendar.duration.hours_minutes', { hours, minutes: remaining });
  };

  const formatDayNumber = (date: string): string => {
    const parsed = parseDateKey(date);
    return parsed ? String(parsed.getDate()) : date.split('-').pop() ?? date;
  };

  const deriveOverallFeeling = useCallback((netPnl: number, tradeCount: number): string => {
    if (tradeCount === 0) {
      return t('pnl_calendar.overview.feeling_none');
    }
    if (netPnl > 0) {
      return t('pnl_calendar.overview.feeling_positive');
    }
    if (netPnl < 0) {
      return t('pnl_calendar.overview.feeling_negative');
    }
    return t('pnl_calendar.overview.feeling_flat');
  }, [t]);

  useEffect(() => {
    let active = true;

    if (!token) {
      setAllTrades([]);
      return () => {
        active = false;
      };
    }

    listPnLCalendarTrades(token)
      .then((trades) => {
        if (!active) {
          return;
        }
        setAllTrades(trades);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setAllTrades([]);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const strategyOptions = useMemo(() => {
    const strategies = new Set<string>();
    allTrades.forEach((trade) => {
      const label = resolveStrategyLabel(trade);
      if (label) {
        strategies.add(label);
      }
    });
    return Array.from(strategies).sort((a, b) => a.localeCompare(b));
  }, [allTrades]);

  const baseSymbolOptions = useMemo(() => {
    const symbols = new Set<string>();
    allTrades.forEach((trade) => {
      const base = extractBaseSymbol(trade.Symbol || '');
      if (base) {
        symbols.add(base);
      }
    });
    return Array.from(symbols).sort((a, b) => a.localeCompare(b));
  }, [allTrades]);

  const baseSymbolSuggestions = useMemo(
    () =>
      baseSymbolOptions.flatMap((symbol) => {
        const trimmed = symbol.trim();
        if (!trimmed) {
          return [];
        }
        return [trimmed, `${trimmed}*`];
      }),
    [baseSymbolOptions]
  );

  const filteredTrades = useMemo(() => {
    const trimmedSymbol = symbolFilter.trim().toUpperCase();
    const isPrefix = trimmedSymbol.endsWith('*');
    const symbolQuery = isPrefix ? trimmedSymbol.slice(0, -1) : trimmedSymbol;

    return allTrades.filter((trade) => {
      const date = trade.TradeDate;
      if ((dateRange.start || dateRange.end) && !date) {
        return false;
      }
      if (dateRange.start && date && date < dateRange.start) {
        return false;
      }
      if (dateRange.end && date && date > dateRange.end) {
        return false;
      }

      if (symbolQuery) {
        const base = extractBaseSymbol(trade.Symbol);
        if (isPrefix) {
          if (!base.startsWith(symbolQuery)) {
            return false;
          }
        } else if (base !== symbolQuery) {
          return false;
        }
      }

      if (strategyFilter !== 'all') {
        const label = resolveStrategyLabel(trade);
        if (!label || label !== strategyFilter) {
          return false;
        }
      }

      return true;
    });
  }, [allTrades, dateRange.end, dateRange.start, strategyFilter, symbolFilter]);

  const { dayMap, tradeDates } = useMemo(() => {
    const groupMap = new Map<string, MergedTradeGroup>();
    const dayStore = new Map<
      string,
      DayAggregate & { symbolSet: Set<string>; winCount: number; absPnl: number }
    >();

    filteredTrades.forEach((trade) => {
      if (!trade.TradeDate) {
        return;
      }
      const date = trade.TradeDate;
      const symbol = trade.Symbol || '—';
      const instrument = trade.Instrument ?? null;
      const key = `${date}__${symbol}`;
      const pnl = trade.FifoPnlRealized ?? 0;
      const side = trade['Buy/Sell'] === 'Buy' ? 'Long' : 'Short';

      let group = groupMap.get(key);
      if (!group) {
        group = {
          key,
          date,
          symbol,
          instrument,
          side,
          tradeTimes: 0,
          netPnl: 0,
          winCount: 0,
          absPnl: 0,
          openDateTime: trade.OpenDateTime ?? null,
          trades: []
        };
        groupMap.set(key, group);
      }

      group.tradeTimes += 1;
      group.netPnl += pnl;
      group.winCount += pnl > 0 ? 1 : 0;
      group.absPnl += Math.abs(pnl);
      if (!group.instrument && instrument) {
        group.instrument = instrument;
      }
      if (trade.OpenDateTime) {
        if (!group.openDateTime || trade.OpenDateTime < group.openDateTime) {
          group.openDateTime = trade.OpenDateTime;
        }
      }
      group.trades.push(trade);

      let day = dayStore.get(date);
      if (!day) {
        day = {
          date,
          netPnl: 0,
          tradeCount: 0,
          symbolCount: 0,
          winRate: null,
          roi: null,
          trades: [],
          groups: [],
          symbolSet: new Set<string>(),
          winCount: 0,
          absPnl: 0
        };
        dayStore.set(date, day);
      }

      day.netPnl += pnl;
      day.tradeCount += 1;
      day.winCount += pnl > 0 ? 1 : 0;
      day.absPnl += Math.abs(pnl);
      day.trades.push(trade);
      day.symbolSet.add(symbol);
    });

    for (const group of groupMap.values()) {
      const day = dayStore.get(group.date);
      if (day) {
        day.groups.push(group);
      }
    }

    const dayMapFinal = new Map<string, DayAggregate>();
    for (const [date, day] of dayStore.entries()) {
      dayMapFinal.set(date, {
        date,
        netPnl: day.netPnl,
        tradeCount: day.tradeCount,
        symbolCount: day.symbolSet.size,
        winRate: day.tradeCount ? day.winCount / day.tradeCount : null,
        roi: day.absPnl ? day.netPnl / day.absPnl : null,
        trades: day.trades,
        groups: day.groups.sort((a, b) => b.netPnl - a.netPnl)
      });
    }

    const tradeDates = Array.from(dayMapFinal.keys()).sort();

    return {
      dayMap: dayMapFinal,
      tradeDates
    };
  }, [filteredTrades]);

  useEffect(() => {
    if (monthLockedRef.current) {
      return;
    }
    if (tradeDates.length === 0) {
      return;
    }
    const lastTradeDate = tradeDates[tradeDates.length - 1];
    const parsed = parseDateKey(lastTradeDate);
    if (parsed) {
      setMonthAnchor(parsed);
    }
  }, [tradeDates]);

  useEffect(() => {
    if (selectedDate && !dayMap.has(selectedDate)) {
      setSelectedDate(null);
      setDetailGroupKey(null);
    }
  }, [dayMap, selectedDate]);

  const logRange = useMemo(() => {
    const monthStart = formatDateKey(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), 1));
    const monthEnd = formatDateKey(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0));
    return {
      start: dateRange.start || monthStart,
      end: dateRange.end || monthEnd
    };
  }, [dateRange.end, dateRange.start, monthAnchor]);

  const tradeLogIdentity = useMemo(
    () => ({
      userId: authUser?.username,
      accountId: accountSummary?.accountId
    }),
    [accountSummary?.accountId, authUser?.username]
  );

  useEffect(() => {
    let active = true;
    if (!token) {
      setTradeLogs([]);
      return () => {
        active = false;
      };
    }
    setLogsLoading(true);
    listTradeLogs(token, logRange, tradeLogIdentity)
      .then((logs) => {
        if (!active) {
          return;
        }
        setTradeLogs(sortTradeLogs(logs));
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setTradeLogs([]);
      })
      .finally(() => {
        if (!active) {
          return;
        }
        setLogsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [logRange, token, tradeLogIdentity]);

  const monthYear = monthAnchor.getFullYear();
  const monthIndex = monthAnchor.getMonth();
  const monthLabel = `${monthYear}-${String(monthIndex + 1).padStart(2, '0')}`;
  const monthWeeks = useMemo(() => buildMonthWeeks(monthYear, monthIndex), [monthYear, monthIndex]);

  const monthSummary = useMemo(() => {
    let netPnl = 0;
    let tradeCount = 0;
    let winCount = 0;
    let absPnl = 0;
    const symbols = new Set<string>();

    for (const [date, day] of dayMap.entries()) {
      if (!date.startsWith(monthLabel)) {
        continue;
      }
      netPnl += day.netPnl;
      tradeCount += day.tradeCount;
      winCount += day.trades.filter((trade) => trade.FifoPnlRealized > 0).length;
      absPnl += day.trades.reduce((sum, trade) => sum + Math.abs(trade.FifoPnlRealized ?? 0), 0);
      day.trades.forEach((trade) => symbols.add(trade.Symbol));
    }

    return {
      netPnl,
      tradeCount,
      symbolCount: symbols.size,
      winRate: tradeCount ? winCount / tradeCount : null,
      roi: absPnl ? netPnl / absPnl : null
    };
  }, [dayMap, monthLabel]);

  const selectedDay = selectedDate ? dayMap.get(selectedDate) : null;
  const logDay = logDate ? dayMap.get(logDate) : null;
  const logWeekTradeIds = useMemo(() => {
    if (!logDate) {
      return [];
    }
    const parsed = parseDateKey(logDate);
    if (!parsed) {
      return [];
    }
    const weekStart = startOfWeek(parsed);
    const weekStartKey = formatDateKey(weekStart);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekEndKey = formatDateKey(weekEnd);
    return filteredTrades
      .filter((trade) => trade.TradeDate && trade.TradeDate >= weekStartKey && trade.TradeDate <= weekEndKey)
      .map((trade) => trade.TransactionID);
  }, [filteredTrades, logDate]);

  const dailyDefaults = useMemo(() => {
    const tradeCount = logDay?.tradeCount ?? 0;
    const netPnl = logDay?.netPnl ?? 0;
    const associatedTrades = logDay?.trades.map((trade) => trade.TransactionID) ?? [];
    return {
      date: logDate ?? formatDateKey(new Date()),
      tradesCount: tradeCount,
      overallFeeling: deriveOverallFeeling(netPnl, tradeCount),
      associatedTrades
    };
  }, [deriveOverallFeeling, logDate, logDay]);

  const weeklyDefaults = useMemo(() => ({ associatedTrades: logWeekTradeIds }), [logWeekTradeIds]);

  const stats = useMemo(() => {
    const totalTrades = filteredTrades.length;
    let netPnl = 0;
    let winCount = 0;
    let lossCount = 0;
    let totalWin = 0;
    let totalLoss = 0;
    let durationSum = 0;
    let durationCount = 0;

    filteredTrades.forEach((trade) => {
      const pnl = trade.FifoPnlRealized ?? 0;
      netPnl += pnl;
      if (pnl > 0) {
        winCount += 1;
        totalWin += pnl;
      } else if (pnl < 0) {
        lossCount += 1;
        totalLoss += pnl;
      }

      if (trade.OpenDateTime && trade.DateTime) {
        const openTime = new Date(trade.OpenDateTime).valueOf();
        const closeTime = new Date(trade.DateTime).valueOf();
        if (!Number.isNaN(openTime) && !Number.isNaN(closeTime) && closeTime >= openTime) {
          durationSum += (closeTime - openTime) / 60000;
          durationCount += 1;
        }
      }
    });

    let cumulative = 0;
    let peak = 0;
    let maxDrawdown = 0;

    tradeDates.forEach((date) => {
      const day = dayMap.get(date);
      if (!day) {
        return;
      }
      cumulative += day.netPnl;
      if (cumulative > peak) {
        peak = cumulative;
      }
      const drawdown = cumulative - peak;
      if (drawdown < maxDrawdown) {
        maxDrawdown = drawdown;
      }
    });

    let dayWinCount = 0;
    let dayLossCount = 0;
    let dayFlatCount = 0;
    tradeDates.forEach((date) => {
      const day = dayMap.get(date);
      if (!day) {
        return;
      }
      if (day.netPnl > 0) {
        dayWinCount += 1;
      } else if (day.netPnl < 0) {
        dayLossCount += 1;
      } else {
        dayFlatCount += 1;
      }
    });

    const tradeFlatCount = totalTrades - winCount - lossCount;
    const avgWin = winCount ? totalWin / winCount : null;
    const avgLoss = lossCount ? Math.abs(totalLoss) / lossCount : null;

    return {
      netPnl,
      totalTrades,
      winRate: totalTrades ? winCount / totalTrades : null,
      avgTradePnl: totalTrades ? netPnl / totalTrades : null,
      profitFactor: totalLoss ? totalWin / Math.abs(totalLoss) : null,
      avgWinLossRatio: avgWin !== null && avgLoss ? avgWin / avgLoss : null,
      maxDrawdown: tradeDates.length ? maxDrawdown : null,
      avgDurationMinutes: durationCount ? durationSum / durationCount : null,
      avgDailyPnl: tradeDates.length ? netPnl / tradeDates.length : null,
      profitDayRate: tradeDates.length ? dayWinCount / tradeDates.length : null,
      winCount,
      lossCount,
      flatCount: tradeFlatCount,
      dayWinCount,
      dayLossCount,
      dayFlatCount
    };
  }, [dayMap, filteredTrades, tradeDates]);

  const chartsData = useMemo(() => {
    const dailyLabels = tradeDates.map(formatChartLabel);
    const dailyNetValues = tradeDates.map((date) => dayMap.get(date)?.netPnl ?? 0);
    const dailyCumulative = [];
    const dailyDrawdown = [];
    let cumulative = 0;
    let peak = 0;

    for (const net of dailyNetValues) {
      cumulative += net;
      dailyCumulative.push(cumulative);
      if (cumulative > peak) {
        peak = cumulative;
      }
      dailyDrawdown.push(cumulative - peak);
    }

    const durationBuckets = [
      { label: '0-15m', min: 0, max: 15 },
      { label: '15-30m', min: 15, max: 30 },
      { label: '30-60m', min: 30, max: 60 },
      { label: '1-2h', min: 60, max: 120 },
      { label: '2-4h', min: 120, max: 240 },
      { label: '4h+', min: 240, max: Infinity }
    ];
    const durationStats = durationBuckets.map(() => ({
      net: 0,
      trades: 0,
      wins: 0
    }));

    const hourStats = Array.from({ length: 24 }, () => ({
      net: 0,
      trades: 0,
      wins: 0
    }));

    const symbolMap = new Map<string, number>();
    const symbolStatsMap = new Map<string, { net: number; profit: number; loss: number; trades: number }>();
    const weekMap = new Map<
      string,
      { net: number; trades: number; wins: number; losses: number; profitAmount: number; lossAmount: number }
    >();

    filteredTrades.forEach((trade) => {
      const pnl = trade.FifoPnlRealized ?? 0;
      if (trade.OpenDateTime && trade.DateTime) {
        const openTime = new Date(trade.OpenDateTime).valueOf();
        const closeTime = new Date(trade.DateTime).valueOf();
        if (!Number.isNaN(openTime) && !Number.isNaN(closeTime) && closeTime >= openTime) {
          const duration = (closeTime - openTime) / 60000;
          const bucketIndex = durationBuckets.findIndex((bucket) => duration >= bucket.min && duration < bucket.max);
          if (bucketIndex >= 0) {
            durationStats[bucketIndex].net += pnl;
            durationStats[bucketIndex].trades += 1;
            if (pnl > 0) {
              durationStats[bucketIndex].wins += 1;
            }
          }
        }
      }

      if (trade.DateTime) {
        const tradeTime = new Date(trade.DateTime);
        if (!Number.isNaN(tradeTime.valueOf())) {
          const hour = tradeTime.getHours();
          hourStats[hour].net += pnl;
          hourStats[hour].trades += 1;
          if (pnl > 0) {
            hourStats[hour].wins += 1;
          }
        }
      }

      const symbol = extractBaseSymbol(trade.Symbol || '—');
      symbolMap.set(symbol, (symbolMap.get(symbol) ?? 0) + pnl);
      if (!symbolStatsMap.has(symbol)) {
        symbolStatsMap.set(symbol, { net: 0, profit: 0, loss: 0, trades: 0 });
      }
      const stats = symbolStatsMap.get(symbol);
      if (stats) {
        stats.net += pnl;
        stats.trades += 1;
        if (pnl > 0) {
          stats.profit += pnl;
        } else if (pnl < 0) {
          stats.loss += pnl;
        }
      }

      if (trade.TradeDate) {
        const parsed = new Date(`${trade.TradeDate}T00:00:00`);
        if (!Number.isNaN(parsed.valueOf())) {
          const weekStart = startOfWeek(parsed);
          const weekKey = formatDateKey(weekStart);
          if (!weekMap.has(weekKey)) {
            weekMap.set(weekKey, { net: 0, trades: 0, wins: 0, losses: 0, profitAmount: 0, lossAmount: 0 });
          }
          const entry = weekMap.get(weekKey);
          if (entry) {
            entry.net += pnl;
            entry.trades += 1;
            if (pnl > 0) {
              entry.wins += 1;
              entry.profitAmount += pnl;
            } else if (pnl < 0) {
              entry.losses += 1;
              entry.lossAmount += Math.abs(pnl);
            }
          }
        }
      }
    });

    const durationLabels = durationBuckets.map((bucket) => bucket.label);
    const durationNet = durationStats.map((item) => item.net);
    const durationWinRate = durationStats.map((item) => (item.trades ? item.wins / item.trades : 0));

    const timeLabels = hourStats.map((_, hour) => `${String(hour).padStart(2, '0')}:00`);
    const timeNet = hourStats.map((item) => item.net);
    const timeWinRate = hourStats.map((item) => (item.trades ? item.wins / item.trades : 0));

    const symbolEntries = Array.from(symbolMap.entries());
    const topProfit = symbolEntries.filter(([, pnl]) => pnl > 0).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topLoss = symbolEntries.filter(([, pnl]) => pnl < 0).sort((a, b) => a[1] - b[1]).slice(0, 5);
    const symbolLabels = [...topProfit, ...topLoss].map(([symbol]) => symbol);
    const symbolNet = [...topProfit, ...topLoss].map(([, pnl]) => pnl);
    const symbolStatsEntries = Array.from(symbolStatsMap.entries());
    const topProfitableSymbols = symbolStatsEntries
      .filter(([, stats]) => stats.profit > 0)
      .sort(([, statsA], [, statsB]) => statsB.profit - statsA.profit)
      .slice(0, 5)
      .map(([symbol, stats]) => ({ symbol, ...stats }));
    const mostLossSymbols = symbolStatsEntries
      .filter(([, stats]) => stats.loss < 0)
      .sort(([, statsA], [, statsB]) => statsA.loss - statsB.loss)
      .slice(0, 5)
      .map(([symbol, stats]) => ({ symbol, ...stats }));

    const weeklyEntries = Array.from(weekMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const weeklyLabels = weeklyEntries.map(([week]) => formatChartLabel(week));
    const weeklyNet = weeklyEntries.map(([, value]) => value.net);
    const weeklyTradeCount = weeklyEntries.map(([, value]) => value.trades);
    const weeklyWinRate = weeklyEntries.map(([, value]) => (value.trades ? value.wins / value.trades : 0));
    const weeklyProfitAmount = weeklyEntries.map(([, value]) => value.profitAmount);
    const weeklyLossAmount = weeklyEntries.map(([, value]) => value.lossAmount);
    const weeklyAvgWinLossRatio = weeklyEntries.map(([, value]) => {
      if (!value.wins || !value.losses) {
        return null;
      }
      const avgWin = value.profitAmount / value.wins;
      const avgLoss = value.lossAmount / value.losses;
      return avgLoss ? avgWin / avgLoss : null;
    });

    return {
      dailyNet: { labels: dailyLabels, data: dailyNetValues },
      dailyCumulative: { labels: dailyLabels, data: dailyCumulative },
      drawdown: { labels: dailyLabels, data: dailyDrawdown },
      durationPerformance: { labels: durationLabels, net: durationNet, winRate: durationWinRate },
      timePerformance: { labels: timeLabels, net: timeNet, winRate: timeWinRate },
      symbolPerformance: { labels: symbolLabels, data: symbolNet },
      topProfitableSymbols,
      mostLossSymbols,
      weeklyStats: {
        labels: weeklyLabels,
        net: weeklyNet,
        tradeCount: weeklyTradeCount,
        winRate: weeklyWinRate,
        profitAmount: weeklyProfitAmount,
        lossAmount: weeklyLossAmount,
        avgWinLossRatio: weeklyAvgWinLossRatio
      }
    };
  }, [dayMap, filteredTrades, tradeDates]);

  const selectedGroup = useMemo(() => {
    if (!detailGroupKey || !selectedDay) {
      return null;
    }
    return selectedDay.groups.find((group) => group.key === detailGroupKey) ?? null;
  }, [detailGroupKey, selectedDay]);

  const tradeDateIndex = selectedDate ? tradeDates.indexOf(selectedDate) : -1;
  const previousTradeDate = tradeDateIndex > 0 ? tradeDates[tradeDateIndex - 1] : null;
  const nextTradeDate = tradeDateIndex >= 0 && tradeDateIndex < tradeDates.length - 1 ? tradeDates[tradeDateIndex + 1] : null;

  const handleSelectDate = (date: string) => {
    setSelectedDate(date);
    setDetailGroupKey(null);
  };

  const handleOpenLog = (log: TradeLogRecord) => {
    setLogDate(log.date);
    setActiveLog(log);
    setLogModalMode('view');
    setLogModalOpen(true);
    setShowLogSidebar(true);
  };

  const handleEditLog = (log: TradeLogRecord) => {
    setLogDate(log.date);
    setActiveLog(log);
    setLogModalMode('edit');
    setLogModalOpen(true);
    setShowLogSidebar(true);
  };

  const handleCreateLog = () => {
    const targetDate = logDate ?? selectedDate ?? formatDateKey(new Date());
    setLogDate(targetDate);
    setActiveLog(null);
    setLogModalMode('create');
    setLogModalOpen(true);
    setShowLogSidebar(true);
  };

  const handleDeleteLog = (log: TradeLogRecord) => {
    if (!token || log.id === undefined) {
      return;
    }
    const confirmed = window.confirm(
      t('pnl_calendar.logs.confirm_delete', {
        date: log.date,
        type: log.type === 'weekly' ? t('pnl_calendar.logs.weekly') : t('pnl_calendar.logs.daily')
      })
    );
    if (!confirmed) {
      return;
    }
    deleteTradeLog(token, log.id, tradeLogIdentity)
      .then(() => {
        setTradeLogs((prev) => sortTradeLogs(prev.filter((entry) => entry.id !== log.id)));
      })
      .catch(() => {
        // ignore errors
      });
  };

  const handleSaveLog = (payload: TradeLogPayload, logId?: number) => {
    if (!token) {
      return;
    }
    const request = logModalMode === 'edit' && logId
      ? updateTradeLog(token, logId, payload, tradeLogIdentity)
      : createTradeLog(token, payload, tradeLogIdentity);

    request
      .then((saved) => {
        setTradeLogs((prev) => {
          const next = prev.filter((entry) => entry.id !== saved.id);
          next.push(saved);
          return sortTradeLogs(next);
        });
        setLogModalOpen(false);
        setActiveLog(null);
      })
      .catch(() => {
        // ignore errors
      });
  };

  const handleCloseModal = () => {
    setSelectedDate(null);
    setDetailGroupKey(null);
  };

  const handleCloseLogModal = () => {
    setLogModalOpen(false);
    setActiveLog(null);
  };

  const handleDateInputChange = (key: 'start' | 'end') => (event: ChangeEvent<HTMLInputElement>) => {
    setDateRange((prev) => ({ ...prev, [key]: event.target.value }));
    setActiveRangeKey(null);
  };

  const handleQuickRangeSelect = (key: string) => {
    const today = new Date();
    const end = new Date(today);
    end.setHours(0, 0, 0, 0);
    let start = new Date(today);

    switch (key) {
      case 'week':
        start = startOfWeek(today);
        break;
      case 'month':
        start = startOfMonth(today);
        break;
      case 'last30':
        start = new Date(today);
        start.setDate(today.getDate() - 29);
        break;
      case 'quarter':
        start = startOfQuarter(today);
        break;
      case 'ytd':
        start = startOfYear(today);
        break;
      default:
        start = today;
        break;
    }

    setDateRange({
      start: formatDateInput(start),
      end: formatDateInput(end)
    });
    setActiveRangeKey(key);
  };

  const handleNavigateMonth = (offset: number) => {
    const newDate = new Date(monthYear, monthIndex + offset, 1);
    setMonthAnchor(newDate);
    monthLockedRef.current = true;
  };

  const handleShowLogSidebar = () => {
    setShowLogSidebar(true);
  };

  const handleHideLogSidebar = () => {
    setShowLogSidebar(false);
  };

  return (
    <div className={layoutStyles.page}>
      <section className={styles.filterToolbar}>
        <div className={styles.filterToolbarHeader}>
          <button
            type="button"
            className={clsx(styles.filterToggleButton, {
              [styles.filterToggleButtonOpen]: filtersOpen
            })}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen((previous) => !previous)}
          >
            <span className={styles.filterToggleIcon}>▾</span>
            <span className={styles.filterToggleLabel}>{t('pnl_calendar.filters.toggle')}</span>
          </button>
          <div className={styles.filterHeaderActions}>
            <button
              type="button"
              className={styles.langToggleButton}
              onClick={() => i18n.changeLanguage(i18n.language === 'en' ? 'zh' : 'en')}
            >
              {i18n.language === 'en' ? '中' : 'En'}
            </button>
            <button
              type="button"
              className={clsx(styles.iconToolbarButton, {
                [styles.toolbarButtonActive]: showLogSidebar
              })}
              aria-pressed={showLogSidebar}
              aria-label={t('pnl_calendar.logs.open')}
              title={t('pnl_calendar.logs.open')}
              onClick={handleShowLogSidebar}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 5h14v14H5z" fill="none" stroke="currentColor" strokeWidth="1.6" />
                <path d="M8 9h8M8 13h8M8 17h5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className={styles.iconToolbarButton}
              aria-label={t('pnl_calendar.logs.create')}
              title={t('pnl_calendar.logs.create')}
              onClick={handleCreateLog}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
        <div className={clsx(styles.filterContent, { [styles.filterContentHidden]: !filtersOpen })}>
          <div className={styles.filterRow}>
            <div className={styles.filterField}>
              <div className={styles.dateInputs}>
                <input
                  id="pnl-date-start"
                  type="date"
                  className={styles.filterInput}
                  value={dateRange.start}
                  onChange={handleDateInputChange('start')}
                  aria-label={t('pnl_calendar.filters.start_date')}
                />
                <span className={styles.dateSeparator}>{t('pnl_calendar.filters.to')}</span>
                <input
                  id="pnl-date-end"
                  type="date"
                  className={styles.filterInput}
                  value={dateRange.end}
                  onChange={handleDateInputChange('end')}
                  aria-label={t('pnl_calendar.filters.end_date')}
                />
              </div>
              <div className={styles.quickRanges}>
                {QUICK_RANGES.map((range) => (
                  <button
                    key={range.key}
                    type="button"
                    className={clsx(styles.quickButton, {
                      [styles.quickButtonActive]: activeRangeKey === range.key
                    })}
                    onClick={() => handleQuickRangeSelect(range.key)}
                  >
                    {t(range.labelKey)}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.filterField}>
              <input
                id="pnl-symbol-filter"
                type="search"
                className={styles.filterInput}
                placeholder={t('pnl_calendar.filters.symbol_placeholder')}
                list="pnl-symbol-options"
                value={symbolFilter}
                onChange={(event) => setSymbolFilter(event.target.value)}
              />
              <datalist id="pnl-symbol-options">
                {baseSymbolSuggestions.map((symbol) => (
                  <option key={symbol} value={symbol} />
                ))}
              </datalist>
            </div>
            <div className={styles.filterField}>
              <select
                id="pnl-strategy-filter"
                className={styles.filterSelect}
                value={strategyFilter}
                onChange={(event) => setStrategyFilter(event.target.value)}
              >
                <option value="all">{t('pnl_calendar.filters.strategy_all')}</option>
                {strategyOptions.map((strategy) => (
                  <option key={strategy} value={strategy}>
                    {strategy}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </section>
      <section className={clsx(styles.calendarLayout, styles.calendarLayoutExpanded)}>
        <div className={styles.calendarCard}>
          <div className={styles.calendarHeader}>
        <h2 className={styles.calendarTitle}>{t('pnl_calendar.calendar.title')}</h2>
        <div className={styles.monthSummaryRow}>
          <div className={styles.monthSummaryItem}>
            <span className={styles.summaryLabel}>{t('pnl_calendar.calendar.summary_net')}</span>
            <strong
              className={clsx(styles.summaryValueCompact, {
                [styles.positive]: monthSummary.netPnl > 0,
                [styles.negative]: monthSummary.netPnl < 0
              })}
            >
              {formatPnlValue(monthSummary.netPnl)}
            </strong>
          </div>
          <div className={styles.monthSummaryItem}>
            <span className={styles.summaryLabel}>{t('pnl_calendar.calendar.summary_trades_symbols')}</span>
            <strong className={styles.summaryValueCompact}>
              {monthSummary.tradeCount} / {monthSummary.symbolCount}
            </strong>
          </div>
          <div className={clsx(styles.monthSummaryItem, styles.monthSummaryDesktopOnly)}>
            <span className={styles.summaryLabel}>{t('pnl_calendar.calendar.summary_win_rate')}</span>
            <strong className={styles.summaryValueCompact}>
              {formatPercent(monthSummary.winRate)}
            </strong>
          </div>
          <div className={clsx(styles.monthSummaryItem, styles.monthSummaryDesktopOnly)}>
            <span className={styles.summaryLabel}>{t('pnl_calendar.calendar.summary_roi')}</span>
            <strong className={styles.summaryValueCompact}>
              {formatPercent(monthSummary.roi)}
            </strong>
          </div>
        </div>
        <div className={styles.calendarActions}>
          <button type="button" className={styles.navButton} onClick={() => handleNavigateMonth(-1)}>
            {t('pnl_calendar.calendar.prev_month')}
          </button>
          <span className={styles.monthLabel}>
            {monthAnchor.toLocaleDateString(locale, { year: 'numeric', month: '2-digit' })}
          </span>
          <button type="button" className={styles.navButton} onClick={() => handleNavigateMonth(1)}>
            {t('pnl_calendar.calendar.next_month')}
          </button>
        </div>
      </div>
        <div className={styles.calendarGrid} role="grid">
        <div className={styles.weekdayHeader} style={{ gridColumn: '1 / -1' }}>
          {WEEKDAYS.map((day) => (
            <div key={day} className={clsx(styles.weekday, (day === 'sat' || day === 'sun') && styles.weekendHidden)}>
              {t(`pnl_calendar.weekdays.${day}`)}
            </div>
          ))}
          <div className={clsx(styles.weekday, styles.weekSummaryHeader, styles.weekendHidden)}>
            {t('pnl_calendar.calendar.week_summary')}
          </div>
        </div>
        {monthWeeks.map((week, weekIndex) => {
          const weekDates = week.filter((date): date is string => Boolean(date));
          const weekTradeCount = weekDates.reduce((total, date) => total + (dayMap.get(date)?.tradeCount ?? 0), 0);
          const weekNetPnl = weekDates.reduce((total, date) => total + (dayMap.get(date)?.netPnl ?? 0), 0);
          return (
            <Fragment key={`week-${weekIndex}`}>
              {week.map((date, dayIndex) => {
                const isWeekend = dayIndex === 5 || dayIndex === 6;
                if (!date) {
                  return (
                    <div
                      key={`empty-${weekIndex}-${dayIndex}`}
                      className={clsx(styles.emptyCell, isWeekend && styles.weekendHidden)}
                    />
                  );
                }
                const dayData = dayMap.get(date);
                const hasTrades = Boolean(dayData && dayData.tradeCount > 0);
                const cellContent = (
                  <>
                    <div className={styles.dayNumber}>{formatDayNumber(date)}</div>
                    <div
                      className={clsx(styles.dayPnl, {
                        [styles.positive]: dayData && dayData.netPnl > 0,
                        [styles.negative]: dayData && dayData.netPnl < 0
                      })}
                    >
                      {dayData ? formatPnlValue(dayData.netPnl) : null}
                    </div>
                  </>
                );

                if (!hasTrades) {
                  return (
                    <div
                      key={date}
                      className={clsx(styles.dayCell, styles.dayCellInactive, isWeekend && styles.weekendHidden)}
                    >
                      {cellContent}
                    </div>
                  );
                }

                return (
                  <div
                    key={date}
                    role="button"
                    tabIndex={0}
                    className={clsx(styles.dayCell, styles.dayCellActive, isWeekend && styles.weekendHidden)}
                    title={date}
                    onClick={() => handleSelectDate(date)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        handleSelectDate(date);
                      }
                    }}
                  >
                    {cellContent}
                  </div>
                );
              })}
              <div className={clsx(styles.weekSummaryCell, styles.weekendHidden)}>
                <span className={styles.weekSummaryTitle}>{t('pnl_calendar.calendar.week_summary')}</span>
                <strong
                  className={clsx(styles.weekSummaryValue, {
                    [styles.positive]: weekNetPnl > 0,
                    [styles.negative]: weekNetPnl < 0
                  })}
                >
                  {formatPnlValue(weekNetPnl)}
                </strong>
                <div className={styles.weekSummaryMeta}>
                  <span className={styles.weekSummaryMetaPrimary}>
                    {t('pnl_calendar.calendar.week_summary_trades', { count: weekTradeCount })}
                  </span>
                </div>
              </div>
            </Fragment>
          );
        })}
          </div>
        </div>
        <div
          className={clsx(styles.logSidebarWrapper, {
            [styles.logSidebarHidden]: !showLogSidebar
          })}
          aria-hidden={!showLogSidebar}
        >
          <LogSidebar
            logs={tradeLogs}
            loading={logsLoading}
            activeLogId={activeLog?.id ?? null}
            onOpen={handleOpenLog}
            onEdit={handleEditLog}
            onDelete={handleDeleteLog}
          />
        </div>
      </section>
      {showLogSidebar ? (
        <button
          type="button"
          className={styles.logSidebarBackdrop}
          aria-label={t('pnl_calendar.logs.close_sidebar')}
          onClick={handleHideLogSidebar}
        />
      ) : null}

      <StatsCards
        netPnl={stats.netPnl}
        totalTrades={stats.totalTrades}
        winRate={stats.winRate}
        winCount={stats.winCount}
        lossCount={stats.lossCount}
        flatCount={stats.flatCount}
        avgTradePnl={stats.avgTradePnl}
        profitFactor={stats.profitFactor}
        avgWinLossRatio={stats.avgWinLossRatio}
        maxDrawdown={stats.maxDrawdown}
        avgDurationMinutes={stats.avgDurationMinutes}
        avgDailyPnl={stats.avgDailyPnl}
        profitDayRate={stats.profitDayRate}
        dayWinCount={stats.dayWinCount}
        dayLossCount={stats.dayLossCount}
        dayFlatCount={stats.dayFlatCount}
      />
      <ChartsSection
        dailyNet={chartsData.dailyNet}
        dailyCumulative={chartsData.dailyCumulative}
        drawdown={chartsData.drawdown}
        durationPerformance={chartsData.durationPerformance}
        timePerformance={chartsData.timePerformance}
        symbolPerformance={chartsData.symbolPerformance}
        topProfitableSymbols={chartsData.topProfitableSymbols}
        mostLossSymbols={chartsData.mostLossSymbols}
        weeklyStats={chartsData.weeklyStats}
      />
      <Modal
        open={Boolean(selectedDate)}
        title={selectedDate ? t('pnl_calendar.detail.title_with_date', { date: selectedDate }) : t('pnl_calendar.detail.title')}
        subtitle={
          selectedDay
            ? t('pnl_calendar.detail.subtitle', {
                pnl: formatPnlValue(selectedDay.netPnl),
                trades: selectedDay.tradeCount
              })
            : undefined
        }
        onClose={handleCloseModal}
        size="lg"
        headerActions={
          <div className={styles.modalNav}>
            <button
              type="button"
              className={styles.modalNavButton}
              onClick={() => previousTradeDate && handleSelectDate(previousTradeDate)}
              disabled={!previousTradeDate}
            >
              {t('pnl_calendar.detail.prev_day')}
            </button>
            <button
              type="button"
              className={styles.modalNavButton}
              onClick={() => nextTradeDate && handleSelectDate(nextTradeDate)}
              disabled={!nextTradeDate}
            >
              {t('pnl_calendar.detail.next_day')}
            </button>
          </div>
        }
      >
        {selectedDay ? (
          <div className={styles.modalContent}>
            <div className={styles.modalSummary}>
              <div className={styles.modalSummaryItem}>
                <span>{t('pnl_calendar.detail.summary_net')}</span>
                <strong className={clsx({
                  [styles.positive]: selectedDay.netPnl > 0,
                  [styles.negative]: selectedDay.netPnl < 0
                })}>
                  {formatPnlValue(selectedDay.netPnl)}
                </strong>
              </div>
              <div className={styles.modalSummaryItem}>
                <span>{t('pnl_calendar.detail.summary_trades_symbols')}</span>
                <strong>{selectedDay.tradeCount} / {selectedDay.symbolCount}</strong>
              </div>
              <div className={styles.modalSummaryItem}>
                <span>{t('pnl_calendar.detail.summary_win_rate')}</span>
                <strong>{formatPercent(selectedDay.winRate)}</strong>
              </div>
              <div className={styles.modalSummaryItem}>
                <span>{t('pnl_calendar.detail.summary_roi')}</span>
                <strong>{formatPercent(selectedDay.roi)}</strong>
              </div>
            </div>
            {selectedGroup ? (
              <div className={styles.detailSection}>
                <div className={styles.detailHeader}>
                  <div>
                    <h3 className={styles.detailTitle}>
                      {selectedGroup.symbol} · {t(`pnl_calendar.detail.side.${selectedGroup.side.toLowerCase()}`)}
                    </h3>
                    <p className={styles.detailSubtitle}>
                      {t('pnl_calendar.detail.merged_subtitle', {
                        trades: selectedGroup.tradeTimes,
                        pnl: formatPnlValue(selectedGroup.netPnl)
                      })}
                    </p>
                  </div>
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => setDetailGroupKey(null)}
                  >
                    {t('pnl_calendar.detail.back_to_groups')}
                  </button>
                </div>
                <div className={styles.tableWrapper}>
                  <table className={styles.detailTable}>
                    <thead>
                      <tr>
                        <th>{t('pnl_calendar.detail.table.open_time')}</th>
                        <th>{t('pnl_calendar.detail.table.close_time')}</th>
                        <th>{t('pnl_calendar.detail.table.instrument')}</th>
                        <th>{t('pnl_calendar.detail.table.side')}</th>
                        <th>{t('pnl_calendar.detail.table.quantity')}</th>
                        <th>{t('pnl_calendar.detail.table.trade_times')}</th>
                        <th>{t('pnl_calendar.detail.table.net_pnl')}</th>
                        <th>{t('pnl_calendar.detail.table.net_roi')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedGroup.trades.map((trade) => (
                        <tr key={trade.TransactionID}>
                          <td>{formatDateTime(trade.OpenDateTime)}</td>
                          <td>{formatDateTime(trade.DateTime)}</td>
                          <td>{formatInstrument(trade.Instrument)}</td>
                          <td>
                            {t(`pnl_calendar.detail.side.${trade['Buy/Sell'] === 'Buy' ? 'long' : 'short'}`)} ({trade['Buy/Sell']})
                          </td>
                          <td>{trade.Quantity}</td>
                          <td>{formatTradeDuration(resolveTradeDurationMinutes(trade.OpenDateTime, trade.DateTime))}</td>
                          <td
                            className={clsx({
                              [styles.positive]: trade.FifoPnlRealized > 0,
                              [styles.negative]: trade.FifoPnlRealized < 0
                            })}
                          >
                            {formatPnlValue(trade.FifoPnlRealized ?? 0)}
                          </td>
                          <td>{formatPercent(resolveNetRoi(trade.FifoPnlRealized ?? 0, Math.abs(trade.FifoPnlRealized ?? 0)))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className={styles.detailSection}>
                <h3 className={styles.detailTitle}>{t('pnl_calendar.detail.group_title')}</h3>
                <div className={styles.tableWrapper}>
                  <table className={styles.detailTable}>
                    <thead>
                      <tr>
                        <th>{t('pnl_calendar.detail.table.open_time')}</th>
                        <th>{t('pnl_calendar.detail.table.instrument')}</th>
                        <th>{t('pnl_calendar.detail.table.symbol')}</th>
                        <th>{t('pnl_calendar.detail.table.side')}</th>
                        <th>{t('pnl_calendar.detail.table.merged_trades')}</th>
                        <th>{t('pnl_calendar.detail.table.trade_times')}</th>
                        <th>{t('pnl_calendar.detail.table.net_pnl')}</th>
                        <th>{t('pnl_calendar.detail.table.net_roi')}</th>
                        <th>{t('pnl_calendar.detail.table.win_rate')}</th>
                        <th>{t('pnl_calendar.detail.table.roi')}</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {selectedDay.groups.map((group) => {
                        const averageDuration = (() => {
                          let total = 0;
                          let count = 0;
                          group.trades.forEach((trade) => {
                            const duration = resolveTradeDurationMinutes(trade.OpenDateTime, trade.DateTime);
                            if (duration === null) {
                              return;
                            }
                            total += duration;
                            count += 1;
                          });
                          return count ? total / count : null;
                        })();

                        return (
                          <tr key={group.key}>
                            <td>{formatDateTime(group.openDateTime)}</td>
                            <td>{formatInstrument(group.instrument)}</td>
                            <td>{group.symbol}</td>
                            <td>{t(`pnl_calendar.detail.side.${group.side.toLowerCase()}`)}</td>
                            <td>{group.tradeTimes}</td>
                            <td>{formatTradeDuration(averageDuration)}</td>
                            <td
                              className={clsx({
                                [styles.positive]: group.netPnl > 0,
                                [styles.negative]: group.netPnl < 0
                              })}
                            >
                              {formatPnlValue(group.netPnl)}
                            </td>
                            <td>{formatPercent(resolveNetRoi(group.netPnl, group.absPnl))}</td>
                            <td>{formatPercent(group.tradeTimes ? group.winCount / group.tradeTimes : null)}</td>
                            <td>{formatPercent(group.absPnl ? group.netPnl / group.absPnl : null)}</td>
                            <td>
                              <button
                                type="button"
                                className={styles.linkButton}
                                onClick={() => setDetailGroupKey(group.key)}
                              >
                                {t('pnl_calendar.detail.view_details')}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className={styles.modalEmpty}>{t('pnl_calendar.detail.empty')}</div>
        )}
      </Modal>
      <LogModal
        open={logModalOpen}
        mode={logModalMode}
        log={activeLog}
        date={logDate}
        dailyDefaults={dailyDefaults}
        weeklyDefaults={weeklyDefaults}
        onClose={handleCloseLogModal}
        onSave={handleSaveLog}
        onEdit={() => setLogModalMode('edit')}
      />
    </div>
  );
}

export default PnLCalendarPage;
