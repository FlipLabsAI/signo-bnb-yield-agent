import { describe, expect, it } from "vitest";
import type { BnbMarket } from "../src/bnb-markets.js";
import { evaluate, evaluateAll, parseConditions, type Inputs } from "../src/conditions.js";
import { marketCheckFrom } from "../src/market-check.js";

const market = (lender: string, token: string, apyPct: number): BnbMarket => ({
  pool: `${lender}-${token}`, lender, token, apyPct, apyBasePct: apyPct, apyRewardPct: 0, apyMean30dPct: null, tvlUsd: 10_000_000,
});

const inputs: Inputs = {
  markets: [market("Venus", "USDT", 3.64), market("Aave V3", "USDT", 2.24), market("Venus", "BTCB", 0.1)],
  check: marketCheckFrom([
    { slug: "bnb", priceUsd: 600, change24hPct: -2.4 },
    { slug: "bitcoin", priceUsd: 90_000, change24hPct: 1 },
    { slug: "tether", priceUsd: 1.0003, change24hPct: 0 },
  ], 0),
  holdings: [{ symbol: "USDT", amount: 250 }, { symbol: "BTCB", amount: 0.01 }],
};

describe("conditions", () => {
  it("checks the best rate", () => {
    expect(evaluate({ type: "rateAbove", token: "USDT", minApyPct: 3 }, inputs).met).toBe(true);
    expect(evaluate({ type: "rateAbove", token: "USDT", minApyPct: 4 }, inputs).met).toBe(false);
    expect(evaluate({ type: "rateAbove", token: "ETH", minApyPct: 0 }, inputs).met).toBe(false);
  });

  it("checks the gap between the best and the next lender", () => {
    const result = evaluate({ type: "rateGapAbove", token: "USDT", minGapPct: 1 }, inputs);
    expect(result.met).toBe(true);
    expect(result.line).toBe("Venus pays 1.40% more on USDT than Aave V3 (3.64% vs 2.24%; wanted 1.00% or more).");
    expect(evaluate({ type: "rateGapAbove", token: "BTCB", minGapPct: 0 }, inputs).met).toBe(false);
  });

  it("checks the peg and the 24-hour move on CoinMarketCap", () => {
    expect(evaluate({ type: "pegWithin", token: "USDT", maxGapPct: 0.5 }, inputs).met).toBe(true);
    expect(evaluate({ type: "pegWithin", token: "USDT", maxGapPct: 0.01 }, inputs).met).toBe(false);
    expect(evaluate({ type: "priceMoveWithin", symbol: "BNB", maxAbsPct: 5 }, inputs).met).toBe(true);
    expect(evaluate({ type: "priceMoveWithin", symbol: "BNB", maxAbsPct: 2 }, inputs).met).toBe(false);
  });

  it("values holdings at the CoinMarketCap price, with BTCB at the BTC price", () => {
    expect(evaluate({ type: "holdingAbove", token: "USDT", minUsd: 200 }, inputs).met).toBe(true);
    expect(evaluate({ type: "holdingAbove", token: "BTCB", minUsd: 800 }, inputs).met).toBe(true);
    expect(evaluate({ type: "holdingAbove", token: "BTCB", minUsd: 1_000 }, inputs).met).toBe(false);
  });

  it("treats missing data as not true", () => {
    const bare: Inputs = { markets: inputs.markets, check: undefined, holdings: undefined };
    expect(evaluate({ type: "pegWithin", token: "USDT", maxGapPct: 5 }, bare).met).toBe(false);
    expect(evaluate({ type: "holdingAbove", token: "USDT", minUsd: 0 }, bare).met).toBe(false);
  });

  it("needs every condition to be true", () => {
    expect(evaluateAll([
      { type: "rateAbove", token: "USDT", minApyPct: 3 },
      { type: "pegWithin", token: "USDT", maxGapPct: 0.5 },
    ], inputs).allMet).toBe(true);
    expect(evaluateAll([
      { type: "rateAbove", token: "USDT", minApyPct: 3 },
      { type: "rateAbove", token: "USDT", minApyPct: 5 },
    ], inputs).allMet).toBe(false);
    expect(evaluateAll([], inputs).allMet).toBe(false);
  });
});

describe("parseConditions", () => {
  it("reads a good list and drops extra fields", () => {
    expect(parseConditions([{ type: "rateAbove", token: "USDT", minApyPct: 3, note: "x" }]))
      .toEqual([{ type: "rateAbove", token: "USDT", minApyPct: 3 }]);
  });

  it("refuses unknown types, missing fields, and bad values", () => {
    expect(() => parseConditions([])).toThrow();
    expect(() => parseConditions([{ type: "moveFunds" }])).toThrow(/unknown type/);
    expect(() => parseConditions([{ type: "rateAbove", minApyPct: 3 }])).toThrow(/token/);
    expect(() => parseConditions([{ type: "rateAbove", token: "USDT", minApyPct: "3" }])).toThrow(/minApyPct/);
  });
});
