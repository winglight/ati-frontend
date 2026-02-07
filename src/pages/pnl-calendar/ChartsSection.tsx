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

const formatPnlValue = (value: number): string => {
  const formatter = new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatter.format(value)}`;
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
        label: '净盈亏',
        data: durationPerformance.net,
        backgroundColor: 'rgba(59, 130, 246, 0.6)',
        borderColor: 'rgba(59, 130, 246, 1)',
        borderWidth: 1,
        yAxisID: 'y'
      },
      {
        label: '胜率',
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
        label: '净盈亏',
        data: timePerformance.net,
        backgroundColor: 'rgba(14, 165, 233, 0.6)',
        borderColor: 'rgba(14, 165, 233, 1)',
        borderWidth: 1,
        yAxisID: 'y'
      },
      {
        label: '胜率',
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
        label: '净盈亏',
        data: weeklyStats.net,
        backgroundColor: 'rgba(99, 102, 241, 0.6)',
        borderColor: 'rgba(99, 102, 241, 1)',
        borderWidth: 1,
        yAxisID: 'y'
      },
      {
        label: '胜率',
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
        label: '盈利金额',
        data: weeklyStats.profitAmount,
        backgroundColor: 'rgba(34, 197, 94, 0.7)',
        borderColor: 'rgba(34, 197, 94, 1)',
        borderWidth: 1,
        stack: 'amount'
      },
      {
        label: '亏损金额',
        data: weeklyStats.lossAmount,
        backgroundColor: 'rgba(239, 68, 68, 0.7)',
        borderColor: 'rgba(239, 68, 68, 1)',
        borderWidth: 1,
        stack: 'amount'
      },
      {
        label: '平均盈亏比',
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
          <h2 className={styles.sectionTitle}>绩效图表</h2>
          <p className={styles.sectionSubtitle}>通过时间、交易维度与风控视角拆解盈亏结构。</p>
        </div>
      </div>
      {isEmpty ? (
        <div className={styles.emptyState}>暂无足够数据绘制图表，请调整筛选条件。</div>
      ) : (
        <div className={styles.chartsGrid}>
          <article className={styles.chartCard}>
            <header className={styles.chartHeader}>
              <div>
                <h3 className={styles.chartTitle}>Daily Net Cumulative P&amp;L</h3>
                <p className={styles.chartSubtitle}>累计净盈亏走势与资金曲线。</p>
              </div>
            </header>
            <div className={styles.chartBody}>
              <Line
                options={baseLineOptions}
                data={{
                  labels: dailyCumulative.labels,
                  datasets: [
                    {
                      label: '累计净盈亏',
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
                <h3 className={styles.chartTitle}>Net Daily P&amp;L</h3>
                <p className={styles.chartSubtitle}>每日净盈亏分布。</p>
              </div>
            </header>
            <div className={styles.chartBody}>
              <Bar
                options={baseBarOptions}
                data={{
                  labels: dailyNet.labels,
                  datasets: [
                    {
                      label: '每日净盈亏',
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
                <h3 className={styles.chartTitle}>Trade Duration Performance</h3>
                <p className={styles.chartSubtitle}>持仓时间分段的盈亏与胜率表现（双轴）。</p>
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
                        text: '净盈亏'
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
                        text: '胜率'
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
                <h3 className={styles.chartTitle}>Trade Time Performance</h3>
                <p className={styles.chartSubtitle}>不同交易时间段的盈亏与胜率（双轴）。</p>
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
                        text: '净盈亏'
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
                        text: '胜率'
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
                <h3 className={styles.chartTitle}>Drawdown</h3>
                <p className={styles.chartSubtitle}>累计净值回撤深度。</p>
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
                      label: '回撤',
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
                <h3 className={styles.chartTitle}>Top Profitable / Most Loss Symbols</h3>
                <p className={styles.chartSubtitle}>盈亏贡献最高与最低的标的。</p>
              </div>
            </header>
            <div className={styles.chartBody}>
              <Bar
                options={baseBarOptions}
                data={{
                  labels: symbolPerformance.labels,
                  datasets: [
                    {
                      label: '净盈亏',
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
                <h3 className={styles.chartTitle}>Top Profitable</h3>
                <p className={styles.chartSubtitle}>盈利贡献最高的标的明细。</p>
              </div>
            </header>
            <div className={styles.chartBody}>
              {topProfitableSymbols.length ? (
                <div className={styles.tableWrapper}>
                  <table className={styles.detailTable}>
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Profit</th>
                        <th>Loss</th>
                        <th>Trades</th>
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
                <div className={styles.emptyState}>暂无可展示的盈利标的。</div>
              )}
            </div>
          </article>

          <article className={styles.chartCard}>
            <header className={styles.chartHeader}>
              <div>
                <h3 className={styles.chartTitle}>Most Loss</h3>
                <p className={styles.chartSubtitle}>亏损贡献最高的标的明细。</p>
              </div>
            </header>
            <div className={styles.chartBody}>
              {mostLossSymbols.length ? (
                <div className={styles.tableWrapper}>
                  <table className={styles.detailTable}>
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Profit</th>
                        <th>Loss</th>
                        <th>Trades</th>
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
                <div className={styles.emptyState}>暂无可展示的亏损标的。</div>
              )}
            </div>
          </article>

          <article className={styles.chartCard}>
            <header className={styles.chartHeader}>
              <div>
                <h3 className={styles.chartTitle}>Weekly Statistics</h3>
                <p className={styles.chartSubtitle}>周度净盈亏与交易胜率概览。</p>
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
                        text: '净盈亏'
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
                        text: '胜率'
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
                <h3 className={styles.chartTitle}>Weekly Win/Loss Analysis</h3>
                <p className={styles.chartSubtitle}>盈利金额/亏损金额堆叠柱 + 平均盈亏比折线。</p>
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
                        text: '金额'
                      }
                    },
                    y1: {
                      position: 'right',
                      grid: {
                        drawOnChartArea: false
                      },
                      title: {
                        display: true,
                        text: '平均盈亏比'
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
