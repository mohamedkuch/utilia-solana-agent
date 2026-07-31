import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import test from "node:test";
import {
  BASE_NETWORK,
  BASE_USDC,
  CompatibilityError,
  FAILURE_CLASSES,
  UTILIA_PAY_TO,
  buildFailureArtifact,
  buildStableFailureArtifact,
  buildSuccessArtifact,
  createDeliveryEvidence,
  createEndpoint,
  createObservedFetch,
  createPaymentPolicy,
  parseArguments,
  requireBasePrivateKey,
  sha256Bytes,
  validateRequestId,
  validateSource,
  verifyArtifact,
  verifySuccessArtifact,
} from "../examples/compatibility/lib.mjs";

const source = "test_runtime_fixture";
const requestId = "request_test_1234";
const endpoint = createEndpoint(source);

function challenge(overrides = {}) {
  return {
    x402Version: 2,
    resource: { url: endpoint.href },
    accepts: [
      {
        scheme: "exact",
        network: BASE_NETWORK,
        asset: BASE_USDC,
        payTo: UTILIA_PAY_TO,
        amount: "2000",
        maxTimeoutSeconds: 300,
        ...overrides,
      },
    ],
  };
}

function successArtifact(overrides = {}) {
  const bodyText = '{"priorityFeeEstimate":1500,"sampleCount":42}';
  const bodyBytes = new globalThis.TextEncoder().encode(bodyText);
  return buildSuccessArtifact({
    source,
    requestId,
    endpoint,
    startedAt: "2026-07-31T12:00:00.000Z",
    completedAt: "2026-07-31T12:00:02.000Z",
    lifecycle: {
      challengeReceivedAt: "2026-07-31T12:00:01.000Z",
      paymentSignedAt: "2026-07-31T12:00:01.250Z",
      paidRetryCompletedAt: "2026-07-31T12:00:02.000Z",
      settlementReceivedAt: "2026-07-31T12:00:02.000Z",
      requestCount: 2,
    },
    response: new globalThis.Response(bodyText, {
      status: 200,
      headers: { "content-type": "application/json" },
    }),
    responseBodyBytes: bodyBytes,
    responseJson: JSON.parse(bodyText),
    settlement: {
      success: true,
      network: BASE_NETWORK,
      amount: "2000",
      payer: "0xPayer",
      transaction: "0xSettlement",
    },
    requirement: challenge().accepts[0],
    receiptId: "receipt_123",
    ...overrides,
  });
}

function assertFailureClass(callback, expected) {
  assert.throws(callback, (error) => {
    assert.equal(error instanceof CompatibilityError, true);
    assert.equal(error.failureClass, expected);
    return true;
  });
}

test("compatibility arguments require a bounded caller source", () => {
  assert.deepEqual(
    parseArguments(["--source", source, "--request-id", requestId]),
    { source, requestId },
  );
  assert.equal(validateSource(source), source);
  assert.equal(validateRequestId(requestId), requestId);
  for (const value of [undefined, "", "bad source", "a".repeat(65)]) {
    assertFailureClass(
      () => validateSource(value),
      FAILURE_CLASSES.invalidSource,
    );
  }
  assertFailureClass(
    () => parseArguments(["--unknown"]),
    FAILURE_CLASSES.invalidConfiguration,
  );
});

test("private key validation is fail closed and returns no derived data", () => {
  const privateKey = `0x${"ab".repeat(32)}`;
  assert.equal(
    requireBasePrivateKey({ BASE_PRIVATE_KEY: privateKey }),
    privateKey,
  );
  for (const value of [undefined, "", `0x${"ab".repeat(31)}`, "secret"]) {
    assertFailureClass(
      () => requireBasePrivateKey({ BASE_PRIVATE_KEY: value }),
      FAILURE_CLASSES.invalidConfiguration,
    );
  }
});

test("payment policy approves exactly one $0.002 Base quote", () => {
  const policy = createPaymentPolicy({ expectedResource: endpoint.href });
  const paymentRequired = challenge();
  assert.equal(
    policy.beforePayment({
      paymentRequired,
      selectedRequirements: paymentRequired.accepts[0],
    }),
    undefined,
  );
  assert.equal(policy.snapshot().approvals, 1);
  assert.equal(policy.snapshot().selectedRequirement.amount, "2000");
  assert.deepEqual(
    policy.beforePayment({
      paymentRequired,
      selectedRequirements: paymentRequired.accepts[0],
    }),
    {
      abort: true,
      reason: "the one-payment process budget has already been reserved",
    },
  );
  assert.equal(
    policy.snapshot().lastFailure.failureClass,
    FAILURE_CLASSES.excessiveQuote,
  );
});

