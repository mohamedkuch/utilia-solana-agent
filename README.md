# utilia-solana-agent

Turn a failed Solana signature into a support-ready answer: what landed, what
changed, why it failed, and what is safe to try next. The package connects to
[Utilia](https://utilia.ink/solana-transaction-support), handles x402 payments
locally, and can run as a guarded CLI, a budget-capped fee watcher, or a standard
stdio MCP server.

No Utilia account, API key, or subscription is required. Calls cost between $0.002
and $0.01 in USDC on Solana or Base.

## Diagnose one failed transaction

Use a dedicated low-balance Solana automation wallet that holds a small amount of
mainnet USDC and SOL for fees:

```sh
export SOLANA_KEYPAIR_PATH=/absolute/path/to/automation-wallet.json
npx -y utilia-solana-agent@0.5.8 doctor
npx -y utilia-solana-agent@0.5.8 transaction <signature>
```

The diagnosis costs exactly **$0.004 USDC** and returns confirmation state, fee,
compute use, SOL and token deltas, program logs, a stable failure class, and a
retry-aware suggested action.

## Run a budget-capped priority-fee feed

```sh
export SOLANA_KEYPAIR_PATH=/absolute/path/to/automation-wallet.json
npx -y utilia-solana-agent@0.5.8 watch-fees \
  --every 12m \
  --max-calls 25
```

The first JSONL result is immediate, then one result is emitted every 12 minutes:
five calls per hour for **$0.01**, with an automatic **$0.05** maximum. Each line
includes the observation time, fee quantiles, paid amount, and settlement
transaction. Add `--accounts account1,account2` to localize the estimate to the
writable accounts in a transaction.

## Fastest wallet-managed proof

Agents that already use AgentCash can make the lowest-cost live call without
handling a private key directly:

```sh
npx -y agentcash@latest balance
npx -y agentcash@latest fetch \
  https://api.utilia.ink/base/v1/fees/priority --yes
```

This route returns live Solana priority-fee data and settles the exact **$0.002
USDC** payment on Base. AgentCash creates and manages its own wallet on first
use; `balance` reports its available funds and funding accounts. Utilia never
receives or controls the payer's key.

## Install the Solana evidence skill

Install the transaction workflow into Codex, Claude Code, OpenClaw, Cursor, or any
other agent supported by the open Skills CLI:

```sh
npx skills add mohamedkuch/utilia-solana-agent \
  --skill utilia-solana-preflight -g -y
```

Then ask the agent to use `$utilia-solana-preflight` to diagnose a failed
signature, fetch priority fees, inspect a token, or simulate before broadcast.

## What agents can do

| Tool                          | Result                                                      |   Price |
| ----------------------------- | ----------------------------------------------------------- | ------: |
| `solana_priority_fees`        | Recent priority-fee quantiles                               |  $0.002 |
| `solana_transaction_analysis` | Confirmed transaction, deltas, logs, failure guidance       |  $0.004 |
| `solana_token_analysis`       | Authorities, Token-2022 controls, concentration, risk flags |  $0.006 |
| `solana_transaction_simulate` | Pre-broadcast simulation and failure classification         |  $0.008 |
| `pdf_to_markdown`             | Page-delimited Markdown, metadata, and a source digest      | $0.0025 |
| `normalize_audio`             | Bounded normalized MP3, loudness measurements, and digests  |   $0.01 |

## PDF and audio utility transforms

The same guarded client also exposes two bounded non-Solana transforms:

```sh
npx -y utilia-solana-agent@0.5.8 pdf-to-markdown \
  https://example.com/document.pdf --max-pages 20
npx -y utilia-solana-agent@0.5.8 audio-normalize \
  https://example.com/voice-note.wav --output voice-note-normalized.mp3
```

PDF conversion costs **$0.0025 USDC** and returns page-delimited Markdown,
metadata, and a source digest. Audio normalization costs **$0.01 USDC**, targets
-16 integrated LUFS by default, verifies the saved MP3 locally, and returns
loudness evidence plus content digests.

Dedicated skills are available as `utilia-pdf-to-markdown` and
`utilia-audio-normalization`.

## Solana quick start

Use a dedicated low-balance Solana automation wallet that holds a small amount of
mainnet USDC and SOL for fees.

```sh
export SOLANA_KEYPAIR_PATH=/absolute/path/to/automation-wallet.json
npx -y utilia-solana-agent doctor
npx -y utilia-solana-agent fees
```

For a JSONL fee feed at five calls per hour, capped at 25 calls and **$0.05 total**:

```sh
npx -y utilia-solana-agent watch-fees --every 12m --max-calls 25
```

The first result is immediate, then one result is emitted every 12 minutes. The
process stops after 25 calls; `Ctrl-C` stops it sooner. Localize estimates to the
writable accounts used by your transaction builder with
`--accounts account1,account2`.

You can alternatively set `SOLANA_PRIVATE_KEY` to a base58-encoded 64-byte private
key. Environment variables are inherited by the local process; the private key is
never sent to Utilia.

## Solana Agent Kit plugin

Use the same wallet already attached to
[Solana Agent Kit](https://github.com/sendaifun/solana-agent-kit). The plugin adds
four budget-capped, read-only actions without asking for a second private key:

```js
import { SolanaAgentKit } from "solana-agent-kit";
import { createUtiliaPlugin } from "utilia-solana-agent";

const agent = new SolanaAgentKit(wallet, rpcUrl, {}).use(createUtiliaPlugin());

const fees = await agent.methods.utiliaPriorityFees(agent, {
  accounts: writableAccounts,
});
```

The registered agent actions are `UTILIA_PRIORITY_FEES`,
`UTILIA_SIMULATE_TRANSACTION`, `UTILIA_ANALYZE_TRANSACTION`, and
`UTILIA_ANALYZE_TOKEN`. Payments are signed by the Agent Kit wallet only after the
same receiver, asset, network, and per-call maximum checks described below pass.
The wallet must implement Agent Kit's `signMessage()` method and hold a small amount
of Solana mainnet USDC; the facilitator pays the transaction fee.

## Add it to an MCP client

Add this stdio server to any MCP client that supports an executable command:

```json
{
  "mcpServers": {
    "utilia": {
      "command": "npx",
      "args": ["-y", "utilia-solana-agent@0.5.8", "mcp"],
      "env": {
        "SOLANA_KEYPAIR_PATH": "/absolute/path/to/automation-wallet.json"
      }
    }
  }
}
```

The local bridge advertises all six Utilia tools without loading or transmitting a
wallet. When the agent calls one, the bridge loads the configured wallet locally,
verifies the payment request, signs the exact USDC payment, and returns the paid
result. A wallet is therefore required for tool execution, not for MCP initialization
or `tools/list`.

## CLI

```sh
npx -y utilia-solana-agent fees [account1,account2]
npx -y utilia-solana-agent watch-fees [--every 12m] [--max-calls 25] [--accounts account1,account2]
npx -y utilia-solana-agent transaction <signature>
npx -y utilia-solana-agent simulate <serialized-transaction> [base64|base58]
npx -y utilia-solana-agent token <mint>
npx -y utilia-solana-agent@0.5.8 audio-normalize <public-https-audio-url> [--output normalized.mp3] [--target-lufs -16] [--max-seconds 180]
npx -y utilia-solana-agent@0.5.8 pdf <public-https-pdf-url> [max-pages]
npx -y utilia-solana-agent@0.5.8 pdf-to-markdown <public-https-pdf-url> [--max-pages 50]
npx -y utilia-solana-agent call <tool-name> '<json-arguments>'
```

## Payment guardrails

The package will only approve a payment when every field matches:

- network: Solana mainnet
- asset: official Solana mainnet USDC
- receiver: Utilia's published wallet
- maximum: 10,000 atomic USDC, or $0.01, per tool call

A changed receiver, asset, network, zero amount, malformed amount, or higher amount is
rejected before signing. The package has no withdrawal, swap, token-launch, or
arbitrary-transaction capability.

## Machine-readable endpoints

- Remote MCP: `https://api.utilia.ink/mcp`
- OpenAPI: `https://api.utilia.ink/openapi.json`
- x402 discovery: `https://api.utilia.ink/.well-known/x402`
- MCP registry package: `ink.utilia/solana-preflight`

## License

MIT
