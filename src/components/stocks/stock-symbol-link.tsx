import Link from "next/link";

import { getStockDetailPath, normalizeStockSymbol } from "@/lib/stocks/symbols";

type StockSymbolLinkProps = {
  className?: string;
  symbol: string;
};

export function StockSymbolLink({
  className = "",
  symbol,
}: StockSymbolLinkProps) {
  const normalizedSymbol = normalizeStockSymbol(symbol);

  return (
    <Link
      aria-label={`View ${normalizedSymbol} stock details`}
      className={className}
      href={getStockDetailPath(normalizedSymbol)}
    >
      {normalizedSymbol}
    </Link>
  );
}
