import Ajv2020Module from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";

export const SCHEMA_VERSION = "1.0.0";
export const ENDPOINT_ORIGIN = "https://api.utilia.ink";
export const ENDPOINT_PATH = "/base/v1/fees/priority";
export const BASE_NETWORK = "eip155:8453";
export const BASE_USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const UTILIA_PAY_TO = "0xBf9305e6eE38E92C296Aa3Fb0a844977307520fA";
export const MAX_PAYMENT_ATOMIC = 2_000n;
export const MAX_TIMEOUT_SECONDS = 300;

export const FAILURE_CLASSES = Object.freeze({
  excessiveQuote: "excessive_quote",
  unsupportedNetwork: "unsupported_network",
  paymentFailure: "payment_failure",
  unsuccessfulDelivery: "unsuccessful_delivery",
  missingSettlementReference: "missing_settlement_reference",
  resultHashMismatch: "result_hash_mismatch",
  invalidConfiguration: "invalid_configuration",
  invalidSource: "invalid_source",
});

const artifactSchema = JSON.parse(
  readFileSync(
    new URL("./utilia-base-priority-fixture.schema.json", import.meta.url),
    "utf8",
  ),
);
const Ajv2020 = /** @type {any} */ (Ajv2020Module);
const addFormats = /** @type {any} */ (addFormatsModule);
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateSchema = ajv.compile(artifactSchema);

export class CompatibilityError extends Error {
  /**
   * @param {string} failureClass
   * @param {string} message
   * @param {unknown} [cause]
   */
  constructor(failureClass, message, cause) {
    super(message, cause ? { cause } : undefined);
    this.name = "CompatibilityError";
    this.failureClass = failureClass;
  }
}

/**
 * @param {string[]} argv
 * @returns {{source?: string, requestId?: string}}
 */
export function parseArguments(argv) {
  /** @type {{source?: string, requestId?: string}} */
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--source") {
      result.source = argv[index + 1];
      index += 1;
      continue;
    }
    if (value === "--request-id") {
      result.requestId = argv[index + 1];
      index += 1;
      continue;
    }
    throw new CompatibilityError(
      FAILURE_CLASSES.invalidConfiguration,
      `unknown argument: ${value}`,
    );
  }
  return result;
}

/** @param {unknown} value */
export function validateSource(value) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(value)
  ) {
    throw new CompatibilityError(
      FAILURE_CLASSES.invalidSource,
      "--source must be a non-secret attribution slug using 1 to 64 ASCII letters, digits, periods, underscores, colons, or hyphens",
    );
  }
  return value;
}

/** @param {unknown} [value] */
export function validateRequestId(value = randomUUID()) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(value)
  ) {
    throw new CompatibilityError(
      FAILURE_CLASSES.invalidConfiguration,
      "request ID must be 8 to 128 bounded ASCII characters",
    );
  }
  return value;
}

/** @param {unknown} source */
export function createEndpoint(source) {
  const endpoint = new URL(ENDPOINT_PATH, ENDPOINT_ORIGIN);
  endpoint.searchParams.set("source", validateSource(source));
  return endpoint;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {`0x${string}`}
 */
export function requireBasePrivateKey(env = process.env) {
  const value = env.BASE_PRIVATE_KEY;
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new CompatibilityError(
      FAILURE_CLASSES.invalidConfiguration,
      "set BASE_PRIVATE_KEY to a 0x-prefixed 32-byte low-balance automation-wallet key",
    );
  }
  return /** @type {`0x${string}`} */ (value);
}

/** @param {unknown} value */
function parseAtomicAmount(value) {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    throw new CompatibilityError(
      FAILURE_CLASSES.paymentFailure,
      "quote amount must be a positive integer string",
    );
  }
  return BigInt(value);
}

/** @param {unknown} requirement */
function paymentRequirementEvidence(requirement) {
  if (!requirement || typeof requirement !== "object") return null;
  try {
    const value = /** @type {Record<string, unknown>} */ (requirement);
    return {
      network: safeNetwork(value.network),
      asset: safeAddress(value.asset),
      amountAtomic: safeAtomicAmount(value.amount),
      payTo: safeAddress(value.payTo),
    };
  } catch {
    return null;
  }
}

