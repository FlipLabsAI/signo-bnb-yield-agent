import { describe, expect, it } from "vitest";
import { marketCheckFrom, marketCheckLines, marketCheckSlugs } from "../src/market-check.js";

const AT = Date.parse("2026-11-25T08:00:00.000Z");

describe("market check", () => {
  it("asks for BNB, ETH, BTC, and three dollar stablecoins", () => {
    expect(marketCheckSlugs()).toEqual(["bnb", "ethereum", "bitcoin", "tether", "usd-coin", "first-digital-usd"]);
  });

  it("is undefined when nothing was read", () => {
    expect(marketCheckFrom(null, AT)).toBeUndefined();
    expect(marketCheckFrom([{ slug: "unknown", priceUsd: 1, change24hPct: null }], AT)).toBeUndefined();
  });

  it("keeps the coin order and marks the stablecoins", () => {
    const check = marketCheckFrom([
      { slug: "tether", priceUsd: 1.0001, change24hPct: 0 },
      { slug: "bnb", priceUsd: 612.5, change24hPct: -1.25 },
    ], AT);
    expect(check?.quotes.map((quote) => [quote.symbol, quote.stable])).toEqual([["BNB", false], ["USDT", true]]);
  });

  it("writes prices, the pegged coins, and one line per coin off its peg", () => {
    const check = marketCheckFrom([
      { slug: "bnb", priceUsd: 612.5, change24hPct: -1.25 },
      { slug: "tether", priceUsd: 1.0001, change24hPct: 0 },
      { slug: "first-digital-usd", priceUsd: 0.987, change24hPct: -1 },
    ], AT);
    expect(marketCheckLines(check)).toEqual([
      "Market check (CoinMarketCap, read 2026-11-25T08:00:00.000Z): BNB $612.50 (-1.3% in 24 hours), USDT $1.0001, FDUSD $0.9870.",
      "USDT is within 0.5% of $1.",
      "FDUSD is at $0.9870 on CoinMarketCap, 1.30% below its $1 peg. A lending rate on FDUSD is paid in FDUSD.",
    ]);
  });
});
