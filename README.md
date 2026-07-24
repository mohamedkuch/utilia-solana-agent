# utilia-solana-agent

Convert a public PDF to agent-ready Markdown or give a Solana bot a live priority-fee
signal in one command. The package connects to [Utilia](https://utilia.ink), handles
x402 payments locally, and can run as a guarded CLI, a budget-capped fee watcher, or
a standard stdio MCP server.

No Utilia account, API key, or subscription is required. Calls cost between $0.002
and $0.01 in Solana USDC.

## PDF to Markdown in one command

Use a dedicated low-balance Solana automation wallet that holds a small amount of
mainnet USDC and SOL for fees:

```sh
export SOLANA_KEYPAIR_PATH=/absolute/path/to/automation-wallet.json
npx -y utilia-solana-agent doctor
npx -y utilia-solana-agent pdf-to-markdown https://example.com/document.pdf
```

Each conversion costs exactly **$0.0025 USDC** and returns page-delimited Markdown,
metadata, and a source SHA-256 digest. Limit extraction with `--max-pages 20`.

## Install as an agent skill

Install the dedicated PDF skill into Codex, Claude Code, OpenClaw, Cursor, or any
other agent supported by the open Skills CLI:

```sh
npx skills add mohamedkuch/utilia-solana-agent \
  --skill utilia-pdf-to-markdown -g -y
```

Then ask the agent to use `$utilia-pdf-to-markdown` on a public PDF. Install
`utilia-solana-preflight` from the same repository for Solana transaction workflows.
The PDF skill is also browsable on
[skills.sh](https://skills.sh/mohamedkuch/utilia-solana-agent/utilia-pdf-to-markdown)
and [Smithery](https://smithery.ai/skills/medksbuss/utilia-pdf-to-markdown).

## What agents can do

| Tool | Result | Price |
| --- | --- | ---: |
| `solana_priority_fees` | Recent priority-fee quantiles | $0.002 |
| `solana_transaction_analysis` | Confirmed transaction, deltas, logs, failure guidance | $0.004 |
| `solana_token_analysis` | Authorities, Token-2022 controls, concentration, risk flags | $0.006 |
| `solana_transaction_simulate` | Pre-broadcast simulation and failure classification | $0.008 |
| `pdf_to_markdown` | Page-delimited Markdown, metadata, and a source digest | $0.0025 |

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

## Add it to an MCP client

Add this stdio server to any MCP client that supports an executable command:

```json
{
  "mcpServers": {
    "utilia": {
      "command": "npx",
      "args": ["-y", "utilia-solana-agent", "mcp"],
      "env": {
        "SOLANA_KEYPAIR_PATH": "/absolute/path/to/automation-wallet.json"
      }
    }
  }
}
```

The local bridge advertises all five Utilia tools. When the agent calls one, the
bridge verifies the payment request, signs the exact USDC payment locally, and returns
the paid result.

## CLI

```sh
npx -y utilia-solana-agent fees [account1,account2]
npx -y utilia-solana-agent watch-fees [--every 12m] [--max-calls 25] [--accounts account1,account2]
npx -y utilia-solana-agent transaction <signature>
npx -y utilia-solana-agent simulate <serialized-transaction> [base64|base58]
npx -y utilia-solana-agent token <mint>
npx -y utilia-solana-agent pdf <public-https-pdf-url> [max-pages]
npx -y utilia-solana-agent pdf-to-markdown <public-https-pdf-url> [--max-pages 50]
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