/** @param {unknown} requirement */
function normalizeRequirementEvidence(requirement) {
  if (
    requirement &&
    typeof requirement === "object" &&
    "amountAtomic" in requirement
  ) {
    try {
      const value = /** @type {Record<string, unknown>} */ (requirement);
      return {
        network: safeNetwork(value.network),
        asset: safeAddress(value.asset),
        amountAtomic: safeAtomicAmount(value.amountAtomic),
        payTo: safeAddress(value.payTo),
      };
    } catch {
      return null;
    }
  }
  return paymentRequirementEvidence(requirement);
}

/** @param {unknown} value */
function safeNetwork(value) {
  return typeof value === "string" && /^[A-Za-z0-9:._-]{1,128}$/.test(value)
    ? value
    : null;
}

/** @param {unknown} value */
function safeAddress(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)
    ? value
    : null;
}

/** @param {unknown} value */
function safeAtomicAmount(value) {
  return typeof value === "string" && /^[1-9][0-9]{0,39}$/.test(value)
    ? value
    : null;
}

/** @param {unknown} value */
function safeTransaction(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value)
    ? value
    : null;
}

/** @param {unknown} value */
function safeReceiptId(value) {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value)
    ? value
    : null;
}

/** @param {unknown} value */
function safeFailureMessage(value) {
  if (typeof value !== "string") return "compatibility fixture failed";
  const normalized = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 31 || codePoint === 127 ? " " : character;
  })
    .join("")
    .trim();
  return normalized.slice(0, 512) || "compatibility fixture failed";
}

/** @param {unknown} value */
function safeTimestamp(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? new Date(value).toISOString()
    : null;
}

/** @param {unknown} value */
function normalizeLifecycle(value) {
  if (!value || typeof value !== "object") return null;
  try {
    const lifecycle = /** @type {Record<string, unknown>} */ (value);
    const requestCount =
      Number.isInteger(lifecycle.requestCount) &&
      Number(lifecycle.requestCount) >= 0 &&
      Number(lifecycle.requestCount) <= 2
        ? Number(lifecycle.requestCount)
        : 0;
    return {
      challengeReceivedAt: safeTimestamp(lifecycle.challengeReceivedAt),
      paymentSignedAt: safeTimestamp(lifecycle.paymentSignedAt),
      paidRetryCompletedAt: safeTimestamp(lifecycle.paidRetryCompletedAt),
      settlementReceivedAt: safeTimestamp(lifecycle.settlementReceivedAt),
      requestCount,
    };
  } catch {
    return null;
  }
}

/** @param {unknown} value */
function normalizeSettlementEvidence(value) {
  if (!value || typeof value !== "object") return null;
  try {
    const settlement = /** @type {Record<string, unknown>} */ (value);
    return {
      success:
        typeof settlement.success === "boolean" ? settlement.success : null,
      network: safeNetwork(settlement.network),
      amountAtomic: safeAtomicAmount(settlement.amount),
      payer: safeAddress(settlement.payer),
      transaction: safeTransaction(settlement.transaction),
    };
  } catch {
    return null;
  }
}

/** @param {unknown} value */
function normalizeDeliveryEvidence(value) {
  if (!value || typeof value !== "object") return null;
  try {
    const delivery = /** @type {Record<string, unknown>} */ (value);
    if (
      !["received", "delivered", "failed"].includes(
        /** @type {string} */ (delivery.status),
      ) ||
      !Number.isInteger(delivery.httpStatus) ||
      Number(delivery.httpStatus) < 100 ||
      Number(delivery.httpStatus) > 599 ||
      typeof delivery.bodySha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(delivery.bodySha256) ||
      typeof delivery.bodyBase64 !== "string" ||
      typeof delivery.bodyText !== "string" ||
      delivery.bodyText.length > 1_000_000
    ) {
      return null;
    }
    decodeBase64(delivery.bodyBase64);
    const json = JSON.parse(JSON.stringify(delivery.json ?? null));
    return {
      status: delivery.status,
      httpStatus: Number(delivery.httpStatus),
      contentType:
        typeof delivery.contentType === "string" &&
        delivery.contentType.length <= 256
          ? delivery.contentType
          : null,
      bodySha256: delivery.bodySha256,
      bodyBase64: delivery.bodyBase64,
      bodyText: delivery.bodyText,
      json,
    };
  } catch {
    return null;
  }
}

