import { describe, expect, it, vi } from "vitest";
import { ATLAS_FEEDS, atlasPrices, parseLatestRoundData } from "../src/atlas.js";

const NOW = Date.parse("2026-11-25T08:00:00.000Z");
const word = (value: bigint) => value.toString(16).padStart(64, "0");
/** latestRoundData() output: roundId, answer, startedAt, updatedAt, answeredInRound. */
const round = (answer: bigint, updatedAtS: number) =>
  `0x${word(7n)}${word(answer)}${word(BigInt(updatedAtS))}${word(BigInt(updatedAtS))}${word(7n)}`;

describe("Atlas feeds", () => {
  it("reads BNB, BTC, and ETH, and no stablecoin", () => {
    expect(ATLAS_FEEDS.map((feed) => feed.symbol)).toEqual(["BNB", "BTC", "ETH"]);
    for (const feed of ATLAS_FEEDS) expect(feed.address).toMatch(/^0x[0-9a-f]{40}$/);
  });

  it("parses latestRoundData", () => {
    expect(parseLatestRoundData(round(61_250_000_000n, 1_700_000_000), 8)).toEqual({ priceUsd: 612.5, updatedAtS: 1_700_000_000 });
    expect(parseLatestRoundData("0x1234", 8)).toBeNull();
    expect(parseLatestRoundData(round(0n, 1_700_000_000), 8)).toBeNull();
    expect(parseLatestRoundData(round((1n << 256n) - 1n, 1_700_000_000), 8)).toBeNull();
  });

  it("reads each feed, and leaves out a stale or failing feed", async () => {
    const nowS = NOW / 1000;
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const request = JSON.parse(String(init.body)) as { params: [{ to: string; data: string }] };
      const { to, data } = request.params[0];
      if (to === ATLAS_FEEDS[2]?.address) return new Response(JSON.stringify({ error: { message: "reverted" } }));
      const result = data === "0x313ce567"
        ? `0x${word(8n)}`
        : to === ATLAS_FEEDS[0]?.address
          ? round(61_250_000_000n, nowS - 30)
          : round(9_000_000_000_000n, nowS - 3_600);
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }));
    });
    expect(await atlasPrices("http://rpc.test", fetchImpl as unknown as typeof fetch, NOW)).toEqual([
      { symbol: "BNB", feedId: 633, priceUsd: 612.5, updatedAt: NOW - 30_000 },
    ]);
  });

  it("returns null when no feed answers", async () => {
    const failing = (async () => new Response(JSON.stringify({ error: { message: "down" } }))) as typeof fetch;
    expect(await atlasPrices("http://rpc.test", failing, NOW)).toBeNull();
  });
});
