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
  assert.throws(() => parseCommand(["watch-fees", "--every", "30s"]), /between 60 seconds/);
  assert.throws(() => parseCommand(["watch-fees", "--max-calls", "501"]), /cannot exceed 500/);
});

test("parses generic JSON tool calls", () => {
  assert.deepEqual(parseCommand(["call", "solana_token_analysis", '{"mint":"abc"}']), {
    type: "call",
    tool: "solana_token_analysis",
    args: { mint: "abc" },
  });
});

test("parses the PDF shortcut", () => {
  assert.deepEqual(parseCommand(["pdf", "https://example.com/file.pdf", "20"]), {
    type: "call",
    tool: TOOL_NAMES.pdf,
    args: { url: "https://example.com/file.pdf", maxPages: 20 },
  });
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
  assert.throws(() => parseCommand(["pdf", "https://example.com/file.pdf", "101"]), /maxPages/);
  assert.throws(
    () => parseCommand(["pdf-to-markdown", "https://example.com/file.pdf", "--max-pages"]),
    /requires a value/,
  );
});

test("rejects unknown commands", () => {
  assert.throws(() => parseCommand(["launch-token"]), /Unknown command/);
});
