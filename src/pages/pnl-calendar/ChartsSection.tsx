import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
  type ChartData,
  type ChartOptions
} from 'chart.js';
import { Bar, Chart, Line } from 'react-chartjs-2';
import clsx from 'clsx';
import styles from './PnLCalendarPage.module.css';
import { useTranslation } from '@i18n';

ChartJS.register(CategoryScale, LinearScale, BarElement, PointElement, LineElement, Tooltip, Legend, Filler);

interface SeriesData {
  labels: string[];
  data: number[];
}

interface DualSeriesData {
  labels: string[];
  net: number[];
  winRate: number[];
}

interface WeeklySeriesData {
  labels: string[];
  net: number[];
  tradeCount: number[];
  winRate: number[];
  profitAmount: number[];
  lossAmount: number[];
  avgWinLossRatio: Array<number | null>;
}

interface SymbolPerformanceRow {
  symbol: string;
  profit: number;
  loss: number;
  trades: number;
}

interface ChartsSectionProps {
  dailyNet: SeriesData;
  dailyCumulative: SeriesData;
  drawdown: SeriesData;
  durationPerformance: DualSeriesData;
  timePerformance: DualSeriesData;
  symbolPerformance: SeriesData;
  topProfitableSymbols: SymbolPerformanceRow[];
  mostLossSymbols: SymbolPerformanceRow[];
  weeklyStats: WeeklySeriesData;
}

const baseLineOptions: ChartOptions<'line'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom'
    },
    tooltip: {
      mode: 'index',
      intersect: false
    }
  },
  scales: {
    x: {
      grid: {
        display: false
      }
    }
  }
};

const baseBarOptions: ChartOptions<'bar'> = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom'
    },
    tooltip: {
      mode: 'index',
      intersect: false
    }
  },
  scales: {
    x: {
      grid: {
        display: false
      }
    }
  }
};

