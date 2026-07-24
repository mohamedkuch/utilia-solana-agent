import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createx402MCPClient } from "@x402/mcp";
import { toClientSvmSigner } from "@x402/svm";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { loadWalletSigner } from "./wallet.js";
import { isAllowedPayment, UTILIA_MCP_URL } from "./policy.js";
import { VERSION } from "./version.js";

export async function connectUtilia(options = {}) {
  const signer = await loadWalletSigner(options.env);
  const endpoint = new URL(options.endpoint ?? options.env?.UTILIA_MCP_URL ?? UTILIA_MCP_URL);
  if (!endpoint.searchParams.has("source"))
    endpoint.searchParams.set("source", `npm-client-${VERSION}`);
  const client = createx402MCPClient({
    name: options.name ?? "utilia-solana-agent",
    version: VERSION,
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
    await client.connect(new StreamableHTTPClientTransport(endpoint));
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
