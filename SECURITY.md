# Security

## Wallet handling

`utilia-solana-agent` reads a Solana signer only from `SOLANA_KEYPAIR_PATH` or
`SOLANA_PRIVATE_KEY`. It does not upload, persist, print, or log private-key material.
The signer is used locally to authorize exact x402 USDC payments.

Every payment must match all of these hard-coded constraints:

- Solana mainnet
- the official mainnet USDC mint
- Utilia's published receiver
- a positive amount no greater than 0.01 USDC

The client rejects a payment request if any constraint differs.

Prefer a dedicated low-balance automation wallet. Do not use a primary treasury or
personal wallet.

## Reporting

Report vulnerabilities privately to the repository owner through GitHub's security
advisory flow. Do not include private keys, recovery codes, or live credentials in an
issue.