const ChartsSection = ({
  dailyNet,
  dailyCumulative,
  drawdown,
  durationPerformance,
  timePerformance,
  symbolPerformance,
  topProfitableSymbols,
  mostLossSymbols,
  weeklyStats
}: ChartsSectionProps) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-US' : 'zh-CN';

  const formatPnlValue = (value: number): string => {
    const formatter = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
    const sign = value > 0 ? '+' : '';
    return `${sign}${formatter.format(value)}`;
  };

  const isEmpty =
    dailyNet.labels.length === 0 &&
    durationPerformance.labels.length === 0 &&
    timePerformance.labels.length === 0 &&
    symbolPerformance.labels.length === 0 &&
    topProfitableSymbols.length === 0 &&
    mostLossSymbols.length === 0 &&
    weeklyStats.labels.length === 0;

  const durationData: ChartData<'bar' | 'line'> = {
    labels: durationPerformance.labels,
    datasets: [
      {
        label: t('pnl_calendar.charts.labels.net_pnl'),
        data: durationPerformance.net,
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1,
        yAxisID: 'y'
      },
      {
        label: t('pnl_calendar.charts.labels.win_rate'),
        data: durationPerformance.winRate,
        type: 'line',
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.25)',
        tension: 0.3,
        yAxisID: 'y1'
      }
    ]
  };

  const timeData: ChartData<'bar' | 'line'> = {
    labels: timePerformance.labels,
    datasets: [
      {
        label: t('pnl_calendar.charts.labels.net_pnl'),
        data: timePerformance.net,
        backgroundColor: 'rgba(14, 165, 233, 0.6)',
        borderColor: 'rgba(14, 165, 233, 1)',
        borderWidth: 1,
        yAxisID: 'y'
      },
      {
        label: t('pnl_calendar.charts.labels.win_rate'),
        data: timePerformance.winRate,
        type: 'line',
        borderColor: '#f97316',
        backgroundColor: 'rgba(249, 115, 22, 0.25)',
        tension: 0.3,
        yAxisID: 'y1'
      }
    ]
  };

  const weeklyStatsData: ChartData<'bar' | 'line'> = {
    labels: weeklyStats.labels,
    datasets: [
      {
        label: t('pnl_calendar.charts.labels.net_pnl'),
        data: weeklyStats.net,
        backgroundColor: 'rgba(99, 102, 241, 0.6)',
        borderColor: 'rgba(99, 102, 241, 1)',
        borderWidth: 1,
        yAxisID: 'y'
      },
      {
        label: t('pnl_calendar.charts.labels.win_rate'),
        data: weeklyStats.winRate,
        type: 'line',
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.25)',
        tension: 0.3,
        yAxisID: 'y1'
      }
    ]
  };

  const weeklyWinLossAmountData: ChartData<'bar' | 'line'> = {
    labels: weeklyStats.labels,
    datasets: [
      {
        label: t('pnl_calendar.charts.labels.profit_amount'),
        data: weeklyStats.profitAmount,
        backgroundColor: 'rgba(34, 197, 94, 0.7)',
        borderColor: 'rgba(34, 197, 94, 1)',
        borderWidth: 1,
        stack: 'amount'
      },
      {
        label: t('pnl_calendar.charts.labels.loss_amount'),
        data: weeklyStats.lossAmount,
        backgroundColor: 'rgba(239, 68, 68, 0.7)',
        borderColor: 'rgba(239, 68, 68, 1)',
        borderWidth: 1,
        stack: 'amount'
      },
      {
        label: t('pnl_calendar.charts.labels.avg_win_loss_ratio'),
        data: weeklyStats.avgWinLossRatio,
        type: 'line',
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139, 92, 246, 0.2)',
        tension: 0.3,
        yAxisID: 'y1'
      }
    ]
  };

  return (
    <section className={styles.chartsSection}>
      <div className={styles.sectionHeader}>
        <div>
          <h2 className={styles.sectionTitle}>{t('pnl_calendar.charts.title')}</h2>
          <p className={styles.sectionSubtitle}>{t('pnl_calendar.charts.subtitle')}</p>
        </div>
      </div>
      {isEmpty ? (
        <div className={styles.emptyState}>{t('pnl_calendar.charts.empty')}</div>
      ) : (
        <div className={styles.chartsGrid}>
          <article className={styles.chartCard}>
            <header className={styles.chartHeader}>
              <div>
                <h3 className={styles.chartTitle}>{t('pnl_calendar.charts.cumulative.title')}</h3>
                <p className={styles.chartSubtitle}>{t('pnl_calendar.charts.cumulative.subtitle')}</p>
              </div>
            </header>
            <div className={styles.chartBody}>
              <Line
                options={baseLineOptions}
                data={{
                  labels: dailyCumulative.labels,
                  datasets: [
                    {
                      label: t('pnl_calendar.charts.labels.cumulative_pnl'),
                      data: dailyCumulative.data,
                      borderColor: '#2563eb',
                      backgroundColor: 'rgba(37, 99, 235, 0.2)',
                      tension: 0.3,
                      fill: true
                    }
                  ]
                }}
              />
            </div>
          </article>

          <article className={styles.chartCard}>
            <header className={styles.chartHeader}>
              <div>
                <h3 className={styles.chartTitle}>{t('pnl_calendar.charts.daily_net.title')}</h3>
                <p className={styles.chartSubtitle}>{t('pnl_calendar.charts.daily_net.subtitle')}</p>
              </div>
            </header>
            <div className={styles.chartBody}>
              <Bar
                options={baseBarOptions}
                data={{
                  labels: dailyNet.labels,
                  datasets: [
                    {
                      label: t('pnl_calendar.charts.labels.daily_net'),
                      data: dailyNet.data,
                      backgroundColor: dailyNet.data.map((value) =>
                        value >= 0 ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)'
                      ),
                      borderColor: dailyNet.data.map((value) =>
                        value >= 0 ? 'rgba(34, 197, 94, 1)' : 'rgba(239, 68, 68, 1)'
                      ),
                      borderWidth: 1
                    }
                  ]
                }}
              />
            </div>
          </article>

          <article className={styles.chartCard}>
            <header className={styles.chartHeader}>
              <div>
                <h3 className={styles.chartTitle}>{t('pnl_calendar.charts.duration.title')}</h3>
                <p className={styles.chartSubtitle}>{t('pnl_calendar.charts.duration.subtitle')}</p>
              </div>
            </header>
            <div className={styles.chartBody}>
              <Chart<'bar' | 'line'>
                options={{
                  ...(baseBarOptions as ChartOptions<'bar' | 'line'>),
                  scales: {
                    x: baseBarOptions.scales?.x,
                    y: {
                      title: {
                        display: true,
                        text: t('pnl_calendar.charts.labels.net_pnl')
                      }
                    },
                    y1: {
                      position: 'right',
                      grid: {
                        drawOnChartArea: false
                      },
                      min: 0,
                      max: 1,
                      ticks: {
                        callback: (value: string | number) => `${Number(value) * 100}%`
                      },
                      title: {
                        display: true,
                        text: t('pnl_calendar.charts.labels.win_rate')
                      }
                    }
                  }
                }}
                type="bar"
                data={durationData}
              />
            </div>
          </article>

          <article className={styles.chartCard}>
            <header className={styles.chartHeader}>
              <div>
                <h3 className={styles.chartTitle}>{t('pnl_calendar.charts.time.title')}</h3>
                <p className={styles.chartSubtitle}>{t('pnl_calendar.charts.time.subtitle')}</p>
              </div>
            </header>
            <div className={styles.chartBody}>
              <Chart<'bar' | 'line'>
                options={{
                  ...(baseBarOptions as ChartOptions<'bar' | 'line'>),
                  scales: {
                    x: baseBarOptions.scales?.x,
                    y: {
                      title: {
                        display: true,
                        text: t('pnl_calendar.charts.labels.net_pnl')
                      }
                    },
                    y1: {
                      position: 'right',
                      grid: {
                        drawOnChartArea: false
                      },
                      min: 0,
                      max: 1,
                      ticks: {
                        callback: (value: string | number) => `${Number(value) * 100}%`
                      },
                      title: {
                        display: true,
                        text: t('pnl_calendar.charts.labels.win_rate')
                      }
                    }
                  }
                }}
                type="bar"
                data={timeData}
              />
            </div>
          </article>

          <article className={styles.chartCard}>
            <header className={styles.chartHeader}>
              <div>
                <h3 className={styles.chartTitle}>{t('pnl_calendar.charts.drawdown.title')}</h3>
                <p className={styles.chartSubtitle}>{t('pnl_calendar.charts.drawdown.subtitle')}</p>
              </div>
            </header>
            <div className={styles.chartBody}>
              <Line
                options={{
                  ...baseLineOptions,
                  scales: {
                    x: baseLineOptions.scales?.x,
                    y: {
                      ticks: {
                        callback: (value: string | number) => `${Number(value).toFixed(0)}`
                      }
                    }
                  }
                }}
                data={{
                  labels: drawdown.labels,
                  datasets: [
                    {
                      label: t('pnl_calendar.charts.labels.drawdown'),
                      data: drawdown.data,
                      borderColor: '#ef4444',
                      backgroundColor: 'rgba(239, 68, 68, 0.2)',
                      tension: 0.3,
                      fill: true
                    }
                  ]
                }}
              />
            </div>
          </article>

          <article className={styles.chartCard}>
            <header className={styles.chartHeader}>
              <div>
                <h3 className={styles.chartTitle}>{t('pnl_calendar.charts.symbols.title')}</h3>
                <p className={styles.chartSubtitle}>{t('pnl_calendar.charts.symbols.subtitle')}</p>
              </div>
            </header>
            <div className={styles.chartBody}>
              <Bar
                options={baseBarOptions}
                data={{
                  labels: symbolPerformance.labels,
                  datasets: [
                    {
                      label: t('pnl_calendar.charts.labels.net_pnl'),
                      data: symbolPerformance.data,
                      backgroundColor: symbolPerformance.data.map((value) =>
                        value >= 0 ? 'rgba(34, 197, 94, 0.6)' : 'rgba(239, 68, 68, 0.6)'
                      ),
                      borderColor: symbolPerformance.data.map((value) =>
                        value >= 0 ? 'rgba(34, 197, 94, 1)' : 'rgba(239, 68, 68, 1)'
                      ),
                      borderWidth: 1
                    }
                  ]
                }}
              />
            </div>
          </article>

          <article className={styles.chartCard}>
            <header className={styles.chartHeader}>
              <div>
                <h3 className={styles.chartTitle}>{t('pnl_calendar.charts.top_profit.title')}</h3>
                <p className={styles.chartSubtitle}>{t('pnl_calendar.charts.top_profit.subtitle')}</p>
              </div>
            </header>
            <div className={styles.chartBody}>
              {topProfitableSymbols.length ? (
                <div className={styles.tableWrapper}>
                  <table className={styles.detailTable}>
                    <thead>
                      <tr>
                        <th>{t('pnl_calendar.charts.table.symbol')}</th>
                        <th>{t('pnl_calendar.charts.table.profit')}</th>
                        <th>{t('pnl_calendar.charts.table.loss')}</th>
                        <th>{t('pnl_calendar.charts.table.trades')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topProfitableSymbols.map((row) => (
                        <tr key={`profit-${row.symbol}`}>
                          <td>{row.symbol}</td>
                          <td
                            className={clsx({
                              [styles.positive]: row.profit > 0,
                              [styles.negative]: row.profit < 0
                            })}
                          >
                            {formatPnlValue(row.profit)}
                          </td>
                          <td
                            className={clsx({
                              [styles.positive]: row.loss > 0,
                              [styles.negative]: row.loss < 0
                            })}
                          >
                            {formatPnlValue(row.loss)}
                          </td>
                          <td>{row.trades}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={styles.emptyState}>{t('pnl_calendar.charts.top_profit.empty')}</div>
              )}
            </div>
          </article>

          <article className={styles.chartCard}>
            <header className={styles.chartHeader}>
              <div>
                <h3 className={styles.chartTitle}>{t('pnl_calendar.charts.top_loss.title')}</h3>
                <p className={styles.chartSubtitle}>{t('pnl_calendar.charts.top_loss.subtitle')}</p>
              </div>
            </header>
            <div className={styles.chartBody}>
              {mostLossSymbols.length ? (
                <div className={styles.tableWrapper}>
                  <table className={styles.detailTable}>
                    <thead>
                      <tr>
                        <th>{t('pnl_calendar.charts.table.symbol')}</th>
                        <th>{t('pnl_calendar.charts.table.profit')}</th>
                        <th>{t('pnl_calendar.charts.table.loss')}</th>
                        <th>{t('pnl_calendar.charts.table.trades')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mostLossSymbols.map((row) => (
                        <tr key={`loss-${row.symbol}`}>
                          <td>{row.symbol}</td>
                          <td
                            className={clsx({
                              [styles.positive]: row.profit > 0,
                              [styles.negative]: row.profit < 0
                            })}
                          >
                            {formatPnlValue(row.profit)}
                          </td>
                          <td
                            className={clsx({
                              [styles.positive]: row.loss > 0,
                              [styles.negative]: row.loss < 0
                            })}
                          >
                            {formatPnlValue(row.loss)}
                          </td>
                          <td>{row.trades}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className={styles.emptyState}>{t('pnl_calendar.charts.top_loss.empty')}</div>
              )}
            </div>
          </article>

          <article className={styles.chartCard}>
            <header className={styles.chartHeader}>
              <div>
                <h3 className={styles.chartTitle}>{t('pnl_calendar.charts.weekly_stats.title')}</h3>
                <p className={styles.chartSubtitle}>{t('pnl_calendar.charts.weekly_stats.subtitle')}</p>
              </div>
            </header>
            <div className={styles.chartBody}>
              <Chart<'bar' | 'line'>
                options={{
                  ...(baseBarOptions as ChartOptions<'bar' | 'line'>),
                  scales: {
                    x: baseBarOptions.scales?.x,
                    y: {
                      title: {
                        display: true,
                        text: t('pnl_calendar.charts.labels.net_pnl')
                      }
                    },
                    y1: {
                      position: 'right',
                      grid: {
                        drawOnChartArea: false
                      },
                      min: 0,
                      max: 1,
                      ticks: {
                        callback: (value: string | number) => `${Number(value) * 100}%`
                      },
                      title: {
                        display: true,
                        text: t('pnl_calendar.charts.labels.win_rate')
                      }
                    }
                  }
                }}
                type="bar"
                data={weeklyStatsData}
              />
            </div>
          </article>

          <article className={styles.chartCard}>
            <header className={styles.chartHeader}>
              <div>
                <h3 className={styles.chartTitle}>{t('pnl_calendar.charts.weekly_win_loss.title')}</h3>
                <p className={styles.chartSubtitle}>{t('pnl_calendar.charts.weekly_win_loss.subtitle')}</p>
              </div>
            </header>
            <div className={styles.chartBody}>
              <Chart<'bar' | 'line'>
                options={{
                  ...(baseBarOptions as ChartOptions<'bar' | 'line'>),
                  scales: {
                    x: baseBarOptions.scales?.x,
                    y: {
                      stacked: true,
                      title: {
                        display: true,
                        text: t('pnl_calendar.charts.labels.amount')
                      }
                    },
                    y1: {
                      position: 'right',
                      grid: {
                        drawOnChartArea: false
                      },
                      title: {
                        display: true,
                        text: t('pnl_calendar.charts.labels.avg_win_loss_ratio')
                      }
                    }
                  }
                }}
                type="bar"
                data={weeklyWinLossAmountData}
              />
            </div>
          </article>
        </div>
      )}
    </section>
  );
};

export default ChartsSection;
