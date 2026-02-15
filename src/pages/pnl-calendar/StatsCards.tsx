import clsx from 'clsx';
import styles from './PnLCalendarPage.module.css';
import { useTranslation } from '@i18n';

interface StatsCardsProps {
  netPnl: number;
  totalTrades: number;
  winRate: number | null;
  winCount: number;
  lossCount: number;
  flatCount: number;
  avgTradePnl: number | null;
  profitFactor: number | null;
  avgWinLossRatio: number | null;
  maxDrawdown: number | null;
  avgDurationMinutes: number | null;
  avgDailyPnl: number | null;
  profitDayRate: number | null;
  dayWinCount: number;
  dayLossCount: number;
  dayFlatCount: number;
}

const StatsCards = ({
  netPnl,
  totalTrades,
  winRate,
  winCount,
  lossCount,
  flatCount,
  avgTradePnl,
  profitFactor,
  avgWinLossRatio,
  maxDrawdown,
  avgDurationMinutes,
  avgDailyPnl,
  profitDayRate,
  dayWinCount,
  dayLossCount,
  dayFlatCount
}: StatsCardsProps) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-US' : 'zh-CN';

  const formatPnlValue = (value: number | null): string => {
    if (value === null) {
      return t('pnl_calendar.common.empty');
    }
    const formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    const sign = value > 0 ? '+' : '';
    return `${sign}${formatter.format(value)}`;
  };

  const formatPercent = (value: number | null): string => {
    if (value === null) {
      return t('pnl_calendar.common.empty');
    }
    return t('pnl_calendar.common.percent', { value: (value * 100).toFixed(1) });
  };

  const formatDuration = (minutes: number | null): string => {
    if (minutes === null) {
      return t('pnl_calendar.common.empty');
    }
    const rounded = Math.round(minutes);
    if (rounded < 60) {
      return t('pnl_calendar.duration.minutes', { count: rounded });
    }
    const hours = Math.floor(rounded / 60);
    const rest = Math.round(rounded % 60);
    if (rest === 0) {
      return t('pnl_calendar.duration.hours', { count: hours });
    }
    return t('pnl_calendar.duration.hours_minutes', { hours, minutes: rest });
  };

  const formatRatio = (value: number | null): string => {
    if (value === null) {
      return t('pnl_calendar.common.empty');
    }
    return value.toFixed(2);
  };

  const cards = [
    {
      label: t('pnl_calendar.stats.net_pnl'),
      value: formatPnlValue(netPnl),
      tone: netPnl > 0 ? 'positive' : netPnl < 0 ? 'negative' : undefined,
      footnote: t('pnl_calendar.stats.footnote_range')
    },
    {
      label: t('pnl_calendar.stats.total_trades'),
      value: totalTrades.toLocaleString(locale),
      footnote: t('pnl_calendar.stats.footnote_trades')
    },
    {
      label: t('pnl_calendar.stats.win_rate'),
      value: formatPercent(winRate),
      footnote: t('pnl_calendar.stats.footnote_win_loss', {
        win: winCount,
        flat: flatCount,
        loss: lossCount
      })
    },
    {
      label: t('pnl_calendar.stats.profit_day_rate'),
      value: formatPercent(profitDayRate),
      footnote: t('pnl_calendar.stats.footnote_day_win_loss', {
        win: dayWinCount,
        flat: dayFlatCount,
        loss: dayLossCount
      })
    },
    {
      label: t('pnl_calendar.stats.avg_trade_pnl'),
      value: formatPnlValue(avgTradePnl),
      tone: avgTradePnl && avgTradePnl > 0 ? 'positive' : avgTradePnl && avgTradePnl < 0 ? 'negative' : undefined,
      footnote: t('pnl_calendar.stats.footnote_avg_trade_pnl')
    },
    {
      label: t('pnl_calendar.stats.profit_factor'),
      value: formatRatio(profitFactor),
      footnote: t('pnl_calendar.stats.footnote_profit_factor')
    },
    {
      label: t('pnl_calendar.stats.avg_win_loss_ratio'),
      value: formatRatio(avgWinLossRatio),
      footnote: t('pnl_calendar.stats.footnote_avg_win_loss_ratio')
    },
    {
      label: t('pnl_calendar.stats.max_drawdown'),
      value: formatPnlValue(maxDrawdown),
      tone: maxDrawdown && maxDrawdown < 0 ? 'negative' : undefined,
      footnote: t('pnl_calendar.stats.footnote_drawdown')
    },
    {
      label: t('pnl_calendar.stats.avg_duration'),
      value: formatDuration(avgDurationMinutes),
      footnote: t('pnl_calendar.stats.footnote_duration')
    },
    {
      label: t('pnl_calendar.stats.avg_daily_pnl'),
      value: formatPnlValue(avgDailyPnl),
      tone: avgDailyPnl && avgDailyPnl > 0 ? 'positive' : avgDailyPnl && avgDailyPnl < 0 ? 'negative' : undefined,
      footnote: t('pnl_calendar.stats.footnote_daily_pnl')
    }
  ];

  return (
    <section className={styles.statsSection}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>{t('pnl_calendar.stats.title')}</h2>
          <p className={styles.sectionSubtitle}>{t('pnl_calendar.stats.subtitle')}</p>
        </div>
      </div>
      <div className={styles.statsGrid}>
        {cards.map((card) => (
          <article key={card.label} className={styles.statsCard}>
            <span className={styles.statsLabel}>{card.label}</span>
            <strong
              className={clsx(styles.statsValue, {
                [styles.positive]: card.tone === 'positive',
                [styles.negative]: card.tone === 'negative'
              })}
            >
              {card.value}
            </strong>
            <span className={styles.statsFootnote}>{card.footnote}</span>
          </article>
        ))}
      </div>
    </section>
  );
};

export default StatsCards;
