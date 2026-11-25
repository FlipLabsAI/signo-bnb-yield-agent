// Atlas Oracle price feeds on BNB Chain, read onchain with eth_call. Free to
// read: no key, no account, no transaction. The feeds are Atlas SingleFeed
// contracts, which answer Chainlink's latestRoundData(). The addresses are
// from the public feed pages, atlasoracle.io/feeds/{feedId}. CoinMarketCap
// ids on those pages: BNB 1839, BTC 1, ETH 1027.
//
// Stablecoins are not read here. Atlas's USDT/USD and USDC/USD feeds on BNB
// Chain update on a 5% move or once a day, so they cannot show a 0.5% move
// off the $1 peg. The peg check stays on CoinMarketCap.

import { DEFAULT_BNB_RPC_URL, fromUnits, rpc } from "./wallet.js";

export type AtlasFeed = { symbol: string; feedId: number; address: string; heartbeatS: number };

export const ATLAS_FEEDS: readonly AtlasFeed[] = [
  { symbol: "BNB", feedId: 633, address: "0x9c0517f5b4c8657c7f18d68d2d79e2b3b1cd6438", heartbeatS: 60 },
  { symbol: "BTC", feedId: 626, address: "0x4f6c53fb9cdd46269d24bca4e68bb680879132fc", heartbeatS: 60 },
  { symbol: "ETH", feedId: 632, address: "0x7942b8dd9f552c57eb94d16ea8215aef6cac948f", heartbeatS: 60 },
];

export type AtlasPrice = { symbol: string; feedId: number; priceUsd: number; updatedAt: number };

const LATEST_ROUND_DATA = "0xfeaf968c";
const DECIMALS = "0x313ce567";
/** A feed older than this many heartbeats is stale and left out. */
const STALE_HEARTBEATS = 5;

/** latestRoundData() returns five 32-byte words: roundId, answer, startedAt,
 *  updatedAt, answeredInRound. Null for a short or negative answer. */
export function parseLatestRoundData(hex: string, decimals: number): { priceUsd: number; updatedAtS: number } | null {
  if (!/^0x[0-9a-fA-F]{320}$/.test(hex)) return null;
  const word = (index: number) => `0x${hex.slice(2 + index * 64, 2 + (index + 1) * 64)}`;
  const answer = word(1);
  if (/^0x[89a-fA-F]/.test(answer)) return null;
  const priceUsd = fromUnits(answer, decimals);
  const updatedAtS = Number(BigInt(word(3)));
  return priceUsd > 0 && updatedAtS > 0 ? { priceUsd, updatedAtS } : null;
}

/** The latest Atlas price for each feed. A feed that fails or is stale is left
 *  out. Null when no feed could be read. */
export async function atlasPrices(
  rpcUrl = process.env.BNB_RPC_URL?.trim() || DEFAULT_BNB_RPC_URL,
  fetchImpl: typeof fetch = fetch,
  now = Date.now(),
): Promise<AtlasPrice[] | null> {
  const rows = await Promise.all(ATLAS_FEEDS.map(async (feed): Promise<AtlasPrice | null> => {
    try {
      const call = (data: string) => rpc(rpcUrl, "eth_call", [{ to: feed.address, data }, "latest"], fetchImpl);
      const [decimalsHex, roundHex] = await Promise.all([call(DECIMALS), call(LATEST_ROUND_DATA)]);
      const round = parseLatestRoundData(roundHex, Number(BigInt(decimalsHex)));
      if (!round || now / 1000 - round.updatedAtS > feed.heartbeatS * STALE_HEARTBEATS) return null;
      return { symbol: feed.symbol, feedId: feed.feedId, priceUsd: round.priceUsd, updatedAt: round.updatedAtS * 1000 };
    } catch {
      return null;
    }
  }));
  const prices = rows.filter((row): row is AtlasPrice => row !== null);
  return prices.length ? prices : null;
}
