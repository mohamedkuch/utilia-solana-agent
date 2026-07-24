import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
/* c8 ignore next 3 -- static adapter imports contain no executable application behavior */
import { createx402MCPClient } from "@x402/mcp";
import { toClientSvmSigner } from "@x402/svm";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { loadWalletSigner } from "./wallet.js";
import { isAllowedPayment, UTILIA_MCP_URL } from "./policy.js";
import { VERSION } from "./version.js";

export function createEndpoint(options = {}) {
  const endpoint = new URL(
    options.endpoint ?? options.env?.UTILIA_MCP_URL ?? UTILIA_MCP_URL,
  );
  if (!endpoint.searchParams.has("source"))
    endpoint.searchParams.set(
      "source",
      options.source ?? `npm-client-${VERSION}`,
    );
  return endpoint;
}

export async function resolveSigner(options = {}, loader = loadWalletSigner) {
  return options.signer ?? (await loader(options.env));
}

export function createUtiliaClient(
  signer,
  options = {},
  factory = createx402MCPClient,
) {
  return factory({
    name: options.name ?? "utilia-solana-agent",
    version: VERSION,
    schemes: [
      {
        network: "solana:*",
        client: new ExactSvmScheme(toClientSvmSigner(signer)),
      },
    ],
    autoPayment: true,
    onPaymentRequested: ({ paymentRequired }) =>
      isAllowedPayment(paymentRequired),
  });
}

export function createTransport(
  endpoint,
  factory = (url) => new StreamableHTTPClientTransport(url),
) {
  return factory(endpoint);
}

export async function connectUtilia(options = {}, dependencies = {}) {
  const signer = await resolveSigner(options, dependencies.loadWalletSigner);
  const endpoint = createEndpoint(options);
  const client = createUtiliaClient(signer, options, dependencies.createClient);
  const transport = createTransport(endpoint, dependencies.createTransport);

  try {
    await client.connect(transport);
    return client;
  } catch (error) {
    await client.close().catch(() => undefined);
    throw error;
  }
}

export async function callUtiliaTool(
  tool,
  args,
  options = {},
  dependencies = {},
) {
  const client = await (dependencies.connectUtilia ?? connectUtilia)(
    options,
    dependencies,
  );
  try {
    return await client.callTool(tool, args);
  } finally {
    await client.close().catch(() => undefined);
  }
}
