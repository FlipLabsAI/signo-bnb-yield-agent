// Multi-condition rules. The agent tells you only when ALL the conditions are
// true at the same time. A condition with no data (no price, no wallet), or
// with a price the two sources disagree on, is not true: the agent never
// guesses.

import { marketsFor, type BnbMarket } from "./bnb-markets.js";
import { pegGap, priceAgreed, PRICE_AGREEMENT, type MarketCheck, type MarketQuote } from "./market-check.js";
import { priceSymbol } from "./tokens.js";
import type { Holding } from "./wallet.js";

export type Condition =
  /** Some lender pays at least this rate on the token. */
  | { type: "rateAbove"; token: string; minApyPct: number }
  /** The best lender pays at least this much more than the next best. */
  | { type: "rateGapAbove"; token: string; minGapPct: number }
  /** The stablecoin is within this distance of $1. */
  | { type: "pegWithin"; token: string; maxGapPct: number }
  /** The coin moved less than this in 24 hours on CoinMarketCap. */
  | { type: "priceMoveWithin"; symbol: string; maxAbsPct: number }
  /** The wallet holds at least this many dollars of the token. */
  | { type: "holdingAbove"; token: string; minUsd: number };

export type Inputs = {
  markets: readonly BnbMarket[];
  check: MarketCheck | undefined;
  /** Undefined when no wallet was given. */
  holdings: readonly Holding[] | undefined;
};

export type Result = { condition: Condition; met: boolean; line: string };

const pct = (value: number) => `${value.toFixed(2)}%`;
const dollars = (value: number) => `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const quote = (check: MarketCheck | undefined, symbol: string) =>
  check?.quotes.find((row) => row.symbol.toUpperCase() === priceSymbol(symbol.toUpperCase()));

/** Why a price cannot be used, or null when it can. */
const unusable = (row: MarketQuote | undefined, token: string): string | null =>
  !row
    ? `No market price for ${token}`
    : !priceAgreed(row)
      ? `Atlas and CoinMarketCap differ by more than ${pct(PRICE_AGREEMENT * 100)} on ${row.symbol}`
      : null;

export function evaluate(condition: Condition, inputs: Inputs): Result {
  const done = (met: boolean, line: string): Result => ({ condition, met, line });
  switch (condition.type) {
    case "rateAbove": {
      const [best] = marketsFor(inputs.markets, condition.token);
      if (!best) return done(false, `No ${condition.token} lending market on BNB Chain was read.`);
      return done(best.apyPct >= condition.minApyPct,
        `Best ${condition.token} rate: ${pct(best.apyPct)} on ${best.lender} (wanted ${pct(condition.minApyPct)} or more).`);
    }
    case "rateGapAbove": {
      const [best, next] = marketsFor(inputs.markets, condition.token);
      if (!best || !next) return done(false, `Fewer than two ${condition.token} lenders were read, so there is no gap to compare.`);
      const gap = best.apyPct - next.apyPct;
      return done(gap >= condition.minGapPct,
        `${best.lender} pays ${pct(gap)} more on ${condition.token} than ${next.lender} (${pct(best.apyPct)} vs ${pct(next.apyPct)}; wanted ${pct(condition.minGapPct)} or more).`);
    }
    case "pegWithin": {
      const row = quote(inputs.check, condition.token);
      const why = unusable(row, condition.token);
      if (why || !row) return done(false, `${why}, so the peg is not checked.`);
      const gap = pegGap(row) * 100;
      return done(gap <= condition.maxGapPct,
        `${condition.token} is $${row.priceUsd.toFixed(4)} on ${row.source}, ${pct(gap)} from $1 (allowed ${pct(condition.maxGapPct)}).`);
    }
    case "priceMoveWithin": {
      const row = quote(inputs.check, condition.symbol);
      if (!row || row.change24hPct === null) return done(false, `No 24-hour CoinMarketCap move for ${condition.symbol}.`);
      return done(Math.abs(row.change24hPct) <= condition.maxAbsPct,
        `${condition.symbol} moved ${row.change24hPct >= 0 ? "+" : "-"}${pct(Math.abs(row.change24hPct))} in 24 hours (allowed ${pct(condition.maxAbsPct)}).`);
    }
    case "holdingAbove": {
      if (!inputs.holdings) return done(false, `No wallet was given, so the ${condition.token} balance is not checked.`);
      const row = quote(inputs.check, condition.token);
      const why = unusable(row, condition.token);
      if (why || !row) return done(false, `${why}, so its dollar value is not known.`);
      const amount = inputs.holdings.find((holding) => holding.symbol.toUpperCase() === condition.token.toUpperCase())?.amount ?? 0;
      const value = amount * row.priceUsd;
      return done(value >= condition.minUsd,
        `The wallet holds ${dollars(value)} of ${condition.token} (wanted ${dollars(condition.minUsd)} or more).`);
    }
  }
}

export function evaluateAll(conditions: readonly Condition[], inputs: Inputs): { results: Result[]; allMet: boolean } {
  const results = conditions.map((condition) => evaluate(condition, inputs));
  return { results, allMet: results.length > 0 && results.every((result) => result.met) };
}

/** The fields each condition type needs: a text field, then a number field. */
const FIELDS: Readonly<Record<Condition["type"], readonly [string, string]>> = {
  rateAbove: ["token", "minApyPct"],
  rateGapAbove: ["token", "minGapPct"],
  pegWithin: ["token", "maxGapPct"],
  priceMoveWithin: ["symbol", "maxAbsPct"],
  holdingAbove: ["token", "minUsd"],
};

/** Reads a conditions list (JSON). Throws on a row it does not know or a
 *  missing or bad field. */
export function parseConditions(body: unknown): Condition[] {
  if (!Array.isArray(body) || !body.length) throw new Error("Conditions must be a non-empty JSON list.");
  return body.map((row, index) => {
    const record = (row ?? {}) as Record<string, unknown>;
    const type = record.type;
    const fields = typeof type === "string" ? FIELDS[type as Condition["type"]] : undefined;
    if (!fields) throw new Error(`Condition ${index + 1}: unknown type ${String(type)}.`);
    const [text, value] = fields;
    if (typeof record[text] !== "string" || !(record[text] as string).length) throw new Error(`Condition ${index + 1}: ${text} must be text.`);
    if (typeof record[value] !== "number" || !Number.isFinite(record[value])) throw new Error(`Condition ${index + 1}: ${value} must be a number.`);
    return { type, [text]: record[text], [value]: record[value] } as Condition;
  });
}
