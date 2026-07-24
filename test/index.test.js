import assert from "node:assert/strict";
import test from "node:test";
import * as api from "../src/index.js";

test("exports the documented public API", () => {
  assert.deepEqual(Object.keys(api).sort(), [
    "MAX_ATOMIC_USDC",
    "SOLANA_MAINNET",
    "SOLANA_USDC",
    "UTILIA_MCP_URL",
    "UTILIA_PAY_TO",
    "callUtiliaTool",
    "connectUtilia",
    "createSolanaAgentKitSigner",
    "createUtiliaPlugin",
    "hasWalletConfiguration",
    "isAllowedPayment",
    "loadWalletSigner",
    "runMcpBridge",
  ]);
});
