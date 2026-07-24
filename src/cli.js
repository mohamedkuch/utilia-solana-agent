#!/usr/bin/env node

import { parseCommand } from "./commands.js";
import { saveNormalizedAudio } from "./audio-output.js";
import { runMcpBridge } from "./bridge.js";
import { callUtiliaTool, connectUtilia } from "./remote.js";
import { hasWalletConfiguration, loadWalletSigner } from "./wallet.js";
import { MAX_ATOMIC_USDC, SOLANA_MAINNET, UTILIA_MCP_URL, UTILIA_PAY_TO } from "./policy.js";

const help = `Utilia Agent Tools

Wallet-funded x402 client for audio, PDF-to-Markdown, and live Solana intelligence.

Usage:
  utilia-solana-agent doctor
  utilia-solana-agent fees [account1,account2]
  utilia-solana-agent watch-fees [--every 12m] [--max-calls 25] [--accounts account1,account2]
  utilia-solana-agent transaction <signature>
  utilia-solana-agent simulate <serialized-transaction> [base64|base58]
  utilia-solana-agent token <mint>
  utilia-solana-agent audio-normalize <public-https-audio-url> [--output normalized.mp3] [--target-lufs -16] [--max-seconds 180]
  utilia-solana-agent pdf <public-https-pdf-url> [max-pages]
  utilia-solana-agent pdf-to-markdown <public-https-pdf-url> [--max-pages 50]
  utilia-solana-agent call <tool-name> '<json-arguments>'
  utilia-solana-agent mcp

Wallet:
  SOLANA_KEYPAIR_PATH=/absolute/path/to/keypair.json
  or SOLANA_PRIVATE_KEY=<base58-encoded-64-byte-private-key>

Every payment is restricted to Solana mainnet USDC, Utilia's receiver, and a
maximum of 0.01 USDC. Use a dedicated low-balance automation wallet.
`;

const VERSION = "0.4.0";

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function watchFees(command) {
  const maximumCostUsdc = command.maxCalls * 0.002;
  process.stderr.write(
    `Starting ${command.maxCalls} priority-fee calls every ${command.everySeconds}s ` +
      `(maximum Utilia spend ${maximumCostUsdc.toFixed(3)} USDC; Ctrl-C to stop).\n`,
  );
  const client = await connectUtilia({ name: "utilia-priority-fee-watcher" });
  try {
    for (let call = 1; call <= command.maxCalls; call += 1) {
      const startedAt = new Date().toISOString();
      const result = await client.callTool("solana_priority_fees", {
        accounts: command.accounts,
      });
      const text = result.content?.find((item) => item.type === "text")?.text;
      let data = text;
      try {
        data = text === undefined ? null : JSON.parse(text);
      } catch {
        // Preserve unexpected non-JSON tool output for observability.
      }
      process.stdout.write(
        `${JSON.stringify({
          time: startedAt,
          call,
          maxCalls: command.maxCalls,
          paidUsdc: result.paymentMade ? 0.002 : 0,
          transaction: result.paymentResponse?.transaction || null,
          data,
        })}\n`,
      );
      if (call < command.maxCalls) await sleep(command.everySeconds * 1_000);
    }
  } finally {
    await client.close().catch(() => undefined);
  }
}

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
    process.stdout.write(`${VERSION}\n`);
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
  if (command.type === "watch-fees") {
    await watchFees(command);
    return;
  }
  if (command.type === "audio") {
    const result = await callUtiliaTool(command.tool, command.args);
    const text = result.content?.find((item) => item.type === "text")?.text;
    if (!text) throw new Error("Utilia returned no audio result");
    const saved = await saveNormalizedAudio(text, command.output);
    process.stdout.write(`${JSON.stringify(saved, null, 2)}\n`);
    if (result.paymentMade) {
      process.stderr.write(
        `Payment settled: ${result.paymentResponse?.transaction || "receipt available"}\n`,
      );
    }
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
