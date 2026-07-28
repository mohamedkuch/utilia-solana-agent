import { ExactEvmScheme } from "@x402/evm/exact/client";
import {
  decodePaymentResponseHeader,
  wrapFetchWithPayment,
  x402Client,
} from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import {
  BASE,
  FIXTURE_SOURCE,
  assertAllowedEndpoint,
  createQuotePolicy,
  fixtureOutput,
  requireBasePrivateKey,
} from "./policy.mjs";

const endpoint = assertAllowedEndpoint(BASE.httpUrl, BASE.httpUrl);
const account = privateKeyToAccount(requireBasePrivateKey());
const policy = createQuotePolicy({
  endpoint,
  expectedResource: endpoint.href,
  network: BASE.network,
  asset: BASE.asset,
  payTo: BASE.payTo,
});
const paymentClient = new x402Client()
  .register(BASE.network, new ExactEvmScheme(account))
  .onBeforePaymentCreation((context) => policy.beforeHttpPayment(context));
const paidFetch = wrapFetchWithPayment(fetch, paymentClient);

const response = await paidFetch(endpoint, {
  headers: {
    "user-agent": "utilia-buyer-fixture/1.0",
    "x-utilia-source": FIXTURE_SOURCE,
  },
});
if (!response.ok) {
  throw new Error(`Base HTTP paid retry failed with status ${response.status}`);
}
const encodedReceipt = response.headers.get("payment-response");
if (!encodedReceipt)
  throw new Error("Base HTTP result did not include PAYMENT-RESPONSE");
const receipt = decodePaymentResponseHeader(encodedReceipt);
if (!receipt.success)
  throw new Error("Base HTTP settlement receipt was unsuccessful");
if (policy.snapshot().approvals !== 1) {
  throw new Error("Base HTTP did not require exactly one approved paid retry");
}

console.log(
  JSON.stringify(
    fixtureOutput({
      paymentNetwork: BASE.network,
      transport: "http",
      policy,
      receipt,
      result: await response.json(),
    }),
    null,
    2,
  ),
);
