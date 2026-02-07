const FUTURES_ROOT_PATTERN = /^([A-Z]+)[FGHJKMNQUVXZ]\d{1,4}$/;

export const extractBaseSymbol = (symbol?: string | null): string => {
  if (!symbol) {
    return '';
  }
  const trimmed = symbol.trim();
  if (!trimmed) {
    return '';
  }
  const upper = trimmed.toUpperCase();
  const futuresMatch = upper.match(FUTURES_ROOT_PATTERN);
  if (futuresMatch) {
    return futuresMatch[1];
  }
  const lettersMatch = upper.match(/^[A-Z]+/);
  return lettersMatch ? lettersMatch[0] : upper;
};
