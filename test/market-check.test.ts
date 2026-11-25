import { describe, expect, it } from "vitest";
import { marketCheckFrom, marketCheckLines, marketCheckSlugs, priceAgreed } from "../src/market-check.js";

const AT = Date.parse("2026-11-25T08:00:00.000Z");

describe("market check", () => {
  it("asks for BNB, ETH, BTC, and three dollar stablecoins", () => {
    expect(marketCheckSlugs()).toEqual(["bnb", "ethereum", "bitcoin", "tether", "usd-coin", "first-digital-usd"]);
  });

  it("is undefined when nothing was read", () => {
    expect(marketCheckFrom(null, AT)).toBeUndefined();
    expect(marketCheckFrom(null, AT, null)).toBeUndefined();
    expect(marketCheckFrom([{ slug: "unknown", priceUsd: 1, change24hPct: null }], AT)).toBeUndefined();
  });

  it("keeps the coin order and marks the stablecoins", () => {
    const check = marketCheckFrom([
      { slug: "tether", priceUsd: 1.0001, change24hPct: 0 },
      { slug: "bnb", priceUsd: 612.5, change24hPct: -1.25 },
    ], AT);
    expect(check?.quotes.map((quote) => [quote.symbol, quote.stable, quote.source])).toEqual([
      ["BNB", false, "CoinMarketCap"],
      ["USDT", true, "CoinMarketCap"],
    ]);
  });

  it("writes prices, the pegged coins, and one line per coin off its peg", () => {
    const check = marketCheckFrom([
      { slug: "bnb", priceUsd: 612.5, change24hPct: -1.25 },
      { slug: "tether", priceUsd: 1.0001, change24hPct: 0 },
      { slug: "first-digital-usd", priceUsd: 0.987, change24hPct: -1 },
    ], AT);
    expect(marketCheckLines(check)).toEqual([
      "Market check (read 2026-11-25T08:00:00.000Z): BNB $612.50 (-1.3% in 24 hours), USDT $1.0001, FDUSD $0.9870.",
      "Prices: BNB, USDT, and FDUSD from CoinMarketCap.",
      "USDT is within 0.5% of $1.",
      "FDUSD is at $0.9870 on CoinMarketCap, 1.30% below its $1 peg. A lending rate on FDUSD is paid in FDUSD.",
    ]);
  });
});

describe("market check with Atlas", () => {
  const cmc = [
    { slug: "bnb", priceUsd: 610, change24hPct: -1.25 },
    { slug: "bitcoin", priceUsd: 90_100, change24hPct: 0.5 },
    { slug: "tether", priceUsd: 1.0001, change24hPct: 0 },
  ];

  it("takes BNB, ETH, and BTC from Atlas, the 24-hour move and the stablecoins from CoinMarketCap", () => {
    const check = marketCheckFrom(cmc, AT, [
      { symbol: "BNB", priceUsd: 612.5 },
      { symbol: "ETH", priceUsd: 3_000 },
      { symbol: "BTC", priceUsd: 90_000 },
      { symbol: "USDT", priceUsd: 0.9 },
    ]);
    expect(check?.quotes).toEqual([
      { symbol: "BNB", priceUsd: 612.5, source: "Atlas", change24hPct: -1.25, stable: false, cmcPriceUsd: 610 },
      { symbol: "ETH", priceUsd: 3_000, source: "Atlas", change24hPct: null, stable: false, cmcPriceUsd: null },
      { symbol: "BTC", priceUsd: 90_000, source: "Atlas", change24hPct: 0.5, stable: false, cmcPriceUsd: 90_100 },
      { symbol: "USDT", priceUsd: 1.0001, source: "CoinMarketCap", change24hPct: 0, stable: true, cmcPriceUsd: null },
    ]);
    expect(marketCheckLines(check)).toEqual([
      "Market check (read 2026-11-25T08:00:00.000Z): BNB $612.50 (-1.3% in 24 hours), ETH $3,000.00, BTC $90,000.00 (+0.5% in 24 hours), USDT $1.0001.",
      "Prices: BNB, ETH, and BTC from Atlas price feeds on BNB Chain; USDT from CoinMarketCap. 24-hour moves from CoinMarketCap.",
      "Atlas and CoinMarketCap agree within 1% on BNB and BTC.",
      "USDT is within 0.5% of $1.",
    ]);
  });

  it("names a price the two sources disagree on and does not agree it", () => {
    const check = marketCheckFrom(cmc, AT, [{ symbol: "BNB", priceUsd: 650 }]);
    const bnb = check?.quotes[0];
    expect(bnb && priceAgreed(bnb)).toBe(false);
    expect(marketCheckLines(check)).toContain(
      "BNB: Atlas $650.00, CoinMarketCap $610.00, 6.56% apart. The agent does not use this price.");
  });

  it("works on Atlas alone and says what is missing", () => {
    expect(marketCheckLines(marketCheckFrom(null, AT, [{ symbol: "BNB", priceUsd: 612.5 }]))).toEqual([
      "Market check (read 2026-11-25T08:00:00.000Z): BNB $612.50.",
      "Prices: BNB from Atlas price feeds on BNB Chain.",
      "CoinMarketCap: not read (set CMC_PRO_API_KEY), so there is no peg check and no 24-hour move.",
    ]);
  });
});
