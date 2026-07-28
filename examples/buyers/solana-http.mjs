import {
  decodePaymentResponseHeader,
  wrapFetchWithPayment,
  x402Client,
} from "@x402/fetch";
import { toClientSvmSigner } from "@x402/svm";
import { ExactSvmScheme } from "@x402/svm/exact/client";
import { loadWalletSigner } from "utilia-solana-agent";
import {
  FIXTURE_SOURCE,
  SOLANA,
  assertAllowedEndpoint,
  createQuotePolicy,
  fixtureOutput,
} from "./policy.mjs";

const endpoint = assertAllowedEndpoint(SOLANA.httpUrl, SOLANA.httpUrl);
const signer = await loadWalletSigner();
const policy = createQuotePolicy({
  endpoint,
  expectedResource: endpoint.href,
  network: SOLANA.network,
  asset: SOLANA.asset,
  payTo: SOLANA.payTo,
});
const paymentClient = new x402Client()
  .register(SOLANA.network, new ExactSvmScheme(toClientSvmSigner(signer)))
  .onBeforePaymentCreation((context) => policy.beforeHttpPayment(context));
const paidFetch = wrapFetchWithPayment(fetch, paymentClient);

const response = await paidFetch(endpoint, {
  headers: {
    "user-agent": "utilia-buyer-fixture/1.0",
    "x-utilia-source": FIXTURE_SOURCE,
  },
});
if (!response.ok) {
  throw new Error(
    `Solana HTTP paid retry failed with status ${response.status}`,
  );
}
const encodedReceipt = response.headers.get("payment-response");
if (!encodedReceipt)
  throw new Error("Solana HTTP result did not include PAYMENT-RESPONSE");
const receipt = decodePaymentResponseHeader(encodedReceipt);
if (!receipt.success)
  throw new Error("Solana HTTP settlement receipt was unsuccessful");
if (policy.snapshot().approvals !== 1) {
  throw new Error(
    "Solana HTTP did not require exactly one approved paid retry",
  );
}

console.log(
  JSON.stringify(
    fixtureOutput({
      paymentNetwork: SOLANA.network,
      transport: "http",
      policy,
      receipt,
      result: await response.json(),
    }),
    null,
    2,
  ),
);
