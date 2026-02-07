import type {
  StrategyPerformancePoint,
  StrategyPnLCalendarDay
} from '@features/dashboard/types';
import { getMonthLayout } from '../utils/dateAggregation';

export type CalendarCell =
  | { type: 'empty' }
  | { type: 'day'; day: number; pnl: number | null };

export interface BuildMonthCellsInput {
  year: number;
  month: number; // 1-based month index
  days?: StrategyPnLCalendarDay[];
  timezone?: string | null;
}

export const buildSparklinePath = (data: StrategyPerformancePoint[]): string => {
  if (data.length === 0) {
    return '';
  }
  const values = data.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return data
    .map((point, index) => {
      const x = (index / Math.max(data.length - 1, 1)) * 100;
      const normalized = (point.value - min) / range;
      const y = 100 - normalized * 100;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
};

export const buildMonthCells = ({ year, month, days = [], timezone }: BuildMonthCellsInput): CalendarCell[] => {
  const monthIndex = month - 1;
  const { leadingWeekday, totalDays } = getMonthLayout(year, monthIndex, timezone);
  const formattedMonth = `${year}-${String(month).padStart(2, '0')}`;
  const dayMap = new Map(days.map((day) => [day.date, day.pnl]));
  const cells: CalendarCell[] = [];
  for (let index = 0; index < leadingWeekday; index += 1) {
    cells.push({ type: 'empty' });
  }
  for (let day = 1; day <= totalDays; day += 1) {
    const dateKey = `${formattedMonth}-${String(day).padStart(2, '0')}`;
    const pnl = dayMap.has(dateKey) ? (dayMap.get(dateKey) as number) : null;
    cells.push({ type: 'day', day, pnl });
  }
  const trailing = (7 - (cells.length % 7 || 7)) % 7;
  for (let index = 0; index < trailing; index += 1) {
    cells.push({ type: 'empty' });
  }
  return cells;
};