test("payment policy classifies excessive quote and unsupported network", () => {
  for (const [changes, expected] of [
    [{ amount: "2001" }, FAILURE_CLASSES.excessiveQuote],
    [{ network: "eip155:1" }, FAILURE_CLASSES.unsupportedNetwork],
  ]) {
    const policy = createPaymentPolicy({ expectedResource: endpoint.href });
    const paymentRequired = challenge(changes);
    const result = policy.beforePayment({
      paymentRequired,
      selectedRequirements: paymentRequired.accepts[0],
    });
    assert.equal(result.abort, true);
    assert.equal(policy.snapshot().lastFailure.failureClass, expected);
    assert.equal(policy.snapshot().approvals, 0);
  }
});

test("payment policy rejects changed resource, asset, receiver, and selection", () => {
  const cases = [
    { resource: { url: `${endpoint.href}&extra=1` } },
    { accepts: [challenge({ asset: "0xWrong" }).accepts[0]] },
    { accepts: [challenge({ payTo: "0xWrong" }).accepts[0]] },
  ];
  for (const change of cases) {
    const policy = createPaymentPolicy({ expectedResource: endpoint.href });
    const paymentRequired = { ...challenge(), ...change };
    assert.throws(() => policy.authorize(paymentRequired));
    assert.equal(
      policy.snapshot().lastFailure.failureClass,
      FAILURE_CLASSES.paymentFailure,
    );
  }

  const policy = createPaymentPolicy({ expectedResource: endpoint.href });
  assert.throws(() =>
    policy.authorize(challenge(), {
      ...challenge().accepts[0],
      amount: "1999",
    }),
  );
});

test("observed fetch enforces stable request headers and exactly two requests", async () => {
  const seen = [];
  const lifecycle = {};
  const timestamps = [
    new Date("2026-07-31T12:00:01.000Z"),
    new Date("2026-07-31T12:00:02.000Z"),
  ];
  const observedFetch = createObservedFetch({
    fetchImpl: async (request) => {
      seen.push({
        requestId: request.headers.get("x-request-id"),
        source: request.headers.get("x-utilia-source"),
      });
      return new globalThis.Response("{}", {
        status: seen.length === 1 ? 402 : 200,
      });
    },
    requestId,
    source,
    lifecycle,
    now: () => timestamps.shift(),
  });
  const init = {
    headers: {
      "x-request-id": requestId,
      "x-utilia-source": source,
    },
  };
  await observedFetch(endpoint, init);
  await observedFetch(endpoint, init);
  assert.deepEqual(seen, [
    { requestId, source },
    { requestId, source },
  ]);
  assert.deepEqual(lifecycle, {
    challengeReceivedAt: "2026-07-31T12:00:01.000Z",
    paidRetryCompletedAt: "2026-07-31T12:00:02.000Z",
    requestCount: 2,
  });
  await assert.rejects(
    observedFetch(endpoint, init),
    /more than one paid retry/,
  );
});

test("observed fetch rejects changed request ID or source", async () => {
  for (const headers of [
    { "x-request-id": "request_changed", "x-utilia-source": source },
    { "x-request-id": requestId, "x-utilia-source": "changed_source" },
  ]) {
    const observedFetch = createObservedFetch({
      fetchImpl: async () => new globalThis.Response("{}", { status: 402 }),
      requestId,
      source,
      lifecycle: {},
    });
    await assert.rejects(observedFetch(endpoint, { headers }), /changed/);
  }
});

test("success artifact captures settlement, receipt correlation, and body digest", () => {
  const artifact = successArtifact();
  assert.equal(artifact.payment.amountAtomic, "2000");
  assert.equal(artifact.payment.receiptId, "receipt_123");
  assert.equal(artifact.payment.settlementTransaction, "0xSettlement");
  assert.equal(
    artifact.receiptIdSemantics,
    "correlation_identifier_not_an_authenticated_signed_receipt",
  );
  assert.equal(
    artifact.delivery.bodySha256,
    sha256Bytes(Buffer.from(artifact.delivery.bodyBase64, "base64")),
  );
  assert.deepEqual(verifySuccessArtifact(artifact), {
    valid: true,
    status: "success",
    requestId,
    receiptId: "receipt_123",
    settlementTransaction: "0xSettlement",
    bodySha256: artifact.delivery.bodySha256,
  });
});

test("artifact verifier exposes required failure classes", () => {
  const hashMismatch = successArtifact();
  hashMismatch.delivery.bodyBase64 = Buffer.from("tampered").toString("base64");
  assertFailureClass(
    () => verifySuccessArtifact(hashMismatch),
    FAILURE_CLASSES.resultHashMismatch,
  );

  const missingSettlement = successArtifact();
  missingSettlement.payment.settlementTransaction = "";
  assertFailureClass(
    () => verifySuccessArtifact(missingSettlement),
    FAILURE_CLASSES.missingSettlementReference,
  );

  const unsuccessful = successArtifact();
  unsuccessful.delivery.httpStatus = 500;
  assertFailureClass(
    () => verifySuccessArtifact(unsuccessful),
    FAILURE_CLASSES.unsuccessfulDelivery,
  );
});

