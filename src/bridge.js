import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { connectUtilia } from "./remote.js";
import { VERSION } from "./version.js";

function forwarded(getRemote, tool) {
  return async (args) => {
    const remote = await getRemote();
    const result = await remote.callTool(tool, args);
    if (result.paymentMade) {
      process.stderr.write(
        `[utilia] payment settled: ${result.paymentResponse?.transaction || "receipt available"}\n`,
      );
    }
    return {
      content: result.content,
      ...(result.isError ? { isError: true } : {}),
    };
  };
}

export async function runMcpBridge(options = {}) {
  let remote;
  const getRemote = async () => {
    remote ??= await connectUtilia({ ...options, name: "utilia-solana-agent-bridge" });
    return remote;
  };
  const server = new McpServer(
    { name: "utilia-solana-agent", version: VERSION },
    {
      instructions:
        "Use these wallet-funded paid tools for Solana intelligence, PDF-to-Markdown extraction, and bounded audio normalization. Each approved call costs at most 0.01 USDC.",
    },
  );

  server.registerTool(
    "solana_transaction_analysis",
    {
      title: "Analyze Solana Transaction",
      description: "Explain a confirmed Solana transaction and classify failures. Costs $0.004.",
      inputSchema: { signature: z.string().min(64).max(100) },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    forwarded(getRemote, "solana_transaction_analysis"),
  );
  server.registerTool(
    "solana_transaction_simulate",
    {
      title: "Simulate Solana Transaction",
      description: "Simulate a transaction before broadcast and classify failures. Costs $0.008.",
      inputSchema: {
        transaction: z.string().min(40),
        encoding: z.enum(["base64", "base58"]).default("base64"),
        accountAddresses: z.array(z.string()).max(20).default([]),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    forwarded(getRemote, "solana_transaction_simulate"),
  );
  server.registerTool(
    "solana_priority_fees",
    {
      title: "Estimate Solana Priority Fees",
      description:
        "Return current network-wide or account-localized priority-fee quantiles before choosing a compute-unit price. Costs $0.002.",
      inputSchema: { accounts: z.array(z.string()).max(20).default([]) },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    forwarded(getRemote, "solana_priority_fees"),
  );
  server.registerTool(
    "solana_token_analysis",
    {
      title: "Analyze Solana Token",
      description: "Inspect a token mint, authorities, concentration, and risks. Costs $0.006.",
      inputSchema: { mint: z.string() },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    forwarded(getRemote, "solana_token_analysis"),
  );
  server.registerTool(
    "pdf_to_markdown",
    {
      title: "Convert PDF to Markdown",
      description:
        "Extract a PDF into page-delimited Markdown with metadata and a source digest. Costs $0.0025.",
      inputSchema: {
        url: z.string().url().max(2_048).optional(),
        pdfBase64: z.string().max(11_200_000).optional(),
        title: z.string().trim().min(1).max(200).optional(),
        maxPages: z.coerce.number().int().min(1).max(100).default(50),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    forwarded(getRemote, "pdf_to_markdown"),
  );
  server.registerTool(
    "normalize_audio",
    {
      title: "Normalize Audio Loudness",
      description:
        "Normalize public HTTPS or base64 audio to a bounded MP3 with loudness evidence and content digests. Costs $0.01.",
      inputSchema: {
        url: z.string().url().max(2_048).optional(),
        audioBase64: z.string().max(11_200_000).optional(),
        targetLufs: z.coerce.number().min(-24).max(-12).default(-16),
        maxSeconds: z.coerce.number().int().min(1).max(180).default(180),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    forwarded(getRemote, "normalize_audio"),
  );

  const shutdown = async () => {
    await server.close().catch(() => undefined);
    await remote?.close().catch(() => undefined);
  };
  process.once("SIGINT", () => void shutdown().finally(() => process.exit(0)));
  process.once("SIGTERM", () => void shutdown().finally(() => process.exit(0)));

  try {
    await server.connect(new StdioServerTransport());
  } catch (error) {
    await shutdown();
    throw error;
  }
}
