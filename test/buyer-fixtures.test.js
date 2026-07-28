import assert from "node:assert/strict";
import test from "node:test";
import {
  BASE,
  SOLANA,
  TOOL,
  TOOL_RESOURCE,
  assertAllowedEndpoint,
  createQuotePolicy,
  fixtureOutput,
  requireBasePrivateKey,
} from "../examples/buyers/policy.mjs";

function paymentRequired(overrides = {}) {
  return {
    x402Version: 2,
    resource: { url: TOOL_RESOURCE },
    accepts: [
      {
        scheme: "exact",
        network: BASE.network,
        asset: BASE.asset,
        payTo: BASE.payTo,
        amount: "2000",
        maxTimeoutSeconds: 300,
        ...overrides,
      },
    ],
  };
}

function basePolicy() {
  return createQuotePolicy({
    endpoint: BASE.mcpUrl,
    expectedResource: TOOL_RESOURCE,
    tool: TOOL,
    network: BASE.network,
    asset: BASE.asset,
    payTo: BASE.payTo,
  });
}

test("buyer fixture constants pin the production Base and Solana surfaces", () => {
  assert.equal(
    assertAllowedEndpoint(BASE.mcpUrl, BASE.mcpUrl).pathname,
    "/base/mcp",
  );
  assert.equal(
    assertAllowedEndpoint(SOLANA.mcpUrl, SOLANA.mcpUrl).pathname,
    "/mcp",
  );
  assert.equal(
    assertAllowedEndpoint(BASE.httpUrl, BASE.httpUrl).pathname,
    "/base/v1/fees/priority",
  );
  assert.equal(
    assertAllowedEndpoint(SOLANA.httpUrl, SOLANA.httpUrl).pathname,
    "/v1/fees/priority",
  );
});

test("endpoint allowlist rejects protocol, host, credentials, path, query, and fragment changes", () => {
  for (const value of [
    BASE.mcpUrl.replace("https:", "http:"),
    BASE.mcpUrl.replace("api.utilia.ink", "example.com"),
    BASE.mcpUrl.replace("https://", "https://user:pass@"),
    BASE.mcpUrl.replace("/base/mcp", "/mcp"),
    BASE.mcpUrl.replace("operator_test", "customer"),
    `${BASE.mcpUrl}#fragment`,
  ]) {
    assert.throws(
      () => assertAllowedEndpoint(value, BASE.mcpUrl),
      /allowlisted URL/,
    );
  }
});

test("quote policy approves one exact bounded x402 v2 MCP retry", () => {
  const policy = basePolicy();
  const quote = paymentRequired();
  assert.equal(
    policy.approveMcp({ toolName: TOOL, paymentRequired: quote }),
    true,
  );
  assert.deepEqual(policy.snapshot(), {
    approvals: 1,
    reservedAtomic: "2000",
    totalBudgetAtomic: "2000",
  });
  assert.equal(
    policy.approveMcp({ toolName: TOOL, paymentRequired: quote }),
    false,
  );
});

test("quote policy rejects mismatched or ambiguous requirements", () => {
  const changes = [
    { x402Version: 1 },
    { resource: { url: "mcp://tool/other" } },
    { accepts: [] },
    { accepts: [paymentRequired().accepts[0], paymentRequired().accepts[0]] },
    { accepts: [{ ...paymentRequired().accepts[0], scheme: "upto" }] },
    { accepts: [{ ...paymentRequired().accepts[0], network: SOLANA.network }] },
    { accepts: [{ ...paymentRequired().accepts[0], asset: "wrong" }] },
    { accepts: [{ ...paymentRequired().accepts[0], payTo: "wrong" }] },
    { accepts: [{ ...paymentRequired().accepts[0], amount: "2001" }] },
    { accepts: [{ ...paymentRequired().accepts[0], amount: "0" }] },
    { accepts: [{ ...paymentRequired().accepts[0], amount: "1.5" }] },
    { accepts: [{ ...paymentRequired().accepts[0], maxTimeoutSeconds: 301 }] },
    { accepts: [{ ...paymentRequired().accepts[0], maxTimeoutSeconds: 0 }] },
  ];
  for (const change of changes) {
    const policy = basePolicy();
    const quote = { ...paymentRequired(), ...change };
    assert.throws(() => policy.authorize(quote));
  }
  assert.equal(
    basePolicy().approveMcp({
      toolName: "other",
      paymentRequired: paymentRequired(),
    }),
    false,
  );
});

test("HTTP hook rejects a changed selected requirement without reserving budget", () => {
  const policy = basePolicy();
  const quote = paymentRequired();
  assert.deepEqual(
    policy.beforeHttpPayment({
      paymentRequired: quote,
      selectedRequirements: { ...quote.accepts[0], amount: "1999" },
    }),
    { abort: true, reason: "local buyer policy denied the quote" },
  );
  assert.equal(policy.snapshot().reservedAtomic, "0");
  assert.equal(
    policy.beforeHttpPayment({
      paymentRequired: quote,
      selectedRequirements: quote.accepts[0],
    }),
    undefined,
  );
});

test("wallet validation accepts only a 32-byte Base private key without exposing it", () => {
  const key = `0x${"ab".repeat(32)}`;
  assert.equal(requireBasePrivateKey({ BASE_PRIVATE_KEY: key }), key);
  for (const value of [
    undefined,
    "",
    "ab",
    `0x${"ab".repeat(31)}`,
    `0x${"zz".repeat(32)}`,
  ]) {
    assert.throws(
      () => requireBasePrivateKey({ BASE_PRIVATE_KEY: value }),
      /BASE_PRIVATE_KEY/,
    );
  }
});

test("fixture output labels operator tests and separates payment from data networks", () => {
  const policy = basePolicy();
  policy.authorize(paymentRequired());
  assert.deepEqual(
    fixtureOutput({
      paymentNetwork: BASE.network,
      transport: "mcp",
      policy,
      receipt: { transaction: "0xreceipt" },
      result: { sampleCount: 150 },
    }),
    {
      classification: "operator_compatibility_test_not_customer_demand",
      flow: "challenge -> policy -> sign exact quote -> retry -> result -> receipt",
      paymentNetwork: BASE.network,
      dataNetwork: "solana-mainnet",
      transport: "mcp",
      tool: TOOL,
      policy: {
        approvals: 1,
        reservedAtomic: "2000",
        totalBudgetAtomic: "2000",
      },
      receipt: { transaction: "0xreceipt" },
      result: { sampleCount: 150 },
    },
  );
});
