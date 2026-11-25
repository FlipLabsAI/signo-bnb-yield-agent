# Signo BNB Chain Yield Agent

A multi-condition yield agent for BNB Chain. It reads the lending rates on BNB Chain, checks the market with Atlas price feeds and CoinMarketCap, reads your wallet, and tells you only when **all** of your conditions are true at the same time.

Example: "Tell me when USDT pays 3% or more on BNB Chain, the best lender pays at least 1% more than the next one, USDT is within 0.5% of $1, BNB moved less than 5% today, and I hold at least $100 of USDT."

This repository is a standalone, runnable version of the agent. In [Signo](https://app.signo.fi) it runs as the **BNB Chain Yield Agent**: the Signo Yield Agent with its scope set to **BNB Mode** (early access). It uses the same BNB Chain lending markets and the same stablecoin peg check. In Signo, the BNB Mode market check reads signed prices from the Atlas price API, with CoinMarketCap for 24-hour moves and as a cross-check. This repository reads the Atlas price feeds on BNB Chain directly. In Signo, an agent can also act on BNB Chain through the Signo Shield, with Atlas built in (see [Acting on BNB Chain](#acting-on-bnb-chain-signo-shield-and-atlas)). The Signo app code is private. This repository holds the BNB Chain parts under the MIT licence.

## What it reads

| Source | What | Why |
| --- | --- | --- |
| [DefiLlama yields](https://yields.llama.fi/pools) | Lending rates and deposits for Venus (core pool), Aave V3, and Lista Lending on BNB Chain | The opportunities |
| [Atlas price feeds](https://atlasoracle.io) on BNB Chain | Live USD prices for BNB, ETH, and BTC, read onchain (free, no key) | The prices of the large coins |
| [CoinMarketCap Pro API](https://coinmarketcap.com/api/) | USD prices for USDT, USDC, and FDUSD; 24-hour moves for all six coins; BNB, ETH, and BTC prices as a cross-check | The peg check and the market move (see below) |
| BNB Chain RPC | Your BNB, USDT, USDC, ETH, BTCB, and WBNB balances | What you hold |

A market counts only when its token is the canonical BNB Chain contract (`src/tokens.ts`). A token with the same symbol and another contract is not the same asset.

## Prices: Atlas and CoinMarketCap

A lending rate on a stablecoin is paid in that stablecoin. A 4% rate on a coin that trades at $0.98 is not a 4% dollar rate. So the agent checks every dollar stablecoin against its $1 peg before it trusts a rate. It also values your holdings and checks how much the market moved today.

- **BNB, ETH, and BTC prices come from Atlas.** The agent reads the Atlas SingleFeed contracts on BNB Chain with `eth_call` (`latestRoundData()`, the Chainlink interface). Reads are free: no key, no account, no transaction. These feeds update about every minute. A feed older than five minutes is left out. The addresses are in `src/atlas.ts`.
- **Stablecoin prices come from CoinMarketCap.** The Atlas USDT and USDC feeds on BNB Chain update on a 5% move or once a day. That cannot show a 0.5% move off the $1 peg, so the peg check stays on CoinMarketCap.
- **24-hour moves come from CoinMarketCap.** The agent reads only the latest Atlas price.
- **Cross-check.** When both sources answer, the agent compares the Atlas price with the CoinMarketCap price. If they differ by more than 1%, the report says so and the agent does not use that price.

With no CoinMarketCap key, the peg and 24-hour conditions are **not true**: the agent never guesses, so it stays quiet. Holdings in BNB, ETH, or BTCB still get a dollar value from Atlas.

## Conditions

Conditions are a JSON list. All of them must be true. See `examples/conditions.json`.

| Type | Fields | True when |
| --- | --- | --- |
| `rateAbove` | `token`, `minApyPct` | Some lender pays at least this rate on the token |
| `rateGapAbove` | `token`, `minGapPct` | The best lender pays at least this much more than the next best |
| `pegWithin` | `token`, `maxGapPct` | The stablecoin is within this distance of $1 (CoinMarketCap price) |
| `priceMoveWithin` | `symbol`, `maxAbsPct` | The coin moved less than this in 24 hours on CoinMarketCap |
| `holdingAbove` | `token`, `minUsd` | Your wallet holds at least this many dollars of the token (Atlas price for BNB, ETH, and BTCB; CoinMarketCap for stablecoins) |

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
- `BNB_RPC_URL` sets the RPC for the wallet and the Atlas feeds (default `https://bsc-dataseed.bnbchain.org`).

Example output (no wallet, no CoinMarketCap key):

```text
Lending rates on BNB Chain (DefiLlama; markets with $1.0M or more in deposits):
- USDT: Lista Lending 10.58% ($1.6M), Venus 3.56% ($38.1M), Aave V3 2.24% ($19.5M)
- USDC: Lista Lending 5.01% ($3.9M), Aave V3 3.31% ($1.7M), Venus 2.98% ($9.6M)
- ETH: Aave V3 0.58% ($6.9M), Venus 0.31% ($24.8M)
- BTCB: Venus 0.10% ($242.6M), Aave V3 0.01% ($66.0M)
- WBNB: Lista Lending 0.20% ($267.4M), Venus 0.02% ($272.1M), Aave V3 0.00% ($62.8M)

Market check (read 2026-11-25T09:48:53.424Z): BNB $538.24, ETH $1,634.68, BTC $58,780.40.
Prices: BNB, ETH, and BTC from Atlas price feeds on BNB Chain.
CoinMarketCap: not read (set CMC_PRO_API_KEY), so there is no peg check and no 24-hour move.

Wallet: none given.

Conditions (all must be true):
[ ] No market price for USDT, so the peg is not checked.
[x] Best USDT rate: 10.58% on Lista Lending (wanted 3.00% or more).
[x] Lista Lending pays 7.02% more on USDT than Venus (10.58% vs 3.56%; wanted 1.00% or more).
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
- **Two price sources.** Atlas and CoinMarketCap must agree within 1% on BNB, ETH, and BTC, or the agent does not use the price. A stale Atlas feed (older than five minutes) is left out.

## Acting on BNB Chain: Signo Shield and Atlas

This CLI reads and tells. In Signo, an Execute agent can also act on BNB Chain, but only inside a permission that the owner signs on chain. The [Signo Shield](https://github.com/FlipLabsAI/signo-shield) contracts check that permission, and its condition, on chain at the moment the agent acts. The Shield code is open source (MIT).

- **Live on BNB Chain mainnet since 25 November 2026.** Execute on BNB Chain is open to the Signo team for now. An agent can supply to Aave V3 or repay Aave from the wallet. Conditions can read the BNB Chain Aave health factor and the prices of BNB, BTC, ETH, USDT, USDC, FDUSD, and CAKE.
- **First mainnet firing:** when BNB was above $100, the Signo agent supplied 1 USDT to Aave on BNB Chain ([transaction](https://bscscan.com/tx/0xc0cdf431a6257f31db3c37d7887afd34d7b579eb3dbbc70ed752aa2ac3dcda66)).

### Atlas status

Atlas is built into the Shield on BNB Chain. The Shield registry lists Atlas BNB/USD, BTC/USD, and ETH/USD as on-chain reads ([BNB/USD listing](https://bscscan.com/tx/0x0c8a50a0aa5fffd883058789695f497c1ba4b3d70a8699a0e13668e6bf1bde5f)).

- **Mainnet: waiting for Atlas permission to activate it.** Atlas's mainnet feeds answer a contract only when the contract is on Atlas's allowlist, and Atlas allowlists on testnet only for now. We have asked Atlas to add the Shield's evaluator, [`0xc428a88A92Ecec99414152Ad2A5fd4244b222B15`](https://bscscan.com/address/0xc428a88A92Ecec99414152Ad2A5fd4244b222B15). Until then, price conditions on mainnet read Chainlink. When Atlas adds the evaluator, Signo turns Atlas on with one switch. The contracts do not change.
- **Testnet: live.** On BNB testnet, the Shield read the Atlas BNB/USD feed during a real firing:
  - "When BNB is above $100, send 0.001 WBNB" fired ([transaction](https://testnet.bscscan.com/tx/0xe8f0fb862976f99df5dfdda18dec1f0d7d25ae288724a1e0f9dd9fe88f97a6d9)).
  - "When BNB is above $1,000,000" was refused on chain, and no funds moved ([transaction](https://testnet.bscscan.com/tx/0x21bf85f8fbf8f5d234d22045a02e6cd629ddd04919db0b2bb30e8a784c5e7cee)).
  - Addresses, script, and fork test: [DEMO-BNB-TESTNET-ATLAS.md](https://github.com/FlipLabsAI/signo-shield/blob/main/docs/DEMO-BNB-TESTNET-ATLAS.md).
- **Off-chain reads use Atlas on mainnet today.** The allowlist applies only to contracts. This CLI reads the Atlas feeds from an account with `eth_call`, and the Signo app reads the Atlas price API.

## Not in this version

- Moving funds. This CLI never signs. In Signo, agents act on BNB Chain through the Shield (see above).

## Tests

```sh
npm test
npm run typecheck
```

## Licence

MIT. See `LICENSE`.
