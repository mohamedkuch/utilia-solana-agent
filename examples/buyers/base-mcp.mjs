import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { createx402MCPClient } from "@x402/mcp";
import { privateKeyToAccount } from "viem/accounts";
import {
  BASE,
  FIXTURE_SOURCE,
  TOOL,
  TOOL_RESOURCE,
  assertAllowedEndpoint,
  createQuotePolicy,
  fixtureOutput,
  requireBasePrivateKey,
} from "./policy.mjs";

const endpoint = assertAllowedEndpoint(BASE.mcpUrl, BASE.mcpUrl);
const account = privateKeyToAccount(requireBasePrivateKey());
const policy = createQuotePolicy({
  endpoint,
  expectedResource: TOOL_RESOURCE,
  tool: TOOL,
  network: BASE.network,
  asset: BASE.asset,
  payTo: BASE.payTo,
});
const client = createx402MCPClient({
  name: "utilia-base-mcp-buyer-fixture",
  version: "1.0.0",
  schemes: [{ network: BASE.network, client: new ExactEvmScheme(account) }],
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
      "Base MCP did not return a successful paid result and receipt",
    );
  }
  if (policy.snapshot().approvals !== 1) {
    throw new Error("Base MCP did not require exactly one approved paid retry");
  }

  console.log(
    JSON.stringify(
      fixtureOutput({
        paymentNetwork: BASE.network,
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
