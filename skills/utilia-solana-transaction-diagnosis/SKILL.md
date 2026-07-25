---
name: utilia-solana-transaction-diagnosis
description: Diagnose and explain a confirmed or failed Solana transaction signature with Utilia's $0.004 x402 service. Use when a user or agent needs landed state, SOL and token balance deltas, program logs, compute use, a stable failure class, or the next retry-safe action without configuring an API key.
---

# Utilia Solana Transaction Diagnosis

Turn one Solana signature into a support-ready explanation. Prefer the
wallet-managed AgentCash route; it checks the quote before paying and does not
send a private key to Utilia.

## Validate the request

Require one Base58 Solana signature between 64 and 88 characters. A transaction
signature is public on-chain data, not a wallet secret. Never ask for a seed
phrase or private key.

Set the call URL by replacing `YOUR_SIGNATURE`:

```sh
https://api.utilia.ink/base/v1/transaction/YOUR_SIGNATURE
```

## Check before paying

Inspect the live x402 quote without settling:

```sh
npx -y agentcash@latest check \
  "https://api.utilia.ink/base/v1/transaction/YOUR_SIGNATURE"
```

Proceed only when the quote identifies the expected Utilia URL, Base network,
USDC asset, and an exact price no higher than `$0.004`.

If the user has not already authorized this specific paid diagnosis, state that
the next command spends exactly `$0.004 USDC` and ask for confirmation. Do not
pay from an operator wallet to simulate customer demand.

## Diagnose

After payment authorization, run:

```sh
npx -y agentcash@latest fetch \
  "https://api.utilia.ink/base/v1/transaction/YOUR_SIGNATURE" --yes
```

AgentCash manages the wallet, signs the x402 payment locally, retries the request,
and returns the response. If its wallet is unfunded, report the funding account
shown by `npx -y agentcash@latest balance`; do not search for other credentials.

## Explain the evidence

Return a compact diagnosis containing:

- whether the signature landed and whether execution succeeded;
- slot, block time, fee, compute units, and confirmation state when available;
- meaningful SOL and token balance deltas;
- the relevant program-log failure, without dumping unrelated logs;
- Utilia's failure category and suggested next action;
- the settled price and payment receipt reported by AgentCash.

Separate observed evidence from inference. Do not claim that a retry or simulation
guarantees future execution because block state, balances, and market conditions
can change.