/** @param {{expectedResource?: string}} [options] */
export function createPaymentPolicy(options = {}) {
  const { expectedResource } = options;
  if (typeof expectedResource !== "string") {
    throw new CompatibilityError(
      FAILURE_CLASSES.invalidConfiguration,
      "expectedResource is required",
    );
  }
  let approvals = 0;
  /** @type {Record<string, unknown> | undefined} */
  let selectedRequirement;
  /** @type {ReturnType<typeof paymentRequirementEvidence>} */
  let challengeRequirement = null;
  /** @type {CompatibilityError | undefined} */
  let lastFailure;

  /** @param {string} failureClass @param {string} message */
  function fail(failureClass, message) {
    const error = new CompatibilityError(failureClass, message);
    lastFailure = error;
    throw error;
  }

  /** @param {any} paymentRequired @param {any} [selected] */
  function authorize(paymentRequired, selected) {
    try {
      if (paymentRequired?.x402Version !== 2) {
        fail(FAILURE_CLASSES.paymentFailure, "only x402 v2 is supported");
      }
      if (paymentRequired.resource?.url !== expectedResource) {
        fail(
          FAILURE_CLASSES.paymentFailure,
          "challenge resource does not match the bounded Utilia endpoint",
        );
      }
      if (
        !Array.isArray(paymentRequired.accepts) ||
        paymentRequired.accepts.length !== 1
      ) {
        fail(
          FAILURE_CLASSES.paymentFailure,
          "the fixture requires exactly one payment option",
        );
      }

      const requirement = paymentRequired.accepts[0];
      challengeRequirement = paymentRequirementEvidence(requirement);
      if (requirement.network !== BASE_NETWORK) {
        fail(
          FAILURE_CLASSES.unsupportedNetwork,
          `unsupported payment network: ${String(requirement.network)}`,
        );
      }
      if (
        requirement.scheme !== "exact" ||
        requirement.asset !== BASE_USDC ||
        requirement.payTo !== UTILIA_PAY_TO
      ) {
        fail(
          FAILURE_CLASSES.paymentFailure,
          "quote failed the scheme, asset, or receiver policy",
        );
      }
      if (
        !Number.isInteger(requirement.maxTimeoutSeconds) ||
        requirement.maxTimeoutSeconds <= 0 ||
        requirement.maxTimeoutSeconds > MAX_TIMEOUT_SECONDS
      ) {
        fail(
          FAILURE_CLASSES.paymentFailure,
          "quote timeout exceeds the 300-second policy",
        );
      }

      const amount = parseAtomicAmount(requirement.amount);
      if (amount > MAX_PAYMENT_ATOMIC) {
        fail(
          FAILURE_CLASSES.excessiveQuote,
          `quote exceeds ${MAX_PAYMENT_ATOMIC.toString()} atomic USDC`,
        );
      }
      if (approvals !== 0) {
        fail(
          FAILURE_CLASSES.excessiveQuote,
          "the one-payment process budget has already been reserved",
        );
      }
      if (
        selected &&
        ["scheme", "network", "amount", "asset", "payTo"].some(
          (field) => selected[field] !== requirement[field],
        )
      ) {
        fail(
          FAILURE_CLASSES.paymentFailure,
          "selected payment requirement changed after policy evaluation",
        );
      }

      approvals += 1;
      selectedRequirement = Object.freeze({ ...requirement });
      return requirement;
    } catch (error) {
      if (error instanceof CompatibilityError) throw error;
      fail(FAILURE_CLASSES.paymentFailure, "malformed payment challenge");
    }
  }

  return {
    /** @param {any} context */
    beforePayment({ paymentRequired, selectedRequirements }) {
      try {
        authorize(paymentRequired, selectedRequirements);
        return undefined;
      } catch (error) {
        return {
          abort: /** @type {const} */ (true),
          reason: error instanceof Error ? error.message : "payment denied",
        };
      }
    },
    authorize,
    snapshot() {
      return {
        approvals,
        maxPaymentAtomic: MAX_PAYMENT_ATOMIC.toString(),
        selectedRequirement,
        challengeRequirement,
        lastFailure,
      };
    },
  };
}

