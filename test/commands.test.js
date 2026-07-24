import assert from "node:assert/strict";
import test from "node:test";
import { parseCommand, TOOL_NAMES } from "../src/commands.js";

test("parses the fee shortcut", () => {
  assert.deepEqual(parseCommand(["fees", "one,two"]), {
    type: "call",
    tool: TOOL_NAMES.fees,
    args: { accounts: ["one", "two"] },
  });
});

test("parses a budget-capped priority fee watcher", () => {
  assert.deepEqual(
    parseCommand([
      "watch-fees",
      "--every",
      "12m",
      "--max-calls",
      "25",
      "--accounts",
      "one,two",
    ]),
    {
      type: "watch-fees",
      everySeconds: 720,
      maxCalls: 25,
      accounts: ["one", "two"],
    },
  );
  assert.deepEqual(parseCommand(["watch-fees"]), {
    type: "watch-fees",
    everySeconds: 720,
    maxCalls: 25,
    accounts: [],
  });
  assert.throws(
    () => parseCommand(["watch-fees", "--every", "30s"]),
    /between 60 seconds/,
  );
  assert.throws(
    () => parseCommand(["watch-fees", "--max-calls", "501"]),
    /cannot exceed 500/,
  );
});

test("parses generic JSON tool calls", () => {
  assert.deepEqual(
    parseCommand(["call", "solana_token_analysis", '{"mint":"abc"}']),
    {
      type: "call",
      tool: "solana_token_analysis",
      args: { mint: "abc" },
    },
  );
});

test("parses the PDF shortcut", () => {
  assert.deepEqual(
    parseCommand(["pdf", "https://example.com/file.pdf", "20"]),
    {
      type: "call",
      tool: TOOL_NAMES.pdf,
      args: { url: "https://example.com/file.pdf", maxPages: 20 },
    },
  );
  assert.deepEqual(
    parseCommand([
      "pdf-to-markdown",
      "https://example.com/file.pdf",
      "--max-pages",
      "20",
    ]),
    {
      type: "call",
      tool: TOOL_NAMES.pdf,
      args: { url: "https://example.com/file.pdf", maxPages: 20 },
    },
  );
  assert.throws(
    () => parseCommand(["pdf", "https://example.com/file.pdf", "101"]),
    /maxPages/,
  );
  assert.throws(
    () =>
      parseCommand([
        "pdf-to-markdown",
        "https://example.com/file.pdf",
        "--max-pages",
      ]),
    /requires a value/,
  );
});

test("parses the audio normalization shortcut", () => {
  assert.deepEqual(
    parseCommand([
      "audio-normalize",
      "https://example.com/voice.wav",
      "--output",
      "voice-normalized.mp3",
      "--target-lufs",
      "-18",
      "--max-seconds",
      "90",
    ]),
    {
      type: "audio",
      tool: TOOL_NAMES.audio,
      args: {
        url: "https://example.com/voice.wav",
        targetLufs: -18,
        maxSeconds: 90,
      },
      output: "voice-normalized.mp3",
    },
  );
  assert.deepEqual(parseCommand(["audio", "https://example.com/voice.wav"]), {
    type: "audio",
    tool: TOOL_NAMES.audio,
    args: {
      url: "https://example.com/voice.wav",
      targetLufs: -16,
      maxSeconds: 180,
    },
    output: "normalized.mp3",
  });
  assert.throws(
    () =>
      parseCommand([
        "audio",
        "https://example.com/voice.wav",
        "--target-lufs",
        "-30",
      ]),
    /-24 to -12/,
  );
  assert.throws(
    () =>
      parseCommand([
        "audio",
        "https://example.com/voice.wav",
        "--max-seconds",
        "181",
      ]),
    /1 to 180/,
  );
});

test("rejects unknown commands", () => {
  assert.throws(() => parseCommand(["launch-token"]), /Unknown command/);
});

