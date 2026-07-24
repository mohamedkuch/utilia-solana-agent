import assert from "node:assert/strict";
import { mock, test } from "node:test";

const servers = [];
const signals = new Map();
let connectFailure;
let closeFailure;
let remoteCloseFailure;
let remoteResult = {
  content: [{ type: "text", text: '{"ok":true}' }],
  paymentMade: false,
};

class FakeServer {
  constructor(identity, options) {
    this.identity = identity;
    this.options = options;
    this.tools = new Map();
    this.closeCalls = 0;
    servers.push(this);
  }

  registerTool(name, definition, handler) {
    this.tools.set(name, { definition, handler });
  }

  async connect(transport) {
    this.transport = transport;
    if (connectFailure) throw connectFailure;
  }

  async close() {
    this.closeCalls += 1;
    if (closeFailure) throw closeFailure;
  }
}

class FakeTransport {}

const remote = {
  calls: [],
  closeCalls: 0,
  async callTool(tool, args) {
    this.calls.push({ tool, args });
    return remoteResult;
  },
  async close() {
    this.closeCalls += 1;
    if (remoteCloseFailure) throw remoteCloseFailure;
  },
};

mock.module("@modelcontextprotocol/sdk/server/mcp.js", {
  namedExports: { McpServer: FakeServer },
});
mock.module("@modelcontextprotocol/sdk/server/stdio.js", {
  namedExports: { StdioServerTransport: FakeTransport },
});
mock.module(new URL("../src/remote.js", import.meta.url).href, {
  namedExports: {
    connectUtilia: async (options) => {
      assert.equal(options.name, "utilia-solana-agent-bridge");
      return remote;
    },
  },
});

const { runMcpBridge } = await import("../src/bridge.js");

test("registers and forwards all six paid tools", async (t) => {
  t.mock.method(process, "once", (signal, handler) => {
    signals.set(signal, handler);
    return process;
  });
  const stderr = [];
  t.mock.method(process.stderr, "write", (value) => {
    stderr.push(value);
    return true;
  });

  await runMcpBridge({ endpoint: "https://api.utilia.ink/mcp" });
  const server = servers.at(-1);
  assert.deepEqual([...server.tools.keys()], [
    "solana_transaction_analysis",
    "solana_transaction_simulate",
    "solana_priority_fees",
    "solana_token_analysis",
    "pdf_to_markdown",
    "normalize_audio",
  ]);
  assert.ok(server.transport instanceof FakeTransport);

  const fees = server.tools.get("solana_priority_fees");
  assert.equal(fees.definition.annotations.readOnlyHint, true);
  const result = await fees.handler({ accounts: [] });
  assert.deepEqual(result, { content: remoteResult.content });

  remoteResult = {
    content: [{ type: "text", text: '{"error":"failure"}' }],
    isError: true,
    paymentMade: true,
    paymentResponse: {},
  };
  const failed = await server.tools.get("normalize_audio").handler({ url: "https://example.com" });
  assert.deepEqual(failed, { content: remoteResult.content, isError: true });
  assert.match(stderr[0], /receipt available/);
});

test("closes local and remote servers when connection fails", async (t) => {
  t.mock.method(process, "once", () => process);
  connectFailure = new Error("transport failed");
  closeFailure = new Error("local close failed");
  remoteCloseFailure = new Error("remote close failed");
  await assert.rejects(() => runMcpBridge(), /transport failed/);
  const server = servers.at(-1);
  assert.equal(server.closeCalls, 1);
  assert.ok(remote.closeCalls > 0);
  connectFailure = undefined;
  closeFailure = undefined;
  remoteCloseFailure = undefined;
});

test("handles SIGINT and SIGTERM shutdown callbacks", async (t) => {
  signals.clear();
  t.mock.method(process, "once", (signal, handler) => {
    signals.set(signal, handler);
    return process;
  });
  const exits = [];
  t.mock.method(process, "exit", (code) => {
    exits.push(code);
  });
  await runMcpBridge();
  await signals.get("SIGINT")();
  await signals.get("SIGTERM")();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(exits, [0, 0]);
});