/**
 * @param {{
 *  fetchImpl: typeof globalThis.fetch,
 *  requestId: string,
 *  source: string,
 *  lifecycle: Record<string, any>,
 *  now?: () => Date,
 *  onResponse?: (response: Response, requestNumber: number) => void | Promise<void>
 * }} options
 */
export function createObservedFetch({
  fetchImpl,
  requestId,
  source,
  lifecycle,
  now = () => new Date(),
  onResponse,
}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function");
  }
  let requests = 0;

  /** @type {typeof globalThis.fetch} */
  return async (input, init) => {
    const request = new globalThis.Request(input, init);
    if (request.headers.get("x-request-id") !== requestId) {
      throw new CompatibilityError(
        FAILURE_CLASSES.paymentFailure,
        "X-Request-Id changed between challenge and paid retry",
      );
    }
    if (request.headers.get("x-utilia-source") !== source) {
      throw new CompatibilityError(
        FAILURE_CLASSES.paymentFailure,
        "X-Utilia-Source changed between challenge and paid retry",
      );
    }
    requests += 1;
    if (requests > 2) {
      throw new CompatibilityError(
        FAILURE_CLASSES.paymentFailure,
        "more than one paid retry was attempted",
      );
    }

    const response = await fetchImpl(request);
    const timestamp = now().toISOString();
    if (response.status === 402 && requests === 1) {
      lifecycle.challengeReceivedAt = timestamp;
    } else if (requests === 2) {
      lifecycle.paidRetryCompletedAt = timestamp;
    }
    lifecycle.requestCount = requests;
    if (onResponse) await onResponse(response, requests);
    return response;
  };
}

/** @param {ArrayBuffer | ArrayBufferView} value */
function toBytes(value) {
  return value instanceof ArrayBuffer
    ? new Uint8Array(value)
    : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}

/** @param {ArrayBuffer | ArrayBufferView} value */
export function sha256Bytes(value) {
  return createHash("sha256").update(toBytes(value)).digest("hex");
}

/** @param {Uint8Array} value */
function encodeBase64(value) {
  return Buffer.from(value).toString("base64");
}

/** @param {unknown} value */
function decodeBase64(value) {
  if (
    typeof value !== "string" ||
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    throw new CompatibilityError(
      FAILURE_CLASSES.invalidConfiguration,
      "delivery.bodyBase64 is not canonical base64",
    );
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.toString("base64") !== value) {
    throw new CompatibilityError(
      FAILURE_CLASSES.invalidConfiguration,
      "delivery.bodyBase64 is not canonical base64",
    );
  }
  return bytes;
}

/** @param {unknown} value */
function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** @param {any} response @param {Uint8Array} responseBodyBytes @param {unknown} responseJson */
export function createDeliveryEvidence(
  response,
  responseBodyBytes,
  responseJson,
) {
  const bodyText = new globalThis.TextDecoder().decode(responseBodyBytes);
  return {
    status: response.ok ? "received" : "failed",
    httpStatus: response.status,
    contentType: response.headers.get("content-type"),
    bodySha256: sha256Bytes(responseBodyBytes),
    bodyBase64: encodeBase64(responseBodyBytes),
    bodyText,
    json: responseJson,
  };
}

