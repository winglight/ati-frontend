import clsx from 'clsx';
import styles from './PnLCalendarPage.module.css';

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

const formatPnlValue = (value: number | null): string => {
  if (value === null) {
    return '';
  }
  const formatter = new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatter.format(value)}`;
};

const formatPercent = (value: number | null): string => {
  if (value === null) {
    return '—';
  }
  return `${(value * 100).toFixed(1)}%`;
};

const formatDuration = (minutes: number | null): string => {
  if (minutes === null) {
    return '—';
  }
  if (minutes < 60) {
    return `${Math.round(minutes)} 分钟`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  if (rest === 0) {
    return `${hours} 小时`;
  }
  return `${hours} 小时 ${rest} 分钟`;
};

const formatRatio = (value: number | null): string => {
  if (value === null) {
    return '';
  }
  return value.toFixed(2);
};

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
  const cards = [
    {
      label: '净盈亏',
      value: formatPnlValue(netPnl),
      tone: netPnl > 0 ? 'positive' : netPnl < 0 ? 'negative' : undefined,
      footnote: '筛选范围汇总'
    },
    {
      label: '交易笔数',
      value: totalTrades.toLocaleString('zh-CN'),
      footnote: '成交笔数统计'
    },
    {
      label: '胜率',
      value: formatPercent(winRate),
      footnote: `胜/平/负：${winCount}/${flatCount}/${lossCount}`
    },
    {
      label: '盈利日率',
      value: formatPercent(profitDayRate),
      footnote: `胜/平/负：${dayWinCount}/${dayFlatCount}/${dayLossCount}`
    },
    {
      label: '平均单笔盈亏',
      value: formatPnlValue(avgTradePnl),
      tone: avgTradePnl && avgTradePnl > 0 ? 'positive' : avgTradePnl && avgTradePnl < 0 ? 'negative' : undefined,
      footnote: '单笔净盈亏均值'
    },
    {
      label: 'Profit Factor',
      value: formatRatio(profitFactor),
      footnote: '总盈利 / 总亏损'
    },
    {
      label: '平均盈利/亏损比',
      value: formatRatio(avgWinLossRatio),
      footnote: '平均盈利 / 平均亏损'
    },
    {
      label: '最大回撤',
      value: formatPnlValue(maxDrawdown),
      tone: maxDrawdown && maxDrawdown < 0 ? 'negative' : undefined,
      footnote: '累计净值回撤峰值'
    },
    {
      label: '平均持仓时长',
      value: formatDuration(avgDurationMinutes),
      footnote: '含开平仓时间'
    },
    {
      label: '平均每日盈亏',
      value: formatPnlValue(avgDailyPnl),
      tone: avgDailyPnl && avgDailyPnl > 0 ? 'positive' : avgDailyPnl && avgDailyPnl < 0 ? 'negative' : undefined,
      footnote: '按交易日均摊'
    }
  ];

  return (
    <section className={styles.statsSection}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>绩效概览</h2>
          <p className={styles.sectionSubtitle}>核心指标与进阶统计随筛选条件动态更新。</p>
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
