// The report: lending rates on BNB Chain, the market check (Atlas and
// CoinMarketCap), the
// wallet, and each condition with its answer. Pure: no reads here.

import { marketsFor, type BnbMarket } from "./bnb-markets.js";
import { evaluateAll, type Condition, type Result } from "./conditions.js";
import { marketCheckLines, type MarketCheck } from "./market-check.js";
import { BNB_TOKENS } from "./tokens.js";
import type { Holding } from "./wallet.js";

export type ReportInputs = {
  at: number;
  minTvlUsd: number;
  markets: readonly BnbMarket[];
  check: MarketCheck | undefined;
  holdings: readonly Holding[] | undefined;
  conditions: readonly Condition[];
};

export type Report = {
  at: string;
  allMet: boolean;
  results: Result[];
  markets: readonly BnbMarket[];
  check: MarketCheck | undefined;
  holdings: readonly Holding[] | undefined;
  lines: string[];
};

const millions = (value: number) => `$${(value / 1_000_000).toFixed(1)}M`;
const amount = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: value < 1 ? 6 : 2 });

export function buildReport(inputs: ReportInputs): Report {
  const { results, allMet } = evaluateAll(inputs.conditions, inputs);
  const rateLines = BNB_TOKENS.flatMap((token) => {
    const rows = marketsFor(inputs.markets, token.symbol);
    return rows.length
      ? [`- ${token.symbol}: ${rows.map((row) => `${row.lender} ${row.apyPct.toFixed(2)}% (${millions(row.tvlUsd)})`).join(", ")}`]
      : [];
  });
  const met = results.filter((result) => result.met).length;
  const lines = [
    `BNB Chain Yield Agent, ${new Date(inputs.at).toISOString()}`,
    "",
    `Lending rates on BNB Chain (DefiLlama; markets with ${millions(inputs.minTvlUsd)} or more in deposits):`,
    ...(rateLines.length ? rateLines : ["- No markets were read."]),
    "",
    ...(inputs.check ? marketCheckLines(inputs.check) : ["Market check: not read. The Atlas price feeds did not answer, and CoinMarketCap needs CMC_PRO_API_KEY."]),
    "",
    inputs.holdings === undefined
      ? "Wallet: none given."
      : inputs.holdings.length
        ? `Wallet on BNB Chain: ${inputs.holdings.map((holding) => `${amount(holding.amount)} ${holding.symbol}`).join(", ")}.`
        : "Wallet on BNB Chain: no BNB or tracked tokens.",
    "",
    "Conditions (all must be true):",
    ...results.map((result) => `[${result.met ? "x" : " "}] ${result.line}`),
    "",
    allMet
      ? `All ${results.length} conditions are true. The agent would tell you now.`
      : `${met} of ${results.length} conditions are true. The agent stays quiet.`,
    "Rates only. This agent reads and tells. It does not move funds.",
  ];
  return {
    at: new Date(inputs.at).toISOString(),
    allMet,
    results,
    markets: inputs.markets,
    check: inputs.check,
    holdings: inputs.holdings,
    lines,
  };
}
