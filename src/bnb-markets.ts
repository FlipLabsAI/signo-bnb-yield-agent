// Lending markets on BNB Chain, from the public DefiLlama yields index.
// Three lenders: Venus (core pool), Aave V3, and Lista Lending. A market
// counts only when its underlying token is a canonical BNB Chain contract
// (src/tokens.ts) and it holds at least the minimum deposits.

import { tokenByAddress } from "./tokens.js";

export const DEFILLAMA_POOLS_URL = "https://yields.llama.fi/pools";

export const BNB_LENDERS: Readonly<Record<string, string>> = {
  "venus-core-pool": "Venus",
  "aave-v3": "Aave V3",
  "lista-lending": "Lista Lending",
};

export type BnbMarket = {
  /** DefiLlama's pool id. */
  pool: string;
  lender: string;
  token: string;
  /** Rate in percent a year: base + rewards. */
  apyPct: number;
  apyBasePct: number;
  apyRewardPct: number;
  /** 30-day mean rate, when DefiLlama has it. */
  apyMean30dPct: number | null;
  tvlUsd: number;
};

type LlamaPool = {
  pool?: unknown; chain?: unknown; project?: unknown; tvlUsd?: unknown;
  apy?: unknown; apyBase?: unknown; apyReward?: unknown; apyMean30d?: unknown;
  underlyingTokens?: unknown; exposure?: unknown;
};

const num = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** The BNB Chain lending markets in a DefiLlama /pools body. One row per
 *  lender and token: the one with the most deposits. Sorted by rate, high
 *  to low. */
export function parseBnbMarkets(body: unknown, minTvlUsd = 1_000_000): BnbMarket[] {
  const data = (body as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const best = new Map<string, BnbMarket>();
  for (const raw of data as LlamaPool[]) {
    if (raw.chain !== "BSC" || typeof raw.project !== "string") continue;
    const lender = BNB_LENDERS[raw.project];
    if (!lender || raw.exposure !== "single" || typeof raw.pool !== "string") continue;
    const underlying = Array.isArray(raw.underlyingTokens) && raw.underlyingTokens.length === 1 ? raw.underlyingTokens[0] : null;
    const token = typeof underlying === "string" ? tokenByAddress(underlying) : undefined;
    const tvlUsd = num(raw.tvlUsd);
    if (!token || tvlUsd === null || tvlUsd < minTvlUsd) continue;
    const apyBasePct = num(raw.apyBase) ?? 0;
    const apyRewardPct = num(raw.apyReward) ?? 0;
    const market: BnbMarket = {
      pool: raw.pool,
      lender,
      token: token.symbol,
      apyPct: num(raw.apy) ?? apyBasePct + apyRewardPct,
      apyBasePct,
      apyRewardPct,
      apyMean30dPct: num(raw.apyMean30d),
      tvlUsd,
    };
    const key = `${lender}:${token.symbol}`;
    const held = best.get(key);
    if (!held || market.tvlUsd > held.tvlUsd) best.set(key, market);
  }
  return [...best.values()].sort((a, b) => b.apyPct - a.apyPct);
}

/** Reads the index. Null on an error or a timeout. */
export async function fetchBnbMarkets(minTvlUsd = 1_000_000, fetchImpl: typeof fetch = fetch): Promise<BnbMarket[] | null> {
  try {
    const response = await fetchImpl(DEFILLAMA_POOLS_URL, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) return null;
    return parseBnbMarkets(await response.json(), minTvlUsd);
  } catch {
    return null;
  }
}

export const marketsFor = (markets: readonly BnbMarket[], token: string): BnbMarket[] =>
  markets.filter((market) => market.token.toUpperCase() === token.toUpperCase());