test("artifact hashes exact invalid UTF-8 response bytes", () => {
  const rawBytes = Uint8Array.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xc3, 0x28]);
  const artifact = successArtifact({
    response: new globalThis.Response(rawBytes, {
      status: 200,
      headers: { "content-type": "application/octet-stream" },
    }),
    responseBodyBytes: rawBytes,
    responseJson: null,
  });
  assert.equal(artifact.delivery.bodySha256, sha256Bytes(rawBytes));
  assert.notEqual(
    artifact.delivery.bodySha256,
    sha256Bytes(
      new globalThis.TextEncoder().encode(artifact.delivery.bodyText),
    ),
  );
  assert.deepEqual(
    Uint8Array.from(Buffer.from(artifact.delivery.bodyBase64, "base64")),
    rawBytes,
  );
  assert.equal(verifyArtifact(artifact).valid, true);
});

test("schema validation rejects extra fields, invalid types, and success failures", () => {
  const cases = [
    { mutate: (artifact) => (artifact.secretExtension = "do-not-accept") },
    {
      mutate: (artifact) =>
        (artifact.payment.secretExtension = "do-not-accept"),
    },
    { mutate: (artifact) => (artifact.delivery.bodyBase64 = 42) },
    {
      mutate: (artifact) =>
        (artifact.failure = {
          class: FAILURE_CLASSES.paymentFailure,
          message: "must be null on success",
        }),
    },
  ];
  for (const { mutate } of cases) {
    const artifact = successArtifact();
    mutate(artifact);
    assertFailureClass(
      () => verifyArtifact(artifact),
      FAILURE_CLASSES.invalidConfiguration,
    );
  }
});

test("verifier rejects out-of-order timestamps after schema validation", () => {
  const artifact = successArtifact();
  artifact.lifecycle.paymentSignedAt = "2026-07-31T11:59:59.000Z";
  assertFailureClass(
    () => verifyArtifact(artifact),
    FAILURE_CLASSES.invalidConfiguration,
  );
});

function stagedLifecycle(overrides = {}) {
  return {
    challengeReceivedAt: "2026-07-31T12:00:00.500Z",
    paymentSignedAt: null,
    paidRetryCompletedAt: null,
    settlementReceivedAt: null,
    requestCount: 1,
    ...overrides,
  };
}

function failureArtifact(overrides = {}) {
  return buildFailureArtifact({
    error: new CompatibilityError(
      FAILURE_CLASSES.paymentFailure,
      "fixture failure",
    ),
    source,
    requestId,
    endpoint,
    startedAt: "2026-07-31T12:00:00.000Z",
    completedAt: "2026-07-31T12:00:03.000Z",
    ...overrides,
  });
}

test("failure artifact preserves challenge and signed-retry evidence", () => {
  const challenged = failureArtifact({
    error: new CompatibilityError(
      FAILURE_CLASSES.excessiveQuote,
      "quote too high",
    ),
    lifecycle: stagedLifecycle(),
    requirement: challenge({ amount: "2001" }).accepts[0],
  });
  assert.equal(challenged.lifecycle.requestCount, 1);
  assert.equal(challenged.payment.status, "quote_received");
  assert.equal(challenged.payment.amountAtomic, "2001");
  assert.equal(verifyArtifact(challenged).status, "failure");

  const signed = failureArtifact({
    lifecycle: stagedLifecycle({
      paymentSignedAt: "2026-07-31T12:00:01.000Z",
    }),
    requirement: challenge().accepts[0],
  });
  assert.equal(signed.payment.status, "signed");
  assert.equal(signed.lifecycle.paymentSignedAt, "2026-07-31T12:00:01.000Z");
  assert.equal(verifyArtifact(signed).valid, true);
});

test("failure artifact preserves settlement and unsuccessful-delivery evidence", () => {
  const lifecycle = stagedLifecycle({
    paymentSignedAt: "2026-07-31T12:00:01.000Z",
    paidRetryCompletedAt: "2026-07-31T12:00:02.000Z",
    settlementReceivedAt: "2026-07-31T12:00:02.250Z",
    requestCount: 2,
  });
  const failedResponse = new globalThis.Response("gateway failure", {
    status: 502,
    headers: { "content-type": "text/plain" },
  });
  const rawBytes = new globalThis.TextEncoder().encode("gateway failure");
  const delivery = createDeliveryEvidence(failedResponse, rawBytes, null);
  const artifact = failureArtifact({
    error: new CompatibilityError(
      FAILURE_CLASSES.unsuccessfulDelivery,
      "paid delivery returned HTTP 502",
    ),
    lifecycle,
    requirement: challenge().accepts[0],
    settlement: {
      success: false,
      network: BASE_NETWORK,
      amount: "2000",
      payer: `0x${"12".repeat(20)}`,
      transaction: `0x${"ab".repeat(32)}`,
    },
    delivery,
    receiptId: "receipt_failed_123",
  });
  assert.equal(artifact.payment.status, "failed");
  assert.equal(artifact.payment.settlementTransaction, `0x${"ab".repeat(32)}`);
  assert.equal(artifact.delivery.status, "failed");
  assert.equal(artifact.delivery.httpStatus, 502);
  assert.equal(artifact.delivery.bodySha256, sha256Bytes(rawBytes));
  assert.equal(verifyArtifact(artifact).valid, true);
});

