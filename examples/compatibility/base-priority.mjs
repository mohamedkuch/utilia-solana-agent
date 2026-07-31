#!/usr/bin/env node

import { ExactEvmScheme } from "@x402/evm/exact/client";
import {
  decodePaymentResponseHeader,
  wrapFetchWithPayment,
  x402Client,
} from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import {
  BASE_NETWORK,
  buildStableFailureArtifact,
  buildSuccessArtifact,
  createDeliveryEvidence,
  createEndpoint,
  createObservedFetch,
  createPaymentPolicy,
  parseArguments,
  requireBasePrivateKey,
  validateRequestId,
  validateSource,
} from "./lib.mjs";

const startedAt = new Date().toISOString();
let source;
let requestId;
let endpoint;
let policy;
let settlement;
let delivery;
let receiptId;
const lifecycle = {
  challengeReceivedAt: null,
  paymentSignedAt: null,
  paidRetryCompletedAt: null,
  settlementReceivedAt: null,
  requestCount: 0,
};

try {
  const args = parseArguments(process.argv.slice(2));
  source = validateSource(args.source);
  requestId = validateRequestId(args.requestId);
  endpoint = createEndpoint(source);
  const account = privateKeyToAccount(requireBasePrivateKey());
  policy = createPaymentPolicy({ expectedResource: endpoint.href });
  const paymentClient = new x402Client()
    .register(BASE_NETWORK, new ExactEvmScheme(account))
    .onBeforePaymentCreation(async (context) => policy.beforePayment(context))
    .onAfterPaymentCreation(async () => {
      lifecycle.paymentSignedAt = new Date().toISOString();
    })
    .onPaymentResponse(async (context) => {
      if (context.settleResponse) {
        settlement = context.settleResponse;
        lifecycle.settlementReceivedAt = new Date().toISOString();
      }
    });
  const observedFetch = createObservedFetch({
    fetchImpl: fetch,
    requestId,
    source,
    lifecycle,
    onResponse: async (observedResponse, requestNumber) => {
      if (requestNumber !== 2) return;
      const responseCopy = observedResponse.clone();
      const observedBytes = new Uint8Array(await responseCopy.arrayBuffer());
      const observedText = new globalThis.TextDecoder().decode(observedBytes);
      let observedJson = null;
      try {
        observedJson = JSON.parse(observedText);
      } catch {
        // Preserve exact bytes and decoded text when delivery is not JSON.
      }
      delivery = createDeliveryEvidence(
        observedResponse,
        observedBytes,
        observedJson,
      );
      receiptId = observedResponse.headers.get("x-utilia-receipt-id");
    },
  });
  const paidFetch = wrapFetchWithPayment(observedFetch, paymentClient);

  let response;
  try {
    response = await paidFetch(endpoint, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": "utilia-public-compatibility-fixture/1.0",
        "x-request-id": requestId,
        "x-utilia-source": source,
      },
    });
  } catch (error) {
    throw policy.snapshot().lastFailure || error;
  }

  const responseBodyBytes = new Uint8Array(await response.arrayBuffer());
  const responseBodyText = new globalThis.TextDecoder().decode(
    responseBodyBytes,
  );
  let responseJson;
  try {
    responseJson = JSON.parse(responseBodyText);
  } catch {
    responseJson = null;
  }
  delivery = createDeliveryEvidence(response, responseBodyBytes, responseJson);
  receiptId = response.headers.get("x-utilia-receipt-id");
  const encodedReceipt = response.headers.get("payment-response");
  if (encodedReceipt) {
    const decoded = decodePaymentResponseHeader(encodedReceipt);
    settlement ||= decoded;
    lifecycle.settlementReceivedAt ||= new Date().toISOString();
  }
  const requirement = policy.snapshot().selectedRequirement;
  const artifact = buildSuccessArtifact({
    source,
    requestId,
    endpoint,
    startedAt,
    completedAt: new Date().toISOString(),
    lifecycle,
    response,
    responseBodyBytes,
    responseJson,
    settlement,
    requirement,
    receiptId,
  });
  process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
} catch (error) {
  const artifact = buildStableFailureArtifact({
    error,
    source,
    requestId,
    endpoint,
    startedAt,
    completedAt: new Date().toISOString(),
    lifecycle:
      lifecycle.requestCount > 0 || lifecycle.paymentSignedAt
        ? lifecycle
        : null,
    requirement:
      policy?.snapshot().selectedRequirement ??
      policy?.snapshot().challengeRequirement ??
      null,
    settlement,
    delivery,
    receiptId,
  });
  process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
  process.exitCode = 1;
}
