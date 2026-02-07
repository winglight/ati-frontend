import { useEffect, useRef, useState } from 'react';

export function useThrottledValue<T>(value: T, intervalMs: number): T {
  const [throttled, setThrottled] = useState<T>(value);
  const lastUpdateRef = useRef<number>(0);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastUpdateRef.current;

    if (elapsed >= intervalMs) {
      lastUpdateRef.current = now;
      setThrottled(value);
    } else {
      if (timeoutRef.current != null) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => {
        lastUpdateRef.current = Date.now();
        setThrottled(value);
        timeoutRef.current = null;
      }, intervalMs - elapsed);
    }

    return () => {
      if (timeoutRef.current != null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [value, intervalMs]);

  return throttled;
}

export default useThrottledValue;