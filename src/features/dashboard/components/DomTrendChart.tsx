import { useMemo } from 'react';
import type { DomTrendPoint } from '../types';
import styles from './DomTrendChart.module.css';

interface DomTrendChartProps {
  data: DomTrendPoint[];
}

const VIEW_WIDTH = 800;
const VIEW_HEIGHT = 160;

function DomTrendChart({ data }: DomTrendChartProps) {
  const points = useMemo(() => {
    if (!data.length) {
      return [] as DomTrendPoint[];
    }
    return data.slice(-120);
  }, [data]);

  if (points.length === 0) {
    return (
      <div className={styles.empty} role="status">
        暂无 DOM 趋势数据，等待订阅返回指标。
      </div>
    );
  }

  const stepX = points.length > 1 ? VIEW_WIDTH / (points.length - 1) : VIEW_WIDTH;
  const ratioToY = (ratio: number) => {
    const clamped = Math.max(-1, Math.min(1, ratio));
    return ((1 - (clamped + 1) / 2) * (VIEW_HEIGHT - 24)) + 12;
  };

  const linePath = points
    .map((point, index) => {
      const x = index * stepX;
      const y = ratioToY(point.imbalanceRatio);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  const areaPath = `${linePath} L${(points.length - 1) * stepX},${ratioToY(0).toFixed(2)} L0,${ratioToY(0).toFixed(2)} Z`;

  return (
    <svg
      className={styles.chart}
      width="100%"
      viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="DOM 趋势指标"
    >
      <defs>
        <linearGradient id="dom-trend-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(59, 130, 246, 0.35)" />
          <stop offset="100%" stopColor="rgba(59, 130, 246, 0.05)" />
        </linearGradient>
      </defs>
      <rect x={0} y={0} width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="#ffffff" rx={12} />
      <line
        x1={0}
        y1={ratioToY(0)}
        x2={VIEW_WIDTH}
        y2={ratioToY(0)}
        stroke="rgba(148, 163, 184, 0.35)"
        strokeDasharray="6 6"
      />
      <path d={areaPath} fill="url(#dom-trend-gradient)" stroke="none" />
      <path d={linePath} fill="none" stroke="rgba(59, 130, 246, 0.8)" strokeWidth={2} />
      {points.map((point, index) => {
        const x = index * stepX;
        const height = Math.min(38, Math.max(4, Math.abs(point.momentum) * 240));
        const positive = point.momentum >= 0;
        return (
          <rect
            key={`momentum-${point.timestamp}`}
            x={x - 2}
            y={VIEW_HEIGHT - height - 8}
            width={4}
            height={height}
            fill={positive ? 'rgba(34, 197, 94, 0.55)' : 'rgba(248, 113, 113, 0.55)'}
          />
        );
      })}
    </svg>
  );
}

export default DomTrendChart;
