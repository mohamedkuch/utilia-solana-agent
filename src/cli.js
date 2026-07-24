#!/usr/bin/env node

import { parseCommand } from "./commands.js";
import { runMcpBridge } from "./bridge.js";
import { callUtiliaTool } from "./remote.js";
import { hasWalletConfiguration, loadWalletSigner } from "./wallet.js";
import { MAX_ATOMIC_USDC, SOLANA_MAINNET, UTILIA_MCP_URL, UTILIA_PAY_TO } from "./policy.js";

const help = `Utilia Solana Agent

Wallet-funded x402 client and MCP bridge for Solana intelligence and PDF extraction.

Usage:
  utilia-solana-agent doctor
  utilia-solana-agent fees [account1,account2]
  utilia-solana-agent transaction <signature>
  utilia-solana-agent simulate <serialized-transaction> [base64|base58]
  utilia-solana-agent token <mint>
  utilia-solana-agent pdf <public-https-pdf-url> [max-pages]
  utilia-solana-agent call <tool-name> '<json-arguments>'
  utilia-solana-agent mcp

Wallet:
  SOLANA_KEYPAIR_PATH=/absolute/path/to/keypair.json
  or SOLANA_PRIVATE_KEY=<base58-encoded-64-byte-private-key>

Every payment is restricted to Solana mainnet USDC, Utilia's receiver, and a
maximum of 0.01 USDC. Use a dedicated low-balance automation wallet.
`;

async function doctor() {
  if (!hasWalletConfiguration()) {
    throw new Error("Wallet is not configured. Set SOLANA_KEYPAIR_PATH or SOLANA_PRIVATE_KEY.");
  }
  const signer = await loadWalletSigner();
  const response = await fetch("https://api.utilia.ink/healthz");
  if (!response.ok) throw new Error(`Utilia health check returned HTTP ${response.status}`);
  const health = await response.json();
  process.stdout.write(
    `${JSON.stringify(
      {
        status: "ready",
        wallet: signer.address,
        api: UTILIA_MCP_URL,
        apiHealth: health,
        network: SOLANA_MAINNET,
        payTo: UTILIA_PAY_TO,
        maxUsdcPerCall: MAX_ATOMIC_USDC / 1_000_000,
      },
      null,
      2,
    )}\n`,
  );
}

async function main() {
  const command = parseCommand(process.argv.slice(2));
  if (command.type === "help") {
    process.stdout.write(help);
    return;
  }
  if (command.type === "version") {
    process.stdout.write("0.1.2\n");
    return;
  }
  if (command.type === "doctor") {
    await doctor();
    return;
  }
  if (command.type === "mcp") {
    await runMcpBridge();
    return;
  }
  if (command.type === "call") {
    const result = await callUtiliaTool(command.tool, command.args);
    const text = result.content?.find((item) => item.type === "text")?.text;
    process.stdout.write(`${text ?? JSON.stringify(result.content)}\n`);
    if (result.paymentMade) {
      process.stderr.write(
        `Payment settled: ${result.paymentResponse?.transaction || "receipt available"}\n`,
      );
    }
  }
}

main().catch((error) => {
  process.stderr.write(`utilia-solana-agent: ${error instanceof Error ? error.message : error}\n`);
  process.exitCode = 1;
});
