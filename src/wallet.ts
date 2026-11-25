// Wallet balances on BNB Chain over plain JSON-RPC: BNB with eth_getBalance,
// tokens with balanceOf. Read only. No key, no signing.

import { BNB_TOKENS } from "./tokens.js";

export const DEFAULT_BNB_RPC_URL = "https://bsc-dataseed.bnbchain.org";

export type Holding = { symbol: string; amount: number };

const BALANCE_OF = "0x70a08231";

export const isAddress = (value: string): boolean => /^0x[0-9a-fA-F]{40}$/.test(value);

/** balanceOf(owner) call data. */
export const balanceOfData = (owner: string): string => `${BALANCE_OF}${owner.slice(2).toLowerCase().padStart(64, "0")}`;

/** A hex quantity with these decimals as a number. */
export function fromUnits(hex: string, decimals: number): number {
  if (!/^0x[0-9a-fA-F]*$/.test(hex)) return 0;
  const raw = BigInt(hex === "0x" ? "0x0" : hex);
  const scale = 10n ** BigInt(decimals);
  return Number(raw / scale) + Number(raw % scale) / Number(scale);
}

async function rpc(url: string, method: string, params: unknown[], fetchImpl: typeof fetch): Promise<string> {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10_000),
  });
  const body = (await response.json()) as { result?: unknown; error?: { message?: string } };
  if (typeof body.result !== "string") throw new Error(body.error?.message ?? `${method} failed`);
  return body.result;
}

/** BNB and the canonical tokens this wallet holds (zero balances left out).
 *  Null when the RPC cannot be read. */
export async function readHoldings(
  owner: string,
  rpcUrl = process.env.BNB_RPC_URL?.trim() || DEFAULT_BNB_RPC_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<Holding[] | null> {
  if (!isAddress(owner)) throw new Error(`Not a wallet address: ${owner}`);
  try {
    const [bnb, ...tokens] = await Promise.all([
      rpc(rpcUrl, "eth_getBalance", [owner, "latest"], fetchImpl),
      ...BNB_TOKENS.map((token) => rpc(rpcUrl, "eth_call", [{ to: token.address, data: balanceOfData(owner) }, "latest"], fetchImpl)),
    ]);
    const holdings: Holding[] = [
      { symbol: "BNB", amount: fromUnits(bnb ?? "0x0", 18) },
      ...BNB_TOKENS.map((token, index) => ({ symbol: token.symbol, amount: fromUnits(tokens[index] ?? "0x0", token.decimals) })),
    ];
    return holdings.filter((holding) => holding.amount > 0);
  } catch {
    return null;
  }
}
