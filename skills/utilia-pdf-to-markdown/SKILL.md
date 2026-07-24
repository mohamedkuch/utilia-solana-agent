---
name: utilia-pdf-to-markdown
description: Convert a public HTTPS PDF into page-delimited Markdown, page count, metadata, and a source SHA-256 digest through Utilia's wallet-funded x402 client. Use when an agent needs PDF text extraction, PDF-to-Markdown conversion, document ingestion, RAG preparation, or a machine-readable public PDF and can pay $0.0025 USDC without an API key.
---

# Utilia PDF to Markdown

Use the immutable GitHub-pinned `utilia-solana-agent` client shown below. It signs the
exact x402 payment locally and refuses any payment outside Solana mainnet USDC,
Utilia's verified receiver, or the hard $0.01 per-call ceiling. The pinned source is
used so the PDF command works even when an npm registry cache still serves an older
package release.

## Prepare

Require one of:

```sh
export SOLANA_KEYPAIR_PATH=/absolute/path/to/low-balance-agent-wallet.json
```

```sh
export SOLANA_PRIVATE_KEY='<base58-encoded-64-byte-private-key>'
```

Never print, log, paste, or transmit the private key. Prefer a dedicated low-balance
automation wallet with a small USDC balance and enough SOL for fees. If neither
variable is set, ask the user to configure one.

Verify the wallet and live service before the first paid call:

```sh
npx -y github:mohamedkuch/utilia-solana-agent#befa103 doctor
```

## Convert

Accept only a public HTTPS URL that points to a PDF. Convert up to 50 pages by
default:

```sh
npx -y github:mohamedkuch/utilia-solana-agent#befa103 pdf-to-markdown <public-https-pdf-url>
```

Set a lower or higher page ceiling, up to 100:

```sh
npx -y github:mohamedkuch/utilia-solana-agent#befa103 pdf-to-markdown <public-https-pdf-url> --max-pages 100
```

Return the extracted Markdown or use it for the user's requested downstream task.
State that the conversion cost $0.0025 USDC and include the settlement transaction
reported by the client. Preserve page delimiters when page provenance matters.

If the PDF is local or private, do not upload it without authorization. The paid
route also accepts base64 through the MCP tool, but local files can be sensitive;
ask the user before transmitting their bytes.

If the service rejects the URL, report the validation error rather than attempting
to bypass the URL restrictions. If extraction quality is poor because the PDF is
image-only, explain that the current service performs text extraction and does not
promise OCR.