test("failure serialization normalizes malformed quote evidence", () => {
  const malformedRequirements = [
    challenge({ amount: "not-an-integer" }).accepts[0],
    challenge({ amount: "0" }).accepts[0],
    challenge({ network: { chain: 8453 } }).accepts[0],
    challenge({ payTo: "private-looking-untrusted-value" }).accepts[0],
  ];
  for (const requirement of malformedRequirements) {
    const artifact = failureArtifact({
      lifecycle: stagedLifecycle(),
      requirement,
    });
    assert.equal(verifyArtifact(artifact).valid, true);
    if (requirement.amount === "0" || requirement.amount === "not-an-integer") {
      assert.equal(artifact.payment.amountAtomic, null);
    }
    if (typeof requirement.network === "object") {
      assert.equal(artifact.payment.network, null);
    }
    if (requirement.payTo === "private-looking-untrusted-value") {
      assert.equal(artifact.payment.payTo, null);
      assert.doesNotMatch(
        JSON.stringify(artifact),
        /private-looking-untrusted-value/,
      );
    }
  }
});

test("failure serialization normalizes invalid settlement fields", () => {
  const artifact = failureArtifact({
    lifecycle: stagedLifecycle({
      paymentSignedAt: "2026-07-31T12:00:01.000Z",
      settlementReceivedAt: "2026-07-31T12:00:02.000Z",
      requestCount: 2,
    }),
    requirement: challenge().accepts[0],
    settlement: {
      success: false,
      network: { chain: 8453 },
      amount: 0,
      payer: { address: "untrusted" },
      transaction: ["untrusted"],
    },
    receiptId: { secret: "untrusted" },
  });
  assert.equal(artifact.payment.status, "failed");
  assert.equal(artifact.payment.network, BASE_NETWORK);
  assert.equal(artifact.payment.amountAtomic, "2000");
  assert.equal(artifact.payment.payer, null);
  assert.equal(artifact.payment.settlementTransaction, null);
  assert.equal(artifact.payment.receiptId, null);
  assert.equal(verifyArtifact(artifact).valid, true);
  assert.doesNotMatch(JSON.stringify(artifact), /untrusted/);
});

test("stable outer fallback survives forced artifact-construction failure", () => {
  const artifact = buildStableFailureArtifact(
    {
      startedAt: "2026-07-31T12:00:00.000Z",
      completedAt: "2026-07-31T12:00:01.000Z",
    },
    () => {
      throw new Error("forced construction failure with untrusted data");
    },
  );
  assert.equal(artifact.failure.class, FAILURE_CLASSES.invalidConfiguration);
  assert.equal(
    artifact.failure.message,
    "failure artifact construction failed",
  );
  assert.doesNotMatch(JSON.stringify(artifact), /untrusted/);
  assert.equal(verifyArtifact(artifact).valid, true);
});

test("redacted example artifact passes the public verifier", async () => {
  const example = JSON.parse(
    await readFile(
      new URL(
        "../examples/compatibility/example-artifact.redacted.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.equal(verifySuccessArtifact(example).valid, true);
});

test("public schema declares all stable failure classes", async () => {
  const schemaText = await readFile(
    new URL(
      "../examples/compatibility/utilia-base-priority-fixture.schema.json",
      import.meta.url,
    ),
    "utf8",
  );
  for (const failureClass of Object.values(FAILURE_CLASSES)) {
    assert.match(schemaText, new RegExp(`"${failureClass}"`));
  }
});

test("CLI fails safely as JSON before network access when the key is absent", async () => {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["examples/compatibility/base-priority.mjs", "--source", source],
      {
        cwd: new URL("..", import.meta.url),
        env: { ...process.env, BASE_PRIVATE_KEY: "" },
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
  assert.equal(result.code, 1);
  assert.equal(result.stderr, "");
  const artifact = JSON.parse(result.stdout);
  assert.equal(artifact.status, "failure");
  assert.equal(artifact.failure.class, FAILURE_CLASSES.invalidConfiguration);
  assert.doesNotMatch(result.stdout, /BASE_PRIVATE_KEY=0x/);
});
