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
      amount: "10000",
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
  ["amount", "amount", "10001"],
]) {
  test(`rejects a mismatched ${name}`, () => {
    const changed = structuredClone(valid);
    changed.accepts[0][field] = value;
    assert.equal(isAllowedPayment(changed), false);
  });
}

test("rejects missing and malformed payment requirements", () => {
  assert.equal(isAllowedPayment(undefined), false);
  assert.equal(isAllowedPayment({}), false);
  assert.equal(isAllowedPayment({ accepts: [] }), false);
  for (const amount of ["0", "-1", "1.5", "not-a-number", String(Number.MAX_SAFE_INTEGER + 1)]) {
    const changed = structuredClone(valid);
    changed.accepts[0].amount = amount;
    assert.equal(isAllowedPayment(changed), false);
  }
});

test("accepts a later matching requirement", () => {
  const changed = structuredClone(valid);
  changed.accepts.unshift({ ...changed.accepts[0], payTo: "wrong" });
  assert.equal(isAllowedPayment(changed), true);
});
