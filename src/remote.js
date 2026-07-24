import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createx402MCPClient } from "@x402/mcp";
import { toClientSvmSigner } from "@x402/svm";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { loadWalletSigner } from "./wallet.js";
import { isAllowedPayment, UTILIA_MCP_URL } from "./policy.js";

export async function connectUtilia(options = {}) {
  const signer = await loadWalletSigner(options.env);
  const endpoint = options.endpoint ?? options.env?.UTILIA_MCP_URL ?? UTILIA_MCP_URL;
  const client = createx402MCPClient({
    name: options.name ?? "utilia-solana-agent",
    version: "0.1.1",
    schemes: [
      {
        network: "solana:*",
        client: new ExactSvmScheme(toClientSvmSigner(signer)),
      },
    ],
    autoPayment: true,
    onPaymentRequested: ({ paymentRequired }) => isAllowedPayment(paymentRequired),
  });

  try {
    await client.connect(new StreamableHTTPClientTransport(new URL(endpoint)));
    return client;
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}

export async function callUtiliaTool(tool, args, options = {}) {
  const client = await connectUtilia(options);
  try {
    return await client.callTool(tool, args);
  } finally {
    await client.close().catch(() => undefined);
  }
}