/** @param {any} options */
export function buildSuccessArtifact({
  source,
  requestId,
  endpoint,
  startedAt,
  completedAt,
  lifecycle,
  response,
  responseBodyBytes,
  responseJson,
  settlement,
  requirement,
  receiptId,
}) {
  if (!response.ok) {
    throw new CompatibilityError(
      response.status === 402
        ? FAILURE_CLASSES.paymentFailure
        : FAILURE_CLASSES.unsuccessfulDelivery,
      `paid delivery returned HTTP ${response.status}`,
    );
  }
  if (!settlement?.success) {
    throw new CompatibilityError(
      FAILURE_CLASSES.paymentFailure,
      settlement?.errorMessage || "payment settlement was not successful",
    );
  }
  if (settlement.network !== BASE_NETWORK) {
    throw new CompatibilityError(
      FAILURE_CLASSES.unsupportedNetwork,
      `settlement used unsupported network: ${String(settlement.network)}`,
    );
  }
  const settlementTransaction = nonEmptyString(settlement.transaction);
  if (!settlementTransaction) {
    throw new CompatibilityError(
      FAILURE_CLASSES.missingSettlementReference,
      "successful settlement did not include a transaction reference",
    );
  }
  if (!requirement || typeof requirement !== "object") {
    throw new CompatibilityError(
      FAILURE_CLASSES.paymentFailure,
      "successful response did not retain the approved payment requirement",
    );
  }

  const delivery = createDeliveryEvidence(
    response,
    responseBodyBytes,
    responseJson,
  );
  delivery.status = "delivered";
  const artifact = {
    schemaVersion: SCHEMA_VERSION,
    classification: "operator_compatibility_test_not_customer_demand",
    receiptIdSemantics:
      "correlation_identifier_not_an_authenticated_signed_receipt",
    status: "success",
    failure: null,
    request: {
      method: "GET",
      url: endpoint.href,
      source,
      requestId,
      startedAt,
      completedAt,
    },
    lifecycle,
    payment: {
      status: "settled",
      network: settlement.network,
      asset: requirement.asset,
      amountAtomic: settlement.amount || requirement.amount,
      payer: nonEmptyString(settlement.payer),
      payTo: requirement.payTo,
      settlementTransaction,
      receiptId: nonEmptyString(receiptId),
    },
    delivery,
  };
  verifyArtifact(artifact);
  return artifact;
}

/** @param {any} options */
export function buildFailureArtifact({
  error,
  source,
  requestId,
  endpoint,
  startedAt,
  completedAt,
  lifecycle = null,
  requirement = null,
  settlement = null,
  delivery = null,
  receiptId = null,
}) {
  const normalized =
    error instanceof CompatibilityError
      ? error
      : new CompatibilityError(
          FAILURE_CLASSES.paymentFailure,
          error instanceof Error ? error.message : "unknown payment failure",
          error,
        );
  const lifecycleEvidence = normalizeLifecycle(lifecycle);
  const requirementEvidence = normalizeRequirementEvidence(requirement);
  const settlementEvidence = normalizeSettlementEvidence(settlement);
  const deliveryEvidence = normalizeDeliveryEvidence(delivery);
  const hasPaymentEvidence = Boolean(requirementEvidence || settlementEvidence);
  const paymentStatus = settlementEvidence
    ? settlementEvidence.success
      ? "settled"
      : "failed"
    : lifecycleEvidence?.paymentSignedAt
      ? "signed"
      : requirementEvidence
        ? "quote_received"
        : null;
  const artifact = {
    schemaVersion: SCHEMA_VERSION,
    classification: "operator_compatibility_test_not_customer_demand",
    receiptIdSemantics:
      "correlation_identifier_not_an_authenticated_signed_receipt",
    status: "failure",
    failure: {
      class: normalized.failureClass,
      message: safeFailureMessage(normalized.message),
    },
    request: {
      method: "GET",
      url: endpoint?.href ?? null,
      source: source ?? null,
      requestId: requestId ?? null,
      startedAt,
      completedAt,
    },
    lifecycle: lifecycleEvidence,
    payment: hasPaymentEvidence
      ? {
          status: paymentStatus,
          network:
            settlementEvidence?.network ?? requirementEvidence?.network ?? null,
          asset: requirementEvidence?.asset ?? null,
          amountAtomic:
            settlementEvidence?.amountAtomic ??
            requirementEvidence?.amountAtomic ??
            null,
          payer: settlementEvidence?.payer ?? null,
          payTo: requirementEvidence?.payTo ?? null,
          settlementTransaction: settlementEvidence?.transaction ?? null,
          receiptId: safeReceiptId(receiptId),
        }
      : null,
    delivery: deliveryEvidence,
  };
  validateArtifactSchema(artifact);
  validateTimestampOrdering(artifact);
  return artifact;
}

