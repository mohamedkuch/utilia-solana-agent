# Public Base x402 compatibility fixture

This fixture makes one bounded live call to Utilia's Base priority-fee endpoint,
records the x402 challenge and paid retry, and prints one JSON artifact to standard
output. It is an operator compatibility test, not evidence of customer demand.

Use a dedicated low-balance Base wallet holding no more than the funds needed for
the test. The client rejects any quote above 2,000 atomic USDC, exactly $0.002,
and permits only one payment attempt in the process.

## Run one compatibility call

```sh
BASE_PRIVATE_KEY=0xYOUR_32_BYTE_LOW_BALANCE_KEY npm run --silent compatibility:base -- --source your_runtime_fixture
```

`--source` is required and must be a non-secret attribution slug containing 1 to
64 bounded ASCII characters. Do not put credentials, wallet keys, personal data,
or private partner details in it. The fixture sends the slug as both
`X-Utilia-Source` and the `source` query parameter. It creates one
`X-Request-Id` and reuses it across the unpaid challenge and paid retry. To make a
reproducible partner artifact, callers may also supply a bounded identifier with
`--request-id`.

The JSON output captures timestamps, HTTP status, request ID, receipt ID when the
server provides one, payment network, asset, atomic amount, payer when provided,
receiver, settlement transaction, raw response text, parsed JSON, and response
body SHA-256 calculated over the exact raw response bytes. A Utilia receipt ID is
a correlation identifier. It is not an
authenticated signed receipt. Settlement evidence is the transaction reference
returned by the x402 settlement response.

The command exits nonzero with a JSON failure artifact for these stable classes:

- `excessive_quote`
- `unsupported_network`
- `payment_failure`
- `unsuccessful_delivery`
- `missing_settlement_reference`
- `result_hash_mismatch`
- `invalid_configuration`
- `invalid_source`

The fixture never prints the private key. Redirect standard output only if an
artifact should be saved:

```sh
BASE_PRIVATE_KEY=0xYOUR_32_BYTE_LOW_BALANCE_KEY npm run --silent compatibility:base -- --source your_runtime_fixture > artifact.json
npm run --silent compatibility:verify -- artifact.json
```

The verifier checks the bounded endpoint, source and request ID syntax, exact Base
network, official Base USDC, Utilia receiver, $0.002 maximum, one challenge plus
one paid retry, successful delivery, settlement transaction, and response digest.

Public artifacts:

- [JSON Schema](utilia-base-priority-fixture.schema.json)
- [Redacted example](example-artifact.redacted.json)
