// Command line: npm run report -- [--wallet 0x...] [--conditions file.json]
//                                 [--min-tvl 1000000] [--json]

import { readFileSync } from "node:fs";
import { atlasPrices } from "./atlas.js";
import { fetchBnbMarkets } from "./bnb-markets.js";
import { cmcQuotes } from "./coinmarketcap.js";
import { parseConditions } from "./conditions.js";
import { marketCheckFrom, marketCheckSlugs } from "./market-check.js";
import { buildReport } from "./report.js";
import { readHoldings } from "./wallet.js";

type Args = { wallet?: string; conditions: string; minTvlUsd: number; json: boolean };

export function parseArgs(argv: readonly string[]): Args {
  const args: Args = { conditions: "examples/conditions.json", minTvlUsd: 1_000_000, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === "--json") args.json = true;
    else if (flag === "--wallet" && value) { args.wallet = value; index += 1; }
    else if (flag === "--conditions" && value) { args.conditions = value; index += 1; }
    else if (flag === "--min-tvl" && value && Number.isFinite(Number(value))) { args.minTvlUsd = Number(value); index += 1; }
    else throw new Error(`Unknown or incomplete option: ${flag}`);
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const conditions = parseConditions(JSON.parse(readFileSync(args.conditions, "utf8")));
  const at = Date.now();
  const [markets, quotes, atlas, holdings] = await Promise.all([
    fetchBnbMarkets(args.minTvlUsd),
    cmcQuotes(marketCheckSlugs()),
    atlasPrices(),
    args.wallet ? readHoldings(args.wallet) : Promise.resolve(undefined),
  ]);
  if (args.wallet && holdings === null) console.error("Could not read the wallet from the BNB Chain RPC.");
  if (!markets) console.error("Could not read the DefiLlama yields index.");
  const report = buildReport({
    at,
    minTvlUsd: args.minTvlUsd,
    markets: markets ?? [],
    check: marketCheckFrom(quotes, at, atlas),
    holdings: holdings ?? undefined,
    conditions,
  });
  console.log(args.json ? JSON.stringify(report, null, 2) : report.lines.join("\n"));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
