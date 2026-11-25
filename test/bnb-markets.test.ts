import { describe, expect, it } from "vitest";
import { parseBnbMarkets } from "../src/bnb-markets.js";

const USDT = "0x55d398326f99059fF775485246999027B3197955";
const FAKE_USDT = "0x1111111111111111111111111111111111111111";

const pool = (over: Record<string, unknown>) => ({
  pool: "p", chain: "BSC", project: "venus-core-pool", exposure: "single", underlyingTokens: [USDT],
  tvlUsd: 10_000_000, apy: 3, apyBase: 3, apyReward: 0, apyMean30d: 2.8, ...over,
});

describe("parseBnbMarkets", () => {
  it("keeps the three lenders on BNB Chain with canonical tokens and enough deposits", () => {
    const markets = parseBnbMarkets({ data: [
      pool({ pool: "venus", apy: 3.6 }),
      pool({ pool: "aave", project: "aave-v3", apy: 2.2, apyReward: null }),
      pool({ pool: "other-chain", chain: "Ethereum" }),
      pool({ pool: "other-project", project: "some-dex" }),
      pool({ pool: "same-symbol-other-contract", underlyingTokens: [FAKE_USDT] }),
      pool({ pool: "small", project: "lista-lending", tvlUsd: 50_000 }),
      pool({ pool: "lp", exposure: "multi" }),
    ] });
    expect(markets.map((market) => [market.pool, market.lender, market.token, market.apyPct])).toEqual([
      ["venus", "Venus", "USDT", 3.6],
      ["aave", "Aave V3", "USDT", 2.2],
    ]);
  });

  it("keeps the largest market per lender and token", () => {
    const markets = parseBnbMarkets({ data: [
      pool({ pool: "small-vault", project: "lista-lending", tvlUsd: 2_000_000, apy: 9 }),
      pool({ pool: "large-vault", project: "lista-lending", tvlUsd: 40_000_000, apy: 2 }),
    ] });
    expect(markets.map((market) => market.pool)).toEqual(["large-vault"]);
  });

  it("matches token addresses in any letter case", () => {
    expect(parseBnbMarkets({ data: [pool({ underlyingTokens: [USDT.toLowerCase()] })] })).toHaveLength(1);
  });

  it("returns nothing for a bad body", () => {
    expect(parseBnbMarkets(null)).toEqual([]);
    expect(parseBnbMarkets({ data: "x" })).toEqual([]);
  });
});
