import assert from "node:assert/strict";
import test from "node:test";
import {
  isAllowedPayment,
  SOLANA_MAINNET,
  SOLANA_USDC,
  UTILIA_PAY_TO,
} from "../src/policy.js";

const valid = {
  accepts: [
    {
      network: SOLANA_MAINNET,
      asset: SOLANA_USDC,
      payTo: UTILIA_PAY_TO,
      amount: "8000",
    },
  ],
};

test("accepts an exact bounded Utilia payment", () => {
  assert.equal(isAllowedPayment(valid), true);
});

for (const [name, field, value] of [
  ["receiver", "payTo", "attacker"],
  ["network", "network", "solana:devnet"],
  ["asset", "asset", "fake-usdc"],
  ["amount", "amount", "8001"],
]) {
  test(`rejects a mismatched ${name}`, () => {
    const changed = structuredClone(valid);
    changed.accepts[0][field] = value;
    assert.equal(isAllowedPayment(changed), false);
  });
}
