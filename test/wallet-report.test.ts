import { describe, expect, it, vi } from "vitest";
import type { BnbMarket } from "../src/bnb-markets.js";
import { buildReport } from "../src/report.js";
import { balanceOfData, fromUnits, isAddress, readHoldings } from "../src/wallet.js";

const OWNER = "0x00000000000000000000000000000000000000aB";

describe("wallet", () => {
  it("checks addresses and builds balanceOf call data", () => {
    expect(isAddress(OWNER)).toBe(true);
    expect(isAddress("0x123")).toBe(false);
    expect(balanceOfData(OWNER)).toBe(`0x70a08231${"0".repeat(62)}ab`);
  });

  it("converts units", () => {
    expect(fromUnits("0x0de0b6b3a7640000", 18)).toBe(1);
    expect(fromUnits("0x06f05b59d3b20000", 18)).toBe(0.5);
    expect(fromUnits("0x", 18)).toBe(0);
  });

  it("reads BNB and token balances and leaves out zeros", async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body)) as { method: string; params: [{ to?: string }] };
      const usdt = request.method === "eth_call" && request.params[0].to === "0x55d398326f99059fF775485246999027B3197955";
      const result = request.method === "eth_getBalance" ? "0x06f05b59d3b20000" : usdt ? "0x0de0b6b3a7640000" : "0x0";
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    });
    expect(await readHoldings(OWNER, "http://rpc.test", fetchImpl as unknown as typeof fetch))
      .toEqual([{ symbol: "BNB", amount: 0.5 }, { symbol: "USDT", amount: 1 }]);
  });

  it("returns null when the RPC fails, and refuses a bad address", async () => {
    const failing = (async () => new Response(JSON.stringify({ error: { message: "down" } }))) as typeof fetch;
    expect(await readHoldings(OWNER, "http://rpc.test", failing)).toBeNull();
    await expect(readHoldings("bob", "http://rpc.test", failing)).rejects.toThrow(/Not a wallet address/);
  });
});

describe("report", () => {
  const markets: BnbMarket[] = [
    { pool: "a", lender: "Venus", token: "USDT", apyPct: 3.64, apyBasePct: 3.64, apyRewardPct: 0, apyMean30dPct: null, tvlUsd: 36_500_000 },
    { pool: "b", lender: "Aave V3", token: "USDT", apyPct: 2.24, apyBasePct: 2.24, apyRewardPct: 0, apyMean30dPct: null, tvlUsd: 19_400_000 },
  ];

  it("lists rates, says the check was not read, and stays quiet when a condition fails", () => {
    const report = buildReport({
      at: Date.parse("2026-11-25T08:00:00.000Z"),
      minTvlUsd: 1_000_000,
      markets,
      check: undefined,
      holdings: undefined,
      conditions: [{ type: "rateAbove", token: "USDT", minApyPct: 3 }, { type: "pegWithin", token: "USDT", maxGapPct: 0.5 }],
    });
    expect(report.allMet).toBe(false);
    expect(report.lines).toContain("- USDT: Venus 3.64% ($36.5M), Aave V3 2.24% ($19.4M)");
    expect(report.lines).toContain("Market check: not read (set CMC_PRO_API_KEY).");
    expect(report.lines).toContain("[x] Best USDT rate: 3.64% on Venus (wanted 3.00% or more).");
    expect(report.lines).toContain("1 of 2 conditions are true. The agent stays quiet.");
  });
});
