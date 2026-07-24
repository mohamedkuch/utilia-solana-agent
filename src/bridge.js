import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { connectUtilia } from "./remote.js";

function forwarded(remote, tool) {
  return async (args) => {
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
  const remote = await connectUtilia({ ...options, name: "utilia-solana-agent-bridge" });
  const server = new McpServer(
    { name: "utilia-solana-agent", version: "0.1.2" },
    {
      instructions:
        "Use these wallet-funded paid tools for Solana intelligence and PDF-to-Markdown extraction. Each approved call costs at most 0.01 USDC.",
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
    forwarded(remote, "solana_transaction_analysis"),
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
    forwarded(remote, "solana_transaction_simulate"),
  );
  server.registerTool(
    "solana_priority_fees",
    {
      title: "Estimate Solana Priority Fees",
      description: "Return current priority-fee quantiles. Costs $0.002.",
      inputSchema: { accounts: z.array(z.string()).max(20).default([]) },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    forwarded(remote, "solana_priority_fees"),
  );
  server.registerTool(
    "solana_token_analysis",
    {
      title: "Analyze Solana Token",
      description: "Inspect a token mint, authorities, concentration, and risks. Costs $0.006.",
      inputSchema: { mint: z.string() },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    forwarded(remote, "solana_token_analysis"),
  );
  server.registerTool(
    "pdf_to_markdown",
    {
      title: "Convert PDF to Markdown",
      description:
        "Extract a PDF into page-delimited Markdown with metadata and a source digest. Costs $0.01.",
      inputSchema: {
        url: z.string().url().max(2_048).optional(),
        pdfBase64: z.string().max(11_200_000).optional(),
        title: z.string().trim().min(1).max(200).optional(),
        maxPages: z.coerce.number().int().min(1).max(100).default(50),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    forwarded(remote, "pdf_to_markdown"),
  );

  const shutdown = async () => {
    await server.close().catch(() => undefined);
    await remote.close().catch(() => undefined);
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
