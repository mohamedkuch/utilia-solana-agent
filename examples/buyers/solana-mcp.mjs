import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createx402MCPClient } from "@x402/mcp";
import { toClientSvmSigner } from "@x402/svm";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { loadWalletSigner } from "utilia-solana-agent";
import {
  FIXTURE_SOURCE,
  SOLANA,
  TOOL,
  TOOL_RESOURCE,
  assertAllowedEndpoint,
  createQuotePolicy,
  fixtureOutput,
} from "./policy.mjs";

const endpoint = assertAllowedEndpoint(SOLANA.mcpUrl, SOLANA.mcpUrl);
const signer = await loadWalletSigner();
const policy = createQuotePolicy({
  endpoint,
  expectedResource: TOOL_RESOURCE,
  tool: TOOL,
  network: SOLANA.network,
  asset: SOLANA.asset,
  payTo: SOLANA.payTo,
});
const client = createx402MCPClient({
  name: "utilia-solana-mcp-buyer-fixture",
  version: "1.0.0",
  schemes: [
    {
      network: SOLANA.network,
      client: new ExactSvmScheme(toClientSvmSigner(signer)),
    },
  ],
  autoPayment: true,
  onPaymentRequested: (context) => policy.approveMcp(context),
});
const transport = new StreamableHTTPClientTransport(endpoint, {
  requestInit: {
    headers: {
      "user-agent": "utilia-buyer-fixture/1.0",
      "x-utilia-source": FIXTURE_SOURCE,
    },
  },
});

try {
  await client.connect(transport);
  const response = await client.callTool(TOOL, { accounts: [] });
  if (
    response.isError ||
    !response.paymentMade ||
    !response.paymentResponse?.success
  ) {
    throw new Error(
      "Solana MCP did not return a successful paid result and receipt",
    );
  }
  if (policy.snapshot().approvals !== 1) {
    throw new Error(
      "Solana MCP did not require exactly one approved paid retry",
    );
  }

  console.log(
    JSON.stringify(
      fixtureOutput({
        paymentNetwork: SOLANA.network,
        transport: "mcp",
        policy,
        receipt: response.paymentResponse,
        result: JSON.parse(response.content[0]?.text ?? "{}"),
      }),
      null,
      2,
    ),
  );
} finally {
  await client.close().catch(() => undefined);
}
