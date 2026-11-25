// Canonical token contracts on BNB Chain. A market or a balance counts only
// when its contract is one of these. A token with the same symbol and another
// contract is not the same asset.

export type BnbToken = { symbol: string; address: string; decimals: number; stable?: true };

export const BNB_TOKENS: readonly BnbToken[] = [
  { symbol: "USDT", address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18, stable: true },
  { symbol: "USDC", address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18, stable: true },
  { symbol: "ETH", address: "0x2170Ed0880ac9A755fd29B2688956BD959F933F8", decimals: 18 },
  { symbol: "BTCB", address: "0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c", decimals: 18 },
  { symbol: "WBNB", address: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c", decimals: 18 },
];

export const tokenByAddress = (address: string | null | undefined): BnbToken | undefined =>
  address ? BNB_TOKENS.find((token) => token.address.toLowerCase() === address.toLowerCase()) : undefined;

export const tokenBySymbol = (symbol: string): BnbToken | undefined =>
  BNB_TOKENS.find((token) => token.symbol.toUpperCase() === symbol.toUpperCase());

/** The CoinMarketCap symbol whose price a token follows (BTCB follows BTC). */
export const priceSymbol = (symbol: string): string =>
  ({ BTCB: "BTC", WBNB: "BNB" } as Record<string, string>)[symbol] ?? symbol;
