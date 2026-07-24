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
  assert.throws(() => parseCommand(["pdf", "https://example.com/file.pdf", "101"]), /maxPages/);
});

test("rejects unknown commands", () => {
  assert.throws(() => parseCommand(["launch-token"]), /Unknown command/);
});
