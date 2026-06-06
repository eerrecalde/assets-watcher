import { describe, expect, it } from "vitest";

import {
  getStockDetailPath,
  isValidNormalizedStockSymbol,
  normalizeStockSymbol,
} from "./symbols";

describe("stock symbol helpers", () => {
  it("trims and uppercases route symbols", () => {
    expect(normalizeStockSymbol(" aapl ")).toBe("AAPL");
    expect(normalizeStockSymbol("Brk.b")).toBe("BRK.B");
  });

  it("accepts normalized stock symbols supported by the cache schema", () => {
    expect(isValidNormalizedStockSymbol("AAPL")).toBe(true);
    expect(isValidNormalizedStockSymbol("BRK.B")).toBe(true);
    expect(isValidNormalizedStockSymbol("RDS-A")).toBe(true);
  });

  it("rejects empty or unnormalized symbols", () => {
    expect(isValidNormalizedStockSymbol("")).toBe(false);
    expect(isValidNormalizedStockSymbol("aapl")).toBe(false);
    expect(isValidNormalizedStockSymbol("1AAPL")).toBe(false);
  });

  it("builds normalized stock detail paths", () => {
    expect(getStockDetailPath(" aapl ")).toBe("/stocks/AAPL");
    expect(getStockDetailPath("brk.b")).toBe("/stocks/BRK.B");
  });
});
