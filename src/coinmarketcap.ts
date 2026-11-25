// CoinMarketCap Pro API, server side only. The key is CMC_PRO_API_KEY in the
// environment. It never goes to a browser or a repository. With no key every
// read returns null and the callers go on without it.
//
// One call: GET /v2/cryptocurrency/quotes/latest?slug=... (the free Basic plan
// has it). We ask by slug, not by symbol, because a symbol can name several coins.

const CMC_QUOTES_URL = "https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest";
const TIMEOUT_MS = 6_000;
const CACHE_MS = 5 * 60_000;

export type CmcQuote = {
  /** CoinMarketCap's slug, the key we asked by ("tether"). */
  slug: string;
  symbol: string;
  priceUsd: number;
  /** Percent, as CoinMarketCap gives it (-1.2 is down 1.2%). */
  change24hPct: number | null;
  /** When CoinMarketCap last updated the quote (ms). */
  updatedAt: number | null;
};

let cache: { key: string; at: number; quotes: CmcQuote[] } | null = null;

const finite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** Parses the v2 quotes body (data keyed by CoinMarketCap id). Rows with no
 *  USD price are left out. */
export function parseCmcQuotes(body: unknown): CmcQuote[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!data || typeof data !== "object") return [];
  return Object.values(data as Record<string, unknown>).flatMap((entry) => {
    const row = (Array.isArray(entry) ? entry[0] : entry) as
      | { slug?: unknown; symbol?: unknown; quote?: { USD?: { price?: unknown; percent_change_24h?: unknown; last_updated?: unknown } } }
      | undefined;
    const usd = row?.quote?.USD;
    const price = finite(usd?.price);
    if (!row || typeof row.slug !== "string" || typeof row.symbol !== "string" || price === null) return [];
    const updated = typeof usd?.last_updated === "string" ? Date.parse(usd.last_updated) : NaN;
    return [{
      slug: row.slug,
      symbol: row.symbol,
      priceUsd: price,
      change24hPct: finite(usd?.percent_change_24h),
      updatedAt: Number.isFinite(updated) ? updated : null,
    }];
  });
}

/** Live USD quotes for these CoinMarketCap slugs. Null with no key, on an
 *  error, or on a timeout. Cached five minutes per slug set. */
export async function cmcQuotes(
  slugs: readonly string[],
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<CmcQuote[] | null> {
  const apiKey = process.env.CMC_PRO_API_KEY?.trim();
  if (!apiKey || !slugs.length) return null;
  const key = [...new Set(slugs)].sort().join(",");
  if (cache && cache.key === key && now - cache.at < CACHE_MS) return cache.quotes;
  try {
    const url = `${CMC_QUOTES_URL}?slug=${encodeURIComponent(key)}&convert=USD`;
    const response = await fetchImpl(url, {
      headers: { "X-CMC_PRO_API_KEY": apiKey, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const quotes = parseCmcQuotes(await response.json());
    if (!quotes.length) return null;
    cache = { key, at: now, quotes };
    return quotes;
  } catch {
    return null;
  }
}

/** Test seam: forget the cached quotes. */
export function resetCmcCacheForTests(): void {
  cache = null;
}
