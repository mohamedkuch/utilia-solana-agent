# Guarded x402 buyer fixtures

These four Node.js examples make one live `$0.002 USDC` priority-fee call. Each
uses the official x402 v2 buyer packages to receive a challenge, enforce a local
policy, sign the exact quote, retry automatically, and verify the result and
settlement receipt.

Every run is labeled `buyer_fixture_operator_test`. Treat it as an operator
compatibility test, not customer demand.

## Install

```sh
git clone https://github.com/mohamedkuch/utilia-solana-agent.git
cd utilia-solana-agent
npm ci --ignore-scripts
```

Use a dedicated low-balance automation wallet. Never paste a production wallet
key into a fixture.

## Base MCP

The wallet needs Base USDC. Set the private key only in the local process:

```sh
export BASE_PRIVATE_KEY=0xYOUR_32_BYTE_AUTOMATION_WALLET_PRIVATE_KEY
node examples/buyers/base-mcp.mjs
```

## Solana MCP

The wallet needs Solana mainnet USDC and a small SOL balance:

```sh
export SOLANA_KEYPAIR_PATH=/absolute/path/to/automation-wallet.json
node examples/buyers/solana-mcp.mjs
```

## Base HTTP

```sh
export BASE_PRIVATE_KEY=0xYOUR_32_BYTE_AUTOMATION_WALLET_PRIVATE_KEY
node examples/buyers/base-http.mjs
```

## Solana HTTP

```sh
export SOLANA_KEYPAIR_PATH=/absolute/path/to/automation-wallet.json
node examples/buyers/solana-http.mjs
```

`SOLANA_PRIVATE_KEY` may be used instead of `SOLANA_KEYPAIR_PATH`, but a keypair
file avoids placing the key in shell history. None of the fixtures print or send
private key material.

## Fixed local policy

All four examples fail closed unless the quote satisfies every constraint:

| Constraint           | Base                                | Solana                                    |
| -------------------- | ----------------------------------- | ----------------------------------------- |
| HTTPS host           | `api.utilia.ink`                    | `api.utilia.ink`                          |
| x402 version         | `2`                                 | `2`                                       |
| scheme               | `exact`                             | `exact`                                   |
| network              | `eip155:8453`                       | `solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp` |
| asset                | Base USDC `0x8335...2913`           | Solana USDC `EPjF...Dt1v`                 |
| receiver             | `0xBf93...20fA`                     | `AX1T...UKh5`                             |
| resource             | exact requested URL or MCP tool URI | exact requested URL or MCP tool URI       |
| tool                 | `solana_priority_fees`              | `solana_priority_fees`                    |
| maximum timeout      | 300 seconds                         | 300 seconds                               |
| per-call maximum     | 2,000 atomic USDC                   | 2,000 atomic USDC                         |
| total process budget | 2,000 atomic USDC                   | 2,000 atomic USDC                         |
| approved retries     | exactly one                         | exactly one                               |

The budget is reserved before signing. A second quote in the same process is
denied even if the first payment later fails.

## Protocol compatibility matrix

| Stage                         | HTTP x402 v2                         | MCP x402 v2                                                                   |
| ----------------------------- | ------------------------------------ | ----------------------------------------------------------------------------- |
| Challenge carrier             | HTTP `402` plus `PAYMENT-REQUIRED`   | MCP tool error with `structuredContent`                                       |
| Challenge data                | `x402Version`, `resource`, `accepts` | `x402Version`, `resource`, `accepts`                                          |
| Signed retry carrier          | `PAYMENT-SIGNATURE` request header   | `_meta["x402/payment"]`                                                       |
| Settlement receipt            | `PAYMENT-RESPONSE` response header   | `_meta["x402/payment-response"]`, exposed as `paymentResponse` by `@x402/mcp` |
| Automatic retry               | `@x402/fetch`                        | `@x402/mcp`                                                                   |
| Expected application response | HTTP `200` JSON                      | successful MCP tool result                                                    |

The examples never construct those headers or MCP metadata fields manually. The
official clients parse the challenge, create the signed payload, attach it to one
retry, and decode the receipt.
