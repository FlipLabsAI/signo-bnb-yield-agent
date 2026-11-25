// The market check: live prices for BNB Chain's gas token, the large coins its
// lenders take, and its dollar stablecoins, with a peg check on the
// stablecoins. A lending rate on a stablecoin is paid in that coin, so a coin
// off its $1 peg is a real risk to a "dollar" rate.
//
// Two sources:
// - Atlas price feeds on BNB Chain (onchain, free to read) give the BNB, ETH,
//   and BTC prices. CoinMarketCap gives the same prices as a cross-check: when
//   the two differ by more than PRICE_AGREEMENT, the price is not used.
// - CoinMarketCap gives the stablecoin prices (the peg check) and every
//   24-hour move. Atlas's stablecoin feeds on BNB Chain move only on a 5%
//   change, which is too coarse for a 0.5% peg check.

import type { AtlasPrice } from "./atlas.js";
import type { CmcQuote } from "./coinmarketcap.js";

export type PriceSource = "Atlas" | "CoinMarketCap";

export type MarketQuote = {
  symbol: string;
  priceUsd: number;
  source: PriceSource;
  /** The 24-hour move in percent, from CoinMarketCap. */
  change24hPct: number | null;
  stable: boolean;
  /** CoinMarketCap's price when Atlas gave the price: the cross-check. */
  cmcPriceUsd: number | null;
};
export type MarketCheck = { at: number; quotes: MarketQuote[] };

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
/** Atlas and CoinMarketCap may differ by this much on a price (1%). */
export const PRICE_AGREEMENT = 0.01;

export const marketCheckSlugs = (): string[] => MARKET_COINS.map((coin) => coin.slug);

/** The check from the prices read, in the order of the coin list. Undefined
 *  when nothing was read. */
export function marketCheckFrom(
  quotes: ReadonlyArray<Pick<CmcQuote, "slug" | "priceUsd" | "change24hPct">> | null | undefined,
  at: number,
  atlas?: ReadonlyArray<Pick<AtlasPrice, "symbol" | "priceUsd">> | null,
): MarketCheck | undefined {
  const bySlug = new Map((quotes ?? []).map((quote) => [quote.slug, quote]));
  const rows = MARKET_COINS.flatMap((coin): MarketQuote[] => {
    const cmc = bySlug.get(coin.slug);
    const onchain = coin.stable ? undefined : atlas?.find((price) => price.symbol === coin.symbol);
    const stable = coin.stable === true;
    if (onchain) {
      return [{ symbol: coin.symbol, priceUsd: onchain.priceUsd, source: "Atlas", change24hPct: cmc?.change24hPct ?? null, stable, cmcPriceUsd: cmc?.priceUsd ?? null }];
    }
    return cmc
      ? [{ symbol: coin.symbol, priceUsd: cmc.priceUsd, source: "CoinMarketCap", change24hPct: cmc.change24hPct, stable, cmcPriceUsd: null }]
      : [];
  });
  return rows.length ? { at, quotes: rows } : undefined;
}

/** A stablecoin's distance from $1, as a share (0.007 is 0.7% off). */
export const pegGap = (quote: Pick<MarketQuote, "priceUsd">): number => Math.abs(quote.priceUsd - 1);

/** How far Atlas and CoinMarketCap are apart on this price, as a share. Zero
 *  with only one source. */
export const priceGap = (quote: Pick<MarketQuote, "priceUsd" | "cmcPriceUsd">): number =>
  quote.cmcPriceUsd ? Math.abs(quote.priceUsd - quote.cmcPriceUsd) / quote.cmcPriceUsd : 0;

/** False when the two sources disagree: the price is then not used. */
export const priceAgreed = (quote: Pick<MarketQuote, "priceUsd" | "cmcPriceUsd">): boolean =>
  priceGap(quote) <= PRICE_AGREEMENT;

export const usd = (value: number): string =>
  value < 10
    ? `$${value.toFixed(4)}`
    : `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** "A", "A and B", "A, B, and C". */
export const listOf = (items: readonly string[]): string =>
  items.length < 3 ? items.join(" and ") : `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;

const change = (pct: number | null): string =>
  pct === null ? "" : ` (${pct >= 0 ? "+" : "-"}${Math.abs(pct).toFixed(1)}% in 24 hours)`;

const pctOf = (share: number) => `${(share * 100).toFixed(2)}%`;

/** The check as lines: the prices, where each came from, the cross-check, the
 *  stablecoins on their peg, and one line for each stablecoin off its peg by
 *  more than PEG_BAND. */
export function marketCheckLines(check: MarketCheck | undefined): string[] {
  if (!check?.quotes.length) return [];
  const symbols = (keep: (quote: MarketQuote) => boolean) => check.quotes.filter(keep).map((quote) => quote.symbol);
  const prices = check.quotes.map(
    (quote) => `${quote.symbol} ${usd(quote.priceUsd)}${quote.stable ? "" : change(quote.change24hPct)}`,
  );
  const fromAtlas = symbols((quote) => quote.source === "Atlas");
  const fromCmc = symbols((quote) => quote.source === "CoinMarketCap");
  const cmcRead = check.quotes.some((quote) => quote.source === "CoinMarketCap" || quote.cmcPriceUsd !== null);
  const sources = [
    ...(fromAtlas.length ? [`${listOf(fromAtlas)} from Atlas price feeds on BNB Chain`] : []),
    ...(fromCmc.length ? [`${listOf(fromCmc)} from CoinMarketCap`] : []),
  ];
  const agreed = symbols((quote) => quote.cmcPriceUsd !== null && priceAgreed(quote));
  const disputed = check.quotes
    .filter((quote) => !priceAgreed(quote))
    .map((quote) =>
      `${quote.symbol}: Atlas ${usd(quote.priceUsd)}, CoinMarketCap ${usd(quote.cmcPriceUsd ?? 0)}, ${pctOf(priceGap(quote))} apart. The agent does not use this price.`);
  const offPeg = check.quotes
    .filter((quote) => quote.stable && pegGap(quote) > PEG_BAND)
    .map((quote) =>
      `${quote.symbol} is at ${usd(quote.priceUsd)} on ${quote.source}, ${pctOf(pegGap(quote))} ${quote.priceUsd < 1 ? "below" : "above"} its $1 peg. A lending rate on ${quote.symbol} is paid in ${quote.symbol}.`);
  const pegged = symbols((quote) => quote.stable && pegGap(quote) <= PEG_BAND);
  return [
    `Market check (read ${new Date(check.at).toISOString()}): ${prices.join(", ")}.`,
    `Prices: ${sources.join("; ")}.${cmcRead && fromAtlas.length ? " 24-hour moves from CoinMarketCap." : ""}`,
    ...(cmcRead ? [] : ["CoinMarketCap: not read (set CMC_PRO_API_KEY), so there is no peg check and no 24-hour move."]),
    ...(agreed.length ? [`Atlas and CoinMarketCap agree within ${pctOf(PRICE_AGREEMENT).replace(".00", "")} on ${listOf(agreed)}.`] : []),
    ...disputed,
    ...(pegged.length
      ? [`${listOf(pegged)} ${pegged.length === 1 ? "is" : "are"} within ${(PEG_BAND * 100).toFixed(1)}% of $1.`]
      : []),
    ...offPeg,
  ];
}
