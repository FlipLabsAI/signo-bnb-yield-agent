import { afterEach, describe, expect, it, vi } from "vitest";
import { cmcQuotes, parseCmcQuotes, resetCmcCacheForTests } from "../src/coinmarketcap.js";

const body = {
  data: {
    "1839": { slug: "bnb", symbol: "BNB", quote: { USD: { price: 612.5, percent_change_24h: -1.25, last_updated: "2026-11-25T08:00:00.000Z" } } },
    "825": [{ slug: "tether", symbol: "USDT", quote: { USD: { price: 1.0002, percent_change_24h: 0.01, last_updated: "2026-11-25T08:00:00.000Z" } } }],
    "9999": { slug: "broken", symbol: "BRK", quote: { USD: { price: null } } },
  },
};

const okResponse = () => new Response(JSON.stringify(body), { status: 200 });

afterEach(() => {
  resetCmcCacheForTests();
  vi.unstubAllEnvs();
});

describe("parseCmcQuotes", () => {
  it("reads rows with a USD price and leaves out the rest", () => {
    const quotes = parseCmcQuotes(body).sort((a, b) => a.slug.localeCompare(b.slug));
    expect(quotes).toEqual([
      { slug: "bnb", symbol: "BNB", priceUsd: 612.5, change24hPct: -1.25, updatedAt: Date.parse("2026-11-25T08:00:00.000Z") },
      { slug: "tether", symbol: "USDT", priceUsd: 1.0002, change24hPct: 0.01, updatedAt: Date.parse("2026-11-25T08:00:00.000Z") },
    ]);
  });

  it("returns nothing for a body with no data", () => {
    expect(parseCmcQuotes(null)).toEqual([]);
    expect(parseCmcQuotes({ status: { error_code: 1001 } })).toEqual([]);
  });
});

describe("cmcQuotes", () => {
  it("returns null and makes no call with no key", async () => {
    vi.stubEnv("CMC_PRO_API_KEY", "");
    const fetchImpl = vi.fn();
    expect(await cmcQuotes(["bnb"], fetchImpl as unknown as typeof fetch)).toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("sends the key in a header, never in the URL, and caches the answer", async () => {
    vi.stubEnv("CMC_PRO_API_KEY", "test-key");
    const fetchImpl = vi.fn(async () => okResponse());
    const first = await cmcQuotes(["tether", "bnb"], fetchImpl as unknown as typeof fetch, 1_000);
    const second = await cmcQuotes(["bnb", "tether"], fetchImpl as unknown as typeof fetch, 2_000);
    expect(first).toHaveLength(2);
    expect(second).toBe(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("slug=bnb%2Ctether");
    expect(url).not.toContain("test-key");
    expect((init.headers as Record<string, string>)["X-CMC_PRO_API_KEY"]).toBe("test-key");
  });

  it("returns null on an error status or a thrown fetch", async () => {
    vi.stubEnv("CMC_PRO_API_KEY", "test-key");
    expect(await cmcQuotes(["bnb"], (async () => new Response("{}", { status: 401 })) as typeof fetch)).toBeNull();
    expect(await cmcQuotes(["bnb"], (async () => { throw new Error("offline"); }) as typeof fetch)).toBeNull();
  });
});
