import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createFinancialModelingPrepProvider } from "./fmp";

const fmpApiKey = process.env.FMP_API_KEY ?? readLocalEnv("FMP_API_KEY");
const shouldRunLiveTest =
  process.env.RUN_LIVE_MARKET_DATA_TESTS === "1" && fmpApiKey;
const runIfEnabled = shouldRunLiveTest ? it : it.skip;

describe("FinancialModelingPrepProvider live smoke test", () => {
  runIfEnabled(
    "fetches and normalizes AAPL profile, latest price, and historical prices",
    async () => {
      const provider = createFinancialModelingPrepProvider({
        apiKey: fmpApiKey,
      });

      const [profile, latestPrice, historicalPrices] = await Promise.all([
        provider.getCompanyProfile("AAPL"),
        provider.getLatestPrice("AAPL"),
        provider.getHistoricalPrices("AAPL", { limit: 3 }),
      ]);

      expect(profile).toMatchObject({
        ok: true,
        provider: "financial-modeling-prep",
        data: {
          symbol: "AAPL",
          currency: "USD",
        },
      });

      expect(latestPrice).toMatchObject({
        ok: true,
        provider: "financial-modeling-prep",
        data: {
          symbol: "AAPL",
        },
      });
      expect(latestPrice.ok && latestPrice.data.close).toBeGreaterThan(0);

      expect(historicalPrices).toMatchObject({
        ok: true,
        provider: "financial-modeling-prep",
      });
      expect(historicalPrices.ok && historicalPrices.data.length).toBeGreaterThan(
        0,
      );
      expect(historicalPrices.ok && historicalPrices.data[0]?.close).toBeGreaterThan(
        0,
      );
    },
    20_000,
  );
});

function readLocalEnv(name: string) {
  const envPath = resolve(process.cwd(), ".env.local");

  if (!existsSync(envPath)) {
    return undefined;
  }

  const line = readFileSync(envPath, "utf8")
    .split("\n")
    .find((entry) => entry.trim().startsWith(`${name}=`));

  if (!line) {
    return undefined;
  }

  const value = line.slice(line.indexOf("=") + 1).trim();

  return value.replace(/^['"]|['"]$/g, "") || undefined;
}