/**
 * @param {any} options
 * @param {(options: any) => any} [primaryBuilder]
 */
export function buildStableFailureArtifact(
  options,
  primaryBuilder = buildFailureArtifact,
) {
  try {
    return primaryBuilder(options);
  } catch {
    const startedAt =
      safeTimestamp(options?.startedAt) ?? new Date(0).toISOString();
    const requestedCompletedAt =
      safeTimestamp(options?.completedAt) ?? startedAt;
    const completedAt =
      Date.parse(requestedCompletedAt) >= Date.parse(startedAt)
        ? requestedCompletedAt
        : startedAt;
    return {
      schemaVersion: SCHEMA_VERSION,
      classification: "operator_compatibility_test_not_customer_demand",
      receiptIdSemantics:
        "correlation_identifier_not_an_authenticated_signed_receipt",
      status: "failure",
      failure: {
        class: FAILURE_CLASSES.invalidConfiguration,
        message: "failure artifact construction failed",
      },
      request: {
        method: "GET",
        url: null,
        source: null,
        requestId: null,
        startedAt,
        completedAt,
      },
      lifecycle: null,
      payment: null,
      delivery: null,
    };
  }
}

/** @param {unknown} value */
export function validateArtifactSchema(value) {
  if (!validateSchema(value)) {
    const details = (validateSchema.errors ?? [])
      .map((error) => `${error.instancePath || "/"} ${error.message}`)
      .join("; ");
    throw new CompatibilityError(
      FAILURE_CLASSES.invalidConfiguration,
      `artifact failed JSON Schema validation: ${details}`,
    );
  }
  return value;
}

/** @param {string} value @param {string} name */
function timestampMillis(value, name) {
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    throw new CompatibilityError(
      FAILURE_CLASSES.invalidConfiguration,
      `${name} is not a valid timestamp`,
    );
  }
  return timestamp;
}

/** @param {any} artifact */
function validateTimestampOrdering(artifact) {
  const points = [
    ["request.startedAt", artifact.request.startedAt],
    ["lifecycle.challengeReceivedAt", artifact.lifecycle?.challengeReceivedAt],
    ["lifecycle.paymentSignedAt", artifact.lifecycle?.paymentSignedAt],
    [
      "lifecycle.paidRetryCompletedAt",
      artifact.lifecycle?.paidRetryCompletedAt,
    ],
    [
      "lifecycle.settlementReceivedAt",
      artifact.lifecycle?.settlementReceivedAt,
    ],
    ["request.completedAt", artifact.request.completedAt],
  ].filter((entry) => entry[1] !== null && entry[1] !== undefined);
  let previous = -Infinity;
  for (const [name, value] of points) {
    const current = timestampMillis(value, name);
    if (current < previous) {
      throw new CompatibilityError(
        FAILURE_CLASSES.invalidConfiguration,
        `artifact timestamps are out of order at ${name}`,
      );
    }
    previous = current;
  }
}

/** @param {any} delivery */
function verifyDeliveryEvidence(delivery) {
  const rawBytes = decodeBase64(delivery.bodyBase64);
  const actualHash = sha256Bytes(rawBytes);
  if (actualHash !== delivery.bodySha256) {
    throw new CompatibilityError(
      FAILURE_CLASSES.resultHashMismatch,
      `raw body SHA-256 mismatch: expected ${delivery.bodySha256}, got ${actualHash}`,
    );
  }
  const decodedText = new globalThis.TextDecoder().decode(rawBytes);
  if (decodedText !== delivery.bodyText) {
    throw new CompatibilityError(
      FAILURE_CLASSES.resultHashMismatch,
      "decoded body text does not match the hashed raw response bytes",
    );
  }
  let parsedBody = null;
  try {
    parsedBody = JSON.parse(decodedText);
  } catch {
    // A non-JSON response remains verifiable through the exact raw bytes.
  }
  if (!isDeepStrictEqual(parsedBody, delivery.json)) {
    throw new CompatibilityError(
      FAILURE_CLASSES.resultHashMismatch,
      "parsed result does not match the hashed raw response bytes",
    );
  }
  return actualHash;
}

