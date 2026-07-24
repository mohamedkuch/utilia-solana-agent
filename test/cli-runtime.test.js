import assert from "node:assert/strict";
import test from "node:test";
import { formatCliError, HELP, runCli } from "../src/cli-runtime.js";
import { VERSION } from "../src/version.js";

function output() {
  const stdout = [];
  const stderr = [];
  return {
    stdout,
    stderr,
    streams: {
      stdout: { write: (value) => stdout.push(value) },
      stderr: { write: (value) => stderr.push(value) },
    },
  };
}

test("prints help and version", async () => {
  const out = output();
  await runCli(["help"], out.streams);
  await runCli(["--version"], out.streams);
  assert.equal(out.stdout[0], HELP);
  assert.equal(out.stdout[1], `${VERSION}\n`);
});

test("runs wallet and health diagnostics", async () => {
  const out = output();
  await assert.rejects(
    () =>
      runCli(["doctor"], {
        ...out.streams,
        env: {},
        hasWalletConfiguration: () => false,
      }),
    /Wallet is not configured/,
  );
  await assert.rejects(
    () =>
      runCli(["doctor"], {
        ...out.streams,
        env: { SOLANA_PRIVATE_KEY: "configured" },
        hasWalletConfiguration: () => true,
        loadWalletSigner: async () => ({ address: "wallet" }),
        fetch: async () => ({ ok: false, status: 503 }),
      }),
    /HTTP 503/,
  );

  await runCli(["doctor"], {
    ...out.streams,
    env: { SOLANA_PRIVATE_KEY: "configured" },
    hasWalletConfiguration: () => true,
    loadWalletSigner: async (env) => {
      assert.equal(env.SOLANA_PRIVATE_KEY, "configured");
      return { address: "wallet" };
    },
    fetch: async (url) => {
      assert.equal(url, "https://api.utilia.ink/healthz");
      return { ok: true, json: async () => ({ status: "ok" }) };
    },
  });
  assert.match(out.stdout.at(-1), /"status": "ready"/);
  assert.match(out.stdout.at(-1), /"maxUsdcPerCall": 0.01/);
});

test("starts the MCP bridge", async () => {
  let called = 0;
  await runCli(["mcp"], {
    runMcpBridge: async () => {
      called += 1;
    },
  });
  assert.equal(called, 1);
});

test("runs a bounded fee watcher and preserves JSON and text results", async () => {
  const out = output();
  const calls = [];
  let closeCalls = 0;
  await runCli([], {
    ...out.streams,
    parseCommand: () => ({
      type: "watch-fees",
      everySeconds: 0,
      maxCalls: 2,
      accounts: ["account"],
    }),
    connectUtilia: async (options) => {
      assert.equal(options.name, "utilia-priority-fee-watcher");
      return {
        async callTool(tool, args) {
          calls.push({ tool, args });
          return calls.length === 1
            ? {
                content: [{ type: "text", text: '{"medium":12}' }],
                paymentMade: true,
                paymentResponse: { transaction: "signature" },
              }
            : { content: [{ type: "text", text: "plain text" }], paymentMade: false };
        },
        async close() {
          closeCalls += 1;
          throw new Error("close failure is non-fatal");
        },
      };
    },
  });
  assert.equal(calls.length, 2);
  assert.equal(closeCalls, 1);
  assert.match(out.stderr[0], /maximum Utilia spend 0.004 USDC/);
  assert.deepEqual(JSON.parse(out.stdout[0]).data, { medium: 12 });
  assert.equal(JSON.parse(out.stdout[0]).transaction, "signature");
  assert.equal(JSON.parse(out.stdout[1]).data, "plain text");
  assert.equal(JSON.parse(out.stdout[1]).transaction, null);
});

test("closes the watcher after a failed call", async () => {
  let closed = false;
  await assert.rejects(
    () =>
      runCli([], {
        parseCommand: () => ({
          type: "watch-fees",
          everySeconds: 60,
          maxCalls: 1,
          accounts: [],
        }),
        stdout: { write() {} },
        stderr: { write() {} },
        connectUtilia: async () => ({
          async callTool() {
            throw new Error("remote failure");
          },
          async close() {
            closed = true;
          },
        }),
      }),
    /remote failure/,
  );
  assert.equal(closed, true);
});

test("reports a watcher result without text content", async () => {
  const out = output();
  await runCli([], {
    ...out.streams,
    parseCommand: () => ({
      type: "watch-fees",
      everySeconds: 60,
      maxCalls: 1,
      accounts: [],
    }),
    connectUtilia: async () => ({
      async callTool() {
        return { content: [{ type: "image" }] };
      },
      async close() {},
    }),
  });
  assert.equal(JSON.parse(out.stdout[0]).data, null);
});

test("saves audio and reports optional payment receipts", async () => {
  const out = output();
  await runCli(["audio", "https://example.com/audio.wav"], {
    ...out.streams,
    callUtiliaTool: async () => ({
      content: [{ type: "image" }, { type: "text", text: '{"audioBase64":"bXAz"}' }],
      paymentMade: true,
      paymentResponse: {},
    }),
    saveNormalizedAudio: async (text, path) => {
      assert.equal(text, '{"audioBase64":"bXAz"}');
      assert.equal(path, "normalized.mp3");
      return { outputPath: "/tmp/normalized.mp3" };
    },
  });
  assert.match(out.stdout[0], /normalized\.mp3/);
  assert.match(out.stderr[0], /receipt available/);

  await assert.rejects(
    () =>
      runCli(["audio", "https://example.com/audio.wav"], {
        ...out.streams,
        callUtiliaTool: async () => ({ content: [] }),
      }),
    /no audio result/,
  );
});

test("calls generic tools with text and structured fallback output", async () => {
  const out = output();
  let invocation = 0;
  const callUtiliaTool = async () => {
    invocation += 1;
    if (invocation === 1) {
      return {
        content: [{ type: "text", text: '{"ok":true}' }],
        paymentMade: true,
        paymentResponse: { transaction: "transaction" },
      };
    }
    if (invocation === 2) {
      return { content: [{ type: "image", data: "x" }], paymentMade: false };
    }
    return { content: [], paymentMade: true, paymentResponse: {} };
  };
  await runCli(["fees"], { ...out.streams, callUtiliaTool });
  await runCli(["fees"], { ...out.streams, callUtiliaTool });
  await runCli(["fees"], { ...out.streams, callUtiliaTool });
  assert.equal(out.stdout[0], '{"ok":true}\n');
  assert.match(out.stdout[1], /"image"/);
  assert.match(out.stderr[0], /transaction/);
  assert.match(out.stderr[1], /receipt available/);
});

test("formats Error and non-Error failures", () => {
  assert.equal(formatCliError(new Error("boom")), "utilia-solana-agent: boom\n");
  assert.equal(formatCliError("boom"), "utilia-solana-agent: boom\n");
});
