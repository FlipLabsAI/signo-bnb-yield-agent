# Signo BNB Chain Yield Agent

A multi-condition yield agent for BNB Chain. It reads the lending rates on BNB Chain, checks the market on CoinMarketCap, reads your wallet, and tells you only when **all** of your conditions are true at the same time.

Example: "Tell me when USDT pays 3% or more on BNB Chain, the best lender pays at least 1% more than the next one, USDT is within 0.5% of $1, BNB moved less than 5% today, and I hold at least $100 of USDT."

This repository is a standalone, runnable version of the agent. In [Signo](https://app.signo.fi) it runs as the **BNB Chain Yield Agent**: the Signo Yield Agent with its scope set to BNB Chain only (early access). It uses the same BNB Chain lending markets and the same CoinMarketCap market check (prices plus a stablecoin peg check). The Signo app code is private. This repository holds the BNB Chain parts under the MIT licence.

## What it reads

| Source | What | Why |
| --- | --- | --- |
| [DefiLlama yields](https://yields.llama.fi/pools) | Lending rates and deposits for Venus (core pool), Aave V3, and Lista Lending on BNB Chain | The opportunities |
| [CoinMarketCap Pro API](https://coinmarketcap.com/api/) | Live USD prices and 24-hour moves for BNB, ETH, BTC, USDT, USDC, and FDUSD | The market check (see below) |
| BNB Chain RPC | Your BNB, USDT, USDC, ETH, BTCB, and WBNB balances | What you hold |

A market counts only when its token is the canonical BNB Chain contract (`src/tokens.ts`). A token with the same symbol and another contract is not the same asset.

## Why CoinMarketCap is in the core

A lending rate on a stablecoin is paid in that stablecoin. A 4% rate on a coin that trades at $0.98 is not a 4% dollar rate. So the agent checks every dollar stablecoin against its $1 peg on CoinMarketCap before it trusts a rate, and it uses CoinMarketCap prices to value your holdings and to see how much the market moved today.

Three of the five condition types need CoinMarketCap data. With no key, those conditions are **not true**: the agent never guesses, so it stays quiet.

## Conditions

Conditions are a JSON list. All of them must be true. See `examples/conditions.json`.

| Type | Fields | True when |
| --- | --- | --- |
| `rateAbove` | `token`, `minApyPct` | Some lender pays at least this rate on the token |
| `rateGapAbove` | `token`, `minGapPct` | The best lender pays at least this much more than the next best |
| `pegWithin` | `token`, `maxGapPct` | The stablecoin is within this distance of $1 on CoinMarketCap |
| `priceMoveWithin` | `symbol`, `maxAbsPct` | The coin moved less than this in 24 hours on CoinMarketCap |
| `holdingAbove` | `token`, `minUsd` | Your wallet holds at least this many dollars of the token (CoinMarketCap price) |

## Run it

Node.js 20 or later.

```sh
npm install
export CMC_PRO_API_KEY=your-key        # free Basic plan key from pro.coinmarketcap.com
npm run report -- --wallet 0xYourWallet
```

Options:

- `--wallet 0x...` reads that wallet on BNB Chain. Without it, `holdingAbove` is not true.
- `--conditions path.json` uses your own conditions (default `examples/conditions.json`).
- `--min-tvl 1000000` leaves out markets with less in deposits (default $1M).
- `--json` prints the full report as JSON.
- `BNB_RPC_URL` sets the RPC (default `https://bsc-dataseed.bnbchain.org`).

Example output (no wallet, no key):

```text
Lending rates on BNB Chain (DefiLlama; markets with $1.0M or more in deposits):
- USDT: Lista Lending 9.61% ($1.6M), Venus 3.64% ($36.5M), Aave V3 2.24% ($19.4M)
- USDC: Lista Lending 4.71% ($3.9M), Aave V3 3.31% ($1.7M), Venus 2.99% ($9.6M)
- ETH: Aave V3 0.58% ($7.0M), Venus 0.31% ($25.1M)
- BTCB: Venus 0.10% ($244.3M), Aave V3 0.01% ($66.4M)
- WBNB: Lista Lending 0.20% ($267.4M), Venus 0.02% ($274.0M), Aave V3 0.00% ($63.2M)

Market check: not read (set CMC_PRO_API_KEY).

Wallet: none given.

Conditions (all must be true):
[ ] No CoinMarketCap price for USDT, so the peg is not checked.
[x] Best USDT rate: 9.61% on Lista Lending (wanted 3.00% or more).
[x] Lista Lending pays 5.98% more on USDT than Venus (9.61% vs 3.64%; wanted 1.00% or more).
[ ] No 24-hour CoinMarketCap move for BNB.
[ ] No wallet was given, so the USDT balance is not checked.

2 of 5 conditions are true. The agent stays quiet.
Rates only. This agent reads and tells. It does not move funds.
```

## Safety

- **Read only.** No private keys, no signing, no transactions.
- **The API key stays on the server.** It is read from the environment and sent in the `X-CMC_PRO_API_KEY` header, never in a URL, a log, or a front end. `.env` files are in `.gitignore`.
- **Missing data is not true.** A condition with no data fails, so a broken feed cannot make the agent speak.
- **Timeouts and a cache.** CoinMarketCap calls time out after 6 seconds and are cached for 5 minutes.

## Not in this version

- Moving funds on BNB Chain. In Signo, deposits and withdrawals run on other chains today. On BNB Chain the agent compares rates and tells you.
- Atlas oracle feeds. Venus and Lista use Atlas prices for collateral and liquidations, so Atlas matters when an agent borrows or moves funds on BNB Chain.

## Tests

```sh
npm test
npm run typecheck
```

## Licence

MIT. See `LICENSE`.
