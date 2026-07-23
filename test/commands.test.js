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

test("rejects unknown commands", () => {
  assert.throws(() => parseCommand(["launch-token"]), /Unknown command/);
});