/** @param {unknown} value */
export function verifyArtifact(value) {
  validateArtifactSchema(value);
  const artifact = /** @type {any} */ (value);
  validateTimestampOrdering(artifact);
  if (artifact.status === "failure") {
    if (artifact.request.source !== null) {
      validateSource(artifact.request.source);
    }
    if (artifact.request.requestId !== null) {
      validateRequestId(artifact.request.requestId);
    }
    if (
      artifact.request.url !== null &&
      artifact.request.source !== null &&
      artifact.request.url !== createEndpoint(artifact.request.source).href
    ) {
      throw new CompatibilityError(
        FAILURE_CLASSES.invalidConfiguration,
        "failure artifact request is not the bounded Utilia Base endpoint",
      );
    }
    if (artifact.delivery) verifyDeliveryEvidence(artifact.delivery);
    return {
      valid: true,
      status: "failure",
      failureClass: artifact.failure.class,
      requestId: artifact.request.requestId,
    };
  }

  validateSource(artifact.request.source);
  validateRequestId(artifact.request.requestId);
  const endpoint = createEndpoint(artifact.request.source);
  if (
    artifact.request.method !== "GET" ||
    artifact.request.url !== endpoint.href
  ) {
    throw new CompatibilityError(
      FAILURE_CLASSES.invalidConfiguration,
      "artifact request is not the bounded Utilia Base endpoint",
    );
  }
  if (artifact.lifecycle.requestCount !== 2) {
    throw new CompatibilityError(
      FAILURE_CLASSES.paymentFailure,
      "artifact must record one challenge and one paid retry",
    );
  }
  if (artifact.payment.status !== "settled") {
    throw new CompatibilityError(
      FAILURE_CLASSES.paymentFailure,
      `artifact payment status is ${String(artifact.payment.status)}`,
    );
  }
  if (artifact.payment.network !== BASE_NETWORK) {
    throw new CompatibilityError(
      FAILURE_CLASSES.unsupportedNetwork,
      `artifact payment network is ${String(artifact.payment.network)}`,
    );
  }
  if (
    artifact.payment.asset !== BASE_USDC ||
    artifact.payment.payTo !== UTILIA_PAY_TO
  ) {
    throw new CompatibilityError(
      FAILURE_CLASSES.paymentFailure,
      "artifact asset or receiver does not match policy",
    );
  }
  const amount = parseAtomicAmount(artifact.payment.amountAtomic);
  if (amount > MAX_PAYMENT_ATOMIC) {
    throw new CompatibilityError(
      FAILURE_CLASSES.excessiveQuote,
      "artifact amount exceeds the $0.002 maximum",
    );
  }
  if (!nonEmptyString(artifact.payment.settlementTransaction)) {
    throw new CompatibilityError(
      FAILURE_CLASSES.missingSettlementReference,
      "artifact lacks a settlement transaction",
    );
  }
  if (
    artifact.delivery.status !== "delivered" ||
    artifact.delivery.httpStatus < 200 ||
    artifact.delivery.httpStatus >= 300
  ) {
    throw new CompatibilityError(
      FAILURE_CLASSES.unsuccessfulDelivery,
      "artifact does not record successful delivery",
    );
  }
  const actualHash = verifyDeliveryEvidence(artifact.delivery);
  return {
    valid: true,
    status: "success",
    requestId: artifact.request.requestId,
    receiptId: artifact.payment.receiptId,
    settlementTransaction: artifact.payment.settlementTransaction,
    bodySha256: actualHash,
  };
}

/** @param {unknown} value */
export function verifySuccessArtifact(value) {
  const result = verifyArtifact(value);
  if (result.status !== "success") {
    throw new CompatibilityError(
      FAILURE_CLASSES.invalidConfiguration,
      "expected a success artifact",
    );
  }
  return result;
}