test("parses help, version, MCP, doctor, and direct tool shortcuts", () => {
  for (const value of [[], ["help"], ["--help"], ["-h"]]) {
    assert.deepEqual(parseCommand(value), { type: "help" });
  }
  assert.deepEqual(parseCommand(["--version"]), { type: "version" });
  assert.deepEqual(parseCommand(["-v"]), { type: "version" });
  assert.deepEqual(parseCommand(["mcp"]), { type: "mcp" });
  assert.deepEqual(parseCommand(["doctor"]), { type: "doctor" });
  assert.deepEqual(parseCommand(["fees"]), {
    type: "call",
    tool: TOOL_NAMES.fees,
    args: { accounts: [] },
  });
  assert.deepEqual(parseCommand(["transaction", "signature"]), {
    type: "call",
    tool: TOOL_NAMES.transaction,
    args: { signature: "signature" },
  });
  assert.deepEqual(parseCommand(["simulate", "transaction", "base58"]), {
    type: "call",
    tool: TOOL_NAMES.simulate,
    args: {
      transaction: "transaction",
      encoding: "base58",
      accountAddresses: [],
    },
  });
  assert.deepEqual(parseCommand(["simulate", "transaction"]), {
    type: "call",
    tool: TOOL_NAMES.simulate,
    args: {
      transaction: "transaction",
      encoding: "base64",
      accountAddresses: [],
    },
  });
  assert.deepEqual(parseCommand(["token", "mint"]), {
    type: "call",
    tool: TOOL_NAMES.token,
    args: { mint: "mint" },
  });
  assert.deepEqual(parseCommand(["call", "tool"]), {
    type: "call",
    tool: "tool",
    args: {},
  });
});

test("rejects missing direct-tool arguments and malformed JSON", () => {
  assert.throws(
    () => parseCommand(["transaction"]),
    /requires a Solana signature/,
  );
  assert.throws(
    () => parseCommand(["simulate"]),
    /requires a serialized transaction/,
  );
  assert.throws(() => parseCommand(["token"]), /requires an SPL mint/);
  assert.throws(() => parseCommand(["call"]), /requires a remote tool name/);
  assert.throws(() => parseCommand(["call", "tool", "{"]), /valid JSON/);
});

test("validates every watch-fees option", () => {
  assert.deepEqual(parseCommand(["watch-fees", "--every", "1h"]), {
    type: "watch-fees",
    everySeconds: 3_600,
    maxCalls: 25,
    accounts: [],
  });
  assert.deepEqual(parseCommand(["watch-fees", "--every", "60"]), {
    type: "watch-fees",
    everySeconds: 60,
    maxCalls: 25,
    accounts: [],
  });
  assert.throws(
    () => parseCommand(["watch-fees", "--every"]),
    /requires a value/,
  );
  assert.throws(
    () => parseCommand(["watch-fees", "--every", "soon"]),
    /must look like/,
  );
  assert.throws(
    () => parseCommand(["watch-fees", "--every", "0m"]),
    /positive integer/,
  );
  assert.throws(
    () => parseCommand(["watch-fees", "--every", "25h"]),
    /between 60 seconds/,
  );
  assert.throws(
    () => parseCommand(["watch-fees", "--max-calls", "1.5"]),
    /positive integer/,
  );
  assert.throws(
    () =>
      parseCommand([
        "watch-fees",
        "--accounts",
        Array.from({ length: 21 }, (_, index) => `a${index}`).join(","),
      ]),
    /cannot exceed 20/,
  );
  assert.throws(
    () => parseCommand(["watch-fees", "--unknown", "value"]),
    /Unknown/,
  );
});

test("validates PDF shortcut shape and bounds", () => {
  assert.deepEqual(parseCommand(["pdf", "https://example.com/file.pdf"]), {
    type: "call",
    tool: TOOL_NAMES.pdf,
    args: { url: "https://example.com/file.pdf", maxPages: 50 },
  });
  assert.throws(() => parseCommand(["pdf"]), /requires a public HTTPS PDF URL/);
  assert.throws(
    () => parseCommand(["pdf", "https://example.com/file.pdf", "20", "extra"]),
    /URL and optional maxPages/,
  );
  assert.throws(
    () =>
      parseCommand([
        "pdf",
        "https://example.com/file.pdf",
        "--max-pages",
        "20",
        "extra",
      ]),
    /optional --max-pages/,
  );
  assert.throws(
    () => parseCommand(["pdf", "https://example.com/file.pdf", "1.5"]),
    /integer/,
  );
});

test("validates audio shortcut shape and bounds", () => {
  assert.throws(
    () => parseCommand(["audio"]),
    /requires a public HTTPS audio URL/,
  );
  assert.throws(
    () => parseCommand(["audio", "https://example.com/audio.wav", "--output"]),
    /requires a value/,
  );
  assert.throws(
    () =>
      parseCommand([
        "audio",
        "https://example.com/audio.wav",
        "--target-lufs",
        "not-a-number",
      ]),
    /-24 to -12/,
  );
  assert.throws(
    () =>
      parseCommand([
        "audio",
        "https://example.com/audio.wav",
        "--max-seconds",
        "1.5",
      ]),
    /1 to 180/,
  );
  assert.throws(
    () =>
      parseCommand([
        "audio",
        "https://example.com/audio.wav",
        "--unknown",
        "value",
      ]),
    /Unknown audio option/,
  );
});
