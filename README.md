# utilia-solana-agent

One command gives an AI agent four wallet-funded Solana intelligence tools. The
package connects to [Utilia](https://utilia.ink), handles x402 payments locally, and
can run either as a normal CLI or a standard stdio MCP server.

No Utilia account, API key, or subscription is required. Calls cost between $0.002
and $0.008 in Solana USDC.

## What agents can do

| Tool | Result | Price |
| --- | --- | ---: |
| `solana_priority_fees` | Recent priority-fee quantiles | $0.002 |
| `solana_transaction_analysis` | Confirmed transaction, deltas, logs, failure guidance | $0.004 |
| `solana_token_analysis` | Authorities, Token-2022 controls, concentration, risk flags | $0.006 |
| `solana_transaction_simulate` | Pre-broadcast simulation and failure classification | $0.008 |

## Quick start

Use a dedicated low-balance Solana automation wallet that holds a small amount of
mainnet USDC and SOL for fees.

```sh
export SOLANA_KEYPAIR_PATH=/absolute/path/to/automation-wallet.json
npx -y utilia-solana-agent doctor
npx -y utilia-solana-agent fees
```

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

The local bridge advertises all four Utilia tools. When the agent calls one, the
bridge verifies the payment request, signs the exact USDC payment locally, and returns
the paid result.

## CLI

```sh
npx -y utilia-solana-agent fees [account1,account2]
npx -y utilia-solana-agent transaction <signature>
npx -y utilia-solana-agent simulate <serialized-transaction> [base64|base58]
npx -y utilia-solana-agent token <mint>
npx -y utilia-solana-agent call <tool-name> '<json-arguments>'
```

## Payment guardrails

The package will only approve a payment when every field matches:

- network: Solana mainnet
- asset: official Solana mainnet USDC
- receiver: Utilia's published wallet
- maximum: 8,000 atomic USDC, or $0.008, per tool call

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
