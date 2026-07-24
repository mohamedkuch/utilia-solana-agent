import assert from "node:assert/strict";
import { test } from "node:test";
import {
  callUtiliaTool,
  connectUtilia,
  createEndpoint,
  createTransport,
  createUtiliaClient,
  resolveSigner,
} from "../src/remote.js";

function createFakeClient(options = {}) {
  return {
    connectCalls: [],
    callCalls: [],
    closeCalls: 0,
    async connect(transport) {
      this.connectCalls.push(transport);
      if (options.connectFailure) throw options.connectFailure;
    },
    async callTool(tool, args) {
      this.callCalls.push({ tool, args });
      if (options.callFailure) throw options.callFailure;
      return { content: [{ type: "text", text: '{"ok":true}' }] };
    },
    async close() {
      this.closeCalls += 1;
      if (options.closeFailure) throw options.closeFailure;
    },
  };
}

test("builds canonical and caller-sourced MCP endpoints", () => {
  const generated = createEndpoint({});
  assert.equal(generated.origin + generated.pathname, "https://api.utilia.ink/mcp");
  assert.match(generated.searchParams.get("source"), /^npm-client-/);

  const existing = createEndpoint({
    env: { UTILIA_MCP_URL: "https://example.com/mcp?source=existing" },
    source: "ignored",
  });
  assert.equal(existing.searchParams.get("source"), "existing");
});

test("resolves explicit and loaded signers", async () => {
  const signer = { address: "explicit" };
  assert.equal(await resolveSigner({ signer }), signer);
  const env = { SOLANA_PRIVATE_KEY: "configured" };
  assert.deepEqual(
    await resolveSigner({ env }, async (received) => {
      assert.equal(received, env);
      return { address: "loaded" };
    }),
    { address: "loaded" },
  );
  await assert.rejects(() => resolveSigner({ env: {} }), /Set SOLANA_KEYPAIR_PATH/);
});

test("constructs the guarded x402 client and HTTP transport", () => {
  let configuration;
  const signer = { address: "wallet" };
  const client = createUtiliaClient(signer, { name: "custom" }, (value) => {
    configuration = value;
    return { configured: true };
  });
  assert.deepEqual(client, { configured: true });
  assert.equal(configuration.name, "custom");
  assert.equal(configuration.autoPayment, true);
  assert.equal(
    configuration.onPaymentRequested({
      paymentRequired: {
        accepts: [
          {
            network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
            asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            payTo: "AX1TzKChcrgjVW2JMtcYFLgxerfH1XfW7etuSdMSUKh5",
            amount: "2000",
          },
        ],
      },
    }),
    true,
  );

  const realClient = createUtiliaClient(signer);
  assert.equal(typeof realClient.connect, "function");
  const fakeTransport = createTransport(new URL("https://example.com"), (url) => ({ url }));
  assert.equal(fakeTransport.url.hostname, "example.com");
  const realTransport = createTransport(new URL("https://api.utilia.ink/mcp"));
  assert.equal(typeof realTransport.start, "function");
});

test("connects with injected network adapters", async () => {
  const client = createFakeClient();
  const transport = { kind: "transport" };
  const result = await connectUtilia(
    {
      signer: { address: "wallet" },
      endpoint: "https://api.utilia.ink/mcp",
      source: "test",
    },
    {
      createClient: (configuration) => {
        assert.equal(configuration.name, "utilia-solana-agent");
        return client;
      },
      createTransport: (endpoint) => {
        assert.equal(endpoint.searchParams.get("source"), "test");
        return transport;
      },
    },
  );
  assert.equal(result, client);
  assert.equal(client.connectCalls[0], transport);
});

test("closes a client after a connection failure", async () => {
  const client = createFakeClient({
    connectFailure: new Error("connect failed"),
    closeFailure: new Error("close failed"),
  });
  await assert.rejects(
    () =>
      connectUtilia(
        { signer: { address: "wallet" } },
        {
          createClient: () => client,
          createTransport: () => ({}),
        },
      ),
    /connect failed/,
  );
  assert.equal(client.closeCalls, 1);
});

test("calls and always closes a remote tool client", async () => {
  const successful = createFakeClient();
  const result = await callUtiliaTool("solana_priority_fees", { accounts: [] }, {}, {
    connectUtilia: async () => successful,
  });
  assert.deepEqual(result, { content: [{ type: "text", text: '{"ok":true}' }] });
  assert.equal(successful.closeCalls, 1);

  const failing = createFakeClient({
    callFailure: new Error("call failed"),
    closeFailure: new Error("close failed"),
  });
  await assert.rejects(
    () =>
      callUtiliaTool("solana_priority_fees", {}, {}, {
        connectUtilia: async () => failing,
      }),
    /call failed/,
  );
  assert.equal(failing.closeCalls, 1);
});

test("uses the default connection path with injected transport adapters", async () => {
  const client = createFakeClient();
  const result = await callUtiliaTool(
    "solana_priority_fees",
    { accounts: [] },
    { signer: { address: "wallet" } },
    {
      createClient: () => client,
      createTransport: () => ({}),
    },
  );
  assert.deepEqual(result, { content: [{ type: "text", text: '{"ok":true}' }] });
  assert.equal(client.connectCalls.length, 1);
  assert.equal(client.closeCalls, 1);
});
