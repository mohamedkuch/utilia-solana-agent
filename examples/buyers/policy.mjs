export const FIXTURE_SOURCE = "buyer_fixture_operator_test";
export const API_ORIGIN = "https://api.utilia.ink";
export const TOOL = "solana_priority_fees";
export const TOOL_RESOURCE = `mcp://tool/${TOOL}`;
export const MAX_TIMEOUT_SECONDS = 300;
export const MAX_PER_CALL_ATOMIC = 2_000n;
export const TOTAL_BUDGET_ATOMIC = 2_000n;

export const BASE = Object.freeze({
  network: "eip155:8453",
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  payTo: "0xBf9305e6eE38E92C296Aa3Fb0a844977307520fA",
  mcpUrl: `${API_ORIGIN}/base/mcp?source=${FIXTURE_SOURCE}`,
  httpUrl: `${API_ORIGIN}/base/v1/fees/priority?source=${FIXTURE_SOURCE}`,
});

export const SOLANA = Object.freeze({
  network: "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp",
  asset: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  payTo: "AX1TzKChcrgjVW2JMtcYFLgxerfH1XfW7etuSdMSUKh5",
  mcpUrl: `${API_ORIGIN}/mcp?source=${FIXTURE_SOURCE}`,
  httpUrl: `${API_ORIGIN}/v1/fees/priority?source=${FIXTURE_SOURCE}`,
});

function parseAtomicAmount(value) {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error("quote amount must be a positive integer string");
  }
  return BigInt(value);
}

function requirementMatches(left, right) {
  return [
    "scheme",
    "network",
    "amount",
    "asset",
    "payTo",
    "maxTimeoutSeconds",
  ].every((field) => left?.[field] === right?.[field]);
}

export function assertAllowedEndpoint(value, expected) {
  const endpoint = new URL(value);
  const allowed = new URL(expected);
  if (
    endpoint.protocol !== "https:" ||
    endpoint.username ||
    endpoint.password ||
    endpoint.hash ||
    endpoint.href !== allowed.href
  ) {
    throw new Error(`endpoint is not the allowlisted URL: ${allowed.href}`);
  }
  return endpoint;
}

export function requireBasePrivateKey(env = process.env) {
  const value = env.BASE_PRIVATE_KEY;
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error(
      "Set BASE_PRIVATE_KEY to a 0x-prefixed 32-byte automation-wallet key",
    );
  }
  return value;
}

export function createQuotePolicy({
  endpoint,
  expectedResource,
  tool,
  network,
  asset,
  payTo,
  maxPerCallAtomic = MAX_PER_CALL_ATOMIC,
  totalBudgetAtomic = TOTAL_BUDGET_ATOMIC,
}) {
  assertAllowedEndpoint(endpoint, endpoint);
  let reservedAtomic = 0n;
  let approvals = 0;

  function authorize(paymentRequired, selectedRequirements) {
    if (paymentRequired?.x402Version !== 2) {
      throw new Error("only x402 v2 is allowed");
    }
    if (paymentRequired.resource?.url !== expectedResource) {
      throw new Error("payment resource did not match the requested operation");
    }
    if (
      !Array.isArray(paymentRequired.accepts) ||
      paymentRequired.accepts.length !== 1
    ) {
      throw new Error("the fixture requires exactly one payment option");
    }

    const requirement = paymentRequired.accepts[0];
    if (
      selectedRequirements &&
      !requirementMatches(requirement, selectedRequirements)
    ) {
      throw new Error(
        "the selected payment requirement changed after policy evaluation",
      );
    }
    if (
      requirement.scheme !== "exact" ||
      requirement.network !== network ||
      requirement.asset !== asset ||
      requirement.payTo !== payTo
    ) {
      throw new Error(
        "payment requirement failed the network, asset, or receiver policy",
      );
    }
    if (
      !Number.isInteger(requirement.maxTimeoutSeconds) ||
      requirement.maxTimeoutSeconds <= 0 ||
      requirement.maxTimeoutSeconds > MAX_TIMEOUT_SECONDS
    ) {
      throw new Error("quote timeout exceeds the local expiry policy");
    }

    const amount = parseAtomicAmount(requirement.amount);
    if (amount > maxPerCallAtomic) {
      throw new Error("quote exceeds the per-call budget");
    }
    if (reservedAtomic + amount > totalBudgetAtomic) {
      throw new Error("quote exceeds the total fixture budget");
    }

    reservedAtomic += amount;
    approvals += 1;
    return requirement;
  }

  return {
    approveMcp({ toolName, paymentRequired }) {
      if (toolName !== tool) return false;
      try {
        authorize(paymentRequired);
        return true;
      } catch {
        return false;
      }
    },
    beforeHttpPayment({ paymentRequired, selectedRequirements }) {
      try {
        authorize(paymentRequired, selectedRequirements);
        return undefined;
      } catch {
        return { abort: true, reason: "local buyer policy denied the quote" };
      }
    },
    authorize,
    snapshot() {
      return {
        approvals,
        reservedAtomic: reservedAtomic.toString(),
        totalBudgetAtomic: totalBudgetAtomic.toString(),
      };
    },
  };
}

export function fixtureOutput({
  paymentNetwork,
  transport,
  result,
  receipt,
  policy,
}) {
  return {
    classification: "operator_compatibility_test_not_customer_demand",
    flow: "challenge -> policy -> sign exact quote -> retry -> result -> receipt",
    paymentNetwork,
    dataNetwork: "solana-mainnet",
    transport,
    tool: TOOL,
    policy: policy.snapshot(),
    receipt,
    result,
  };
}
