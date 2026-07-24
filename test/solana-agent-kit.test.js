import assert from "node:assert/strict";
import test from "node:test";
import {
  createSolanaAgentKitSigner,
  createUtiliaPlugin,
} from "../src/solana-agent-kit.js";

function createAgent() {
  const calls = [];
  return {
    calls,
    wallet: {
      publicKey: { toBase58: () => "11111111111111111111111111111111" },
      async signMessage(message) {
        calls.push(message);
        return new Uint8Array(64).fill(7);
      },
    },
  };
}

test("adapts a Solana Agent Kit wallet without exporting its private key", async () => {
  const agent = createAgent();
  const signer = createSolanaAgentKitSigner(agent);
  const messageBytes = new Uint8Array([1, 2, 3]);
  const signatures = await signer.signTransactions([{ messageBytes }]);

  assert.equal(signer.address, "11111111111111111111111111111111");
  assert.equal(agent.calls[0], messageBytes);
  assert.deepEqual(
    signatures[0]["11111111111111111111111111111111"],
    new Uint8Array(64).fill(7),
  );
});

test("rejects wallets that return malformed signatures", async () => {
  const agent = createAgent();
  agent.wallet.signMessage = async () => new Uint8Array(63);
  const signer = createSolanaAgentKitSigner(agent);

  await assert.rejects(
    () => signer.signTransactions([{ messageBytes: new Uint8Array([1]) }]),
    /invalid Ed25519 signature/,
  );
});

test("registers four paid read-only actions and forwards the agent wallet signer", async () => {
  const calls = [];
  const plugin = createUtiliaPlugin({
    async callTool(tool, args, options) {
      calls.push({ tool, args, options });
      return {
        content: [{ type: "text", text: '{"medium":1200}' }],
        paymentMade: true,
        paymentResponse: { transaction: "test-signature" },
      };
    },
  });
  const agent = createAgent();

  assert.equal(plugin.name, "utilia");
  assert.deepEqual(
    plugin.actions.map((action) => action.name),
    [
      "UTILIA_PRIORITY_FEES",
      "UTILIA_SIMULATE_TRANSACTION",
      "UTILIA_ANALYZE_TRANSACTION",
      "UTILIA_ANALYZE_TOKEN",
    ],
  );

  const result = await plugin.methods.utiliaPriorityFees(agent, {
    accounts: ["11111111111111111111111111111111"],
  });

  assert.deepEqual(result, {
    status: "success",
    data: { medium: 1200 },
    payment: { made: true, transaction: "test-signature" },
  });
  assert.equal(calls[0].tool, "solana_priority_fees");
  assert.deepEqual(calls[0].args, {
    accounts: ["11111111111111111111111111111111"],
  });
  assert.equal(
    calls[0].options.signer.address,
    "11111111111111111111111111111111",
  );
  assert.equal(calls[0].options.source, "solana-agent-kit");
});

test("returns structured action errors instead of throwing into the agent loop", async () => {
  const plugin = createUtiliaPlugin({
    async callTool() {
      throw new Error("wallet has no USDC");
    },
  });
  const agent = createAgent();
  const action = plugin.actions.find(
    (entry) => entry.name === "UTILIA_PRIORITY_FEES",
  );

  assert.deepEqual(await action.handler(agent, { accounts: [] }), {
    status: "error",
    message: "wallet has no USDC",
  });
});

test("validates the Agent Kit wallet interface", async () => {
  assert.throws(() => createSolanaAgentKitSigner({}), /publicKey\.toBase58/);
  assert.throws(
    () =>
      createSolanaAgentKitSigner({
        wallet: { publicKey: { toBase58: () => "wallet" } },
      }),
    /support signMessage/,
  );
  const agent = createAgent();
  agent.wallet.signMessage = async () => "not bytes";
  await assert.rejects(
    () =>
      createSolanaAgentKitSigner(agent).signTransactions([
        { messageBytes: new Uint8Array([1]) },
      ]),
    /invalid Ed25519 signature/,
  );
});

test("forwards every plugin method with defaults and preserves error payloads", async () => {
  const calls = [];
  const responses = [
    { content: [{ type: "text", text: "plain text" }], paymentMade: false },
    { content: [{ type: "image", data: "x" }], isError: true },
    { content: [] },
    undefined,
  ];
  const plugin = createUtiliaPlugin({
    clientOptions: { endpoint: "https://example.com/mcp" },
    async callTool(tool, args, options) {
      calls.push({ tool, args, options });
      return responses.shift();
    },
  });
  const agent = createAgent();

  assert.deepEqual(await plugin.methods.utiliaPriorityFees(agent), {
    status: "success",
    data: "plain text",
    payment: { made: false },
  });
  assert.deepEqual(
    await plugin.methods.utiliaSimulateTransaction(agent, {
      transaction: "serialized",
    }),
    {
      status: "error",
      data: [{ type: "image", data: "x" }],
      payment: { made: false },
    },
  );
  assert.deepEqual(
    await plugin.methods.utiliaAnalyzeTransaction(agent, {
      signature: "signature",
    }),
    {
      status: "success",
      data: [],
      payment: { made: false },
    },
  );
  assert.deepEqual(
    await plugin.methods.utiliaAnalyzeToken(agent, { mint: "mint" }),
    {
      status: "success",
      data: [],
      payment: { made: false },
    },
  );

  assert.deepEqual(
    calls.map(({ tool }) => tool),
    [
      "solana_priority_fees",
      "solana_transaction_simulate",
      "solana_transaction_analysis",
      "solana_token_analysis",
    ],
  );
  assert.deepEqual(calls[1].args, {
    transaction: "serialized",
    encoding: "base64",
    accountAddresses: [],
  });
  assert.equal(calls[0].options.endpoint, "https://example.com/mcp");
  assert.equal(plugin.initialize(agent), undefined);
});

test("stringifies non-Error action failures", async () => {
  const plugin = createUtiliaPlugin({
    async callTool() {
      throw "wallet unavailable";
    },
  });
  const action = plugin.actions.find(
    (entry) => entry.name === "UTILIA_ANALYZE_TOKEN",
  );
  assert.deepEqual(await action.handler(createAgent(), { mint: "mint" }), {
    status: "error",
    message: "wallet unavailable",
  });
});

test("constructs the plugin with its default remote caller", () => {
  const plugin = createUtiliaPlugin();
  assert.equal(plugin.name, "utilia");
  assert.equal(plugin.actions.length, 4);
});
