import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { SymbolInfo } from '../types';
import styles from './SymbolCombobox.module.css';

interface SymbolComboboxProps {
  value: string;
  symbols: SymbolInfo[];
  onChange: (symbol: string) => void;
}

interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  source: 'history' | 'popular';
}

const STORAGE_KEY = 'dashboard.symbolHistory';
const MAX_HISTORY = 12;

const normalize = (input: string): string => input.trim().toUpperCase();

const toOption = (symbol: SymbolInfo): ComboboxOption => ({
  value: normalize(symbol.symbol),
  label: normalize(symbol.symbol),
  description: symbol.description,
  source: 'popular'
});

const loadHistory = (): ComboboxOption[] => {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const text = window.localStorage.getItem(STORAGE_KEY);
    if (!text) {
      return [];
    }
    const payload = JSON.parse(text) as Array<{ value: string; description?: string }>;
    if (!Array.isArray(payload)) {
      return [];
    }
    return payload
      .map((item) => ({
        value: normalize(item.value),
        label: normalize(item.value),
        description: item.description,
        source: 'history' as const
      }))
      .filter((item) => item.value.length > 0);
  } catch (error) {
    console.warn('无法解析保存的合约历史：', error);
    return [];
  }
};

const persistHistory = (items: ComboboxOption[]) => {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    const payload = items.slice(0, MAX_HISTORY).map((item) => ({ value: item.value, description: item.description }));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('无法写入合约历史：', error);
  }
};

const mergeOptions = (history: ComboboxOption[], popular: ComboboxOption[]): ComboboxOption[] => {
  const map = new Map<string, ComboboxOption>();
  for (const entry of history) {
    if (!map.has(entry.value)) {
      map.set(entry.value, entry);
    }
  }
  for (const entry of popular) {
    if (!map.has(entry.value)) {
      map.set(entry.value, entry);
    }
  }
  return Array.from(map.values());
};

const filterOptions = (options: ComboboxOption[], query: string): ComboboxOption[] => {
  const normalized = normalize(query);
  if (normalized.length < 2) {
    return options;
  }
  return options.filter((option) => {
    if (option.value.includes(normalized)) {
      return true;
    }
    if (option.description) {
      return option.description.toUpperCase().includes(normalized);
    }
    return false;
  });
};

function SymbolCombobox({ value, symbols, onChange }: SymbolComboboxProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const [history, setHistory] = useState<ComboboxOption[]>([]);
  const [inputValue, setInputValue] = useState(() => normalize(value));
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);

  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  useEffect(() => {
    setInputValue(normalize(value));
  }, [value]);

  const popularOptions = useMemo(() => symbols.map(toOption), [symbols]);
  const combinedOptions = useMemo(() => mergeOptions(history, popularOptions), [history, popularOptions]);
  const filteredOptions = useMemo(() => filterOptions(combinedOptions, inputValue), [combinedOptions, inputValue]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setHighlightIndex(-1);
        if (inputValue.trim().length > 0) {
          onChange(normalize(inputValue));
        }
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, inputValue, onChange]);

  useEffect(() => {
    if (!open || highlightIndex < 0) {
      return;
    }
    const list = listRef.current;
    const item = list?.children[highlightIndex] as HTMLElement | undefined;
    if (item && list) {
      const itemTop = item.offsetTop;
      const itemBottom = itemTop + item.offsetHeight;
      if (itemTop < list.scrollTop) {
        list.scrollTop = itemTop;
      } else if (itemBottom > list.scrollTop + list.clientHeight) {
        list.scrollTop = itemBottom - list.clientHeight;
      }
    }
  }, [highlightIndex, open]);

  const handleSelect = (option: ComboboxOption) => {
    const normalizedValue = normalize(option.value);
    setInputValue(normalizedValue);
    setOpen(false);
    setHighlightIndex(-1);
    onChange(normalizedValue);

    setHistory((previous) => {
      const next = [
        { ...option, value: normalizedValue, label: normalizedValue, source: 'history' as const },
        ...previous.filter((item) => item.value !== normalizedValue)
      ].slice(0, MAX_HISTORY);
      persistHistory(next);
      return next;
    });
  };

  const commitInput = () => {
    const normalizedValue = normalize(inputValue);
    if (!normalizedValue) {
      return;
    }
    const matched = filteredOptions.find((option) => option.value === normalizedValue);
    if (matched) {
      handleSelect(matched);
      return;
    }
    const synthetic: ComboboxOption = {
      value: normalizedValue,
      label: normalizedValue,
      source: 'history'
    };
    handleSelect(synthetic);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setHighlightIndex((index) => {
        const next = Math.min(filteredOptions.length - 1, index + 1);
        return next;
      });
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightIndex((index) => Math.max(0, index - 1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      if (highlightIndex >= 0 && highlightIndex < filteredOptions.length) {
        handleSelect(filteredOptions[highlightIndex]);
      } else {
        commitInput();
      }
      return;
    }
    if (event.key === 'Escape') {
      setOpen(false);
      setHighlightIndex(-1);
    }
  };

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.inputWrapper}>
        <input
          className={styles.input}
          value={inputValue}
          placeholder="输入或选择合约"
          onChange={(event) => {
            setInputValue(event.target.value);
            setOpen(true);
            setHighlightIndex(-1);
          }}
          onFocus={() => {
            setOpen(true);
          }}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className={styles.toggleButton}
          aria-label={open ? '收起合约列表' : '展开合约列表'}
          onClick={() => {
            setOpen((previous) => !previous);
            setHighlightIndex(-1);
          }}
        >
          <span aria-hidden="true">▾</span>
        </button>
      </div>
      {open && filteredOptions.length > 0 ? (
        <ul className={styles.dropdown} ref={listRef} role="listbox">
          {filteredOptions.map((option, index) => (
            <li
              key={`${option.source}:${option.value}`}
              className={`${styles.option} ${index === highlightIndex ? styles.optionActive : ''}`.trim()}
              role="option"
              aria-selected={index === highlightIndex}
              onMouseDown={(event) => {
                event.preventDefault();
                handleSelect(option);
              }}
            >
              <div className={styles.optionLabel}>{option.label}</div>
              {option.description ? <div className={styles.optionDescription}>{option.description}</div> : null}
              <span className={styles.optionBadge}>{option.source === 'history' ? '历史' : '热门'}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default SymbolCombobox;
