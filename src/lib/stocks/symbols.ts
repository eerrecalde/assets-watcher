const NORMALIZED_STOCK_SYMBOL_PATTERN = /^[A-Z][A-Z0-9.-]{0,14}$/;

export function normalizeStockSymbol(symbol: string) {
  return symbol.trim().toUpperCase();
}

export function isValidNormalizedStockSymbol(symbol: string) {
  return NORMALIZED_STOCK_SYMBOL_PATTERN.test(symbol);
}

export function getStockDetailPath(symbol: string) {
  return `/stocks/${encodeURIComponent(normalizeStockSymbol(symbol))}`;
}
