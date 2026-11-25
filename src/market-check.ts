// The market check: live CoinMarketCap quotes for BNB Chain's gas token, the
// large coins its lenders take, and its dollar stablecoins, with a peg check
// on the stablecoins. A lending rate on a stablecoin is paid in that coin, so
// a coin off its $1 peg is a real risk to a "dollar" rate.

import type { CmcQuote } from "./coinmarketcap.js";

export type MarketQuote = { symbol: string; priceUsd: number; change24hPct: number | null; stable: boolean };
export type MarketCheck = { source: "CoinMarketCap"; at: number; quotes: MarketQuote[] };

type MarketCoin = { slug: string; symbol: string; stable?: true };

/** The coins the check reads. Slugs are CoinMarketCap's. BTCB and ETH on BNB
 *  Chain track BTC and ETH. */
export const MARKET_COINS: readonly MarketCoin[] = [
  { slug: "bnb", symbol: "BNB" },
  { slug: "ethereum", symbol: "ETH" },
  { slug: "bitcoin", symbol: "BTC" },
  { slug: "tether", symbol: "USDT", stable: true },
  { slug: "usd-coin", symbol: "USDC", stable: true },
  { slug: "first-digital-usd", symbol: "FDUSD", stable: true },
];

/** A dollar stablecoin further than this from $1 gets its own line (0.5%). */
export const PEG_BAND = 0.005;

export const marketCheckSlugs = (): string[] => MARKET_COINS.map((coin) => coin.slug);

/** The check from the quotes read, in the order of the coin list. Undefined
 *  when nothing was read (no key, an error). */
export function marketCheckFrom(
  quotes: ReadonlyArray<Pick<CmcQuote, "slug" | "priceUsd" | "change24hPct">> | null | undefined,
  at: number,
): MarketCheck | undefined {
  if (!quotes?.length) return undefined;
  const bySlug = new Map(quotes.map((quote) => [quote.slug, quote]));
  const rows = MARKET_COINS.flatMap((coin) => {
    const quote = bySlug.get(coin.slug);
    return quote
      ? [{ symbol: coin.symbol, priceUsd: quote.priceUsd, change24hPct: quote.change24hPct, stable: coin.stable === true }]
      : [];
  });
  return rows.length ? { source: "CoinMarketCap", at, quotes: rows } : undefined;
}

/** A stablecoin's distance from $1, as a share (0.007 is 0.7% off). */
export const pegGap = (quote: Pick<MarketQuote, "priceUsd">): number => Math.abs(quote.priceUsd - 1);

export const usd = (value: number): string =>
  value < 10
    ? `$${value.toFixed(4)}`
    : `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const change = (pct: number | null): string =>
  pct === null ? "" : ` (${pct >= 0 ? "+" : "-"}${Math.abs(pct).toFixed(1)}% in 24 hours)`;

/** The check as lines: the prices, the stablecoins on their peg, and one line
 *  for each stablecoin off its peg by more than PEG_BAND. */
export function marketCheckLines(check: MarketCheck | undefined): string[] {
  if (!check?.quotes.length) return [];
  const prices = check.quotes.map(
    (quote) => `${quote.symbol} ${usd(quote.priceUsd)}${quote.stable ? "" : change(quote.change24hPct)}`,
  );
  const offPeg = check.quotes
    .filter((quote) => quote.stable && pegGap(quote) > PEG_BAND)
    .map((quote) =>
      `${quote.symbol} is at ${usd(quote.priceUsd)} on ${check.source}, ${(pegGap(quote) * 100).toFixed(2)}% ${quote.priceUsd < 1 ? "below" : "above"} its $1 peg. A lending rate on ${quote.symbol} is paid in ${quote.symbol}.`);
  const pegged = check.quotes.filter((quote) => quote.stable && pegGap(quote) <= PEG_BAND).map((quote) => quote.symbol);
  return [
    `Market check (${check.source}, read ${new Date(check.at).toISOString()}): ${prices.join(", ")}.`,
    ...(pegged.length
      ? [`${pegged.join(", ")} ${pegged.length === 1 ? "is" : "are"} within ${(PEG_BAND * 100).toFixed(1)}% of $1.`]
      : []),
    ...offPeg,
  ];
}
