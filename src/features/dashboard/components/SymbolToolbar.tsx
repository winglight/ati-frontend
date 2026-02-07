import { ChangeEvent } from 'react';
import styles from './SymbolToolbar.module.css';
import { SymbolInfo, TimeframeOption } from '../types';

interface SymbolToolbarProps {
  symbols: SymbolInfo[];
  selectedSymbol: string;
  timeframes: TimeframeOption[];
  selectedTimeframe: string;
  onSymbolChange?: (symbol: string) => void;
  onTimeframeChange?: (timeframe: string) => void;
}

function SymbolToolbar({
  symbols,
  selectedSymbol,
  timeframes,
  selectedTimeframe,
  onSymbolChange,
  onTimeframeChange
}: SymbolToolbarProps) {
  const handleSymbolChange = (event: ChangeEvent<HTMLSelectElement>) => {
    onSymbolChange?.(event.target.value);
  };

  const handleTimeframeClick = (value: string) => () => {
    onTimeframeChange?.(value);
  };

  return (
    <div className={styles.toolbar}>
      <div className={styles.group}>
        <select className={styles.select} value={selectedSymbol} onChange={handleSymbolChange}>
          {symbols.map((symbol) => (
            <option key={symbol.symbol} value={symbol.symbol}>
              {symbol.symbol} · {symbol.description}
            </option>
          ))}
        </select>
        <div className={styles.group}>
          {timeframes.map((timeframe) => (
            <button
              key={timeframe.value}
              type="button"
              className={`${styles.timeframeButton} ${
                timeframe.value === selectedTimeframe ? styles.timeframeActive : ''
              }`}
              onClick={handleTimeframeClick(timeframe.value)}
            >
              {timeframe.label}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.group}>
        <button type="button" className={styles.secondaryButton}>
          订阅设置
        </button>
        <button type="button" className={styles.actionButton}>
          快速下单
        </button>
      </div>
    </div>
  );
}

export default SymbolToolbar;
