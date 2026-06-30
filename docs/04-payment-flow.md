# Payment Flow

Both flows run through pipelines of small single-purpose pipes, the same semantics as the Laravel package.

## Payment handler and pipeline (POST /payment)

1. **Validation.** `amount` must be at least 0.01, `items` must be present, every line total must equal quantity times unit price in minor units, and the amount must equal the sum of line totals. Failures return HTTP 422 with Laravel-style error keys such as `items.0.total_price`.
2. **Duplicate guard.** A body carrying a `merchantRef` and `merchantSession` that already exist is redirected instead of reprocessed.
3. **PaymentContextResolver.** Reads the configured idempotency key, reserves `sisp_payment_intents`, and reuses the existing transaction when the same checkout is posted again.
4. **EnsureIpIsNotBlacklisted.** Rejects blacklisted IPs with HTTP 403.
5. **EnforceRateLimits.** DB-backed per-IP window, HTTP 429 when exceeded.
6. **BuildPaymentRequest.** Fills refs, session, and timestamp from the generators, signs the request fingerprint, and builds the base64 `purchaseRequest` when `is3DSec` is `'1'` (missing customer data throws `MissingThreeDSecureDataError`).
7. **PersistTransaction.** Inside one DB transaction: pending transaction row, first transaction attempt, customer data, and items with prices in cents. Identifier collisions are retried with a new signed request.
8. **Invoice stub.** Created after the core transaction write. Invoice failures never break the payment.
9. **CaptureRequestMetadata.** IP, user agent, device type, browser, OS, device fingerprint, and a redacted copy of the request.

The handler responds with an auto-submitting HTML form. Its action is the driver's payment endpoint with `FingerPrint`, `TimeStamp`, and `FingerPrintVersion` repeated on the query string, exactly as SISP expects.

For a SPA that talks to the backend with `fetch`, post to `/payment/intent` instead. It runs the same pipeline but returns the gateway target as JSON `{ action, fields, ref }`; the frontend then builds the form and submits it full-page. The HTML `/payment` route cannot be consumed over `fetch` (the returned markup will not navigate and its inline script will not run). See [Adapters](06-adapters.md#payment-versus-paymentintent).

When the same idempotency key is posted again, the handler does not create a second transaction. It either renders the stored payment request, or creates a new attempt on the same failed transaction when retry is allowed.

## Callback pipeline (POST /callback)

A `UserCancelled` post resolves the transaction by `merchantRef` plus `merchantSession`, cancels it, and emits `transaction:cancelled` before redirecting to `redirectUrl`; unknown or already-terminal transactions just redirect. Payloads missing ref or session redirect to `redirectUrl`. Replays (the matching attempt already has a gateway `transaction_id`) redirect without reprocessing. Then:

1. **ResolveTransaction** by `merchantRef` plus `merchantSession` against `sisp_transaction_attempts`. Legacy rows without attempts are backfilled under a row lock.
2. **ValidateFingerprint.** Constant-time comparison of the 16-field callback fingerprint. A mismatch marks the transaction failed with `invalid_callback_fingerprint`, emits `payment:failed`, and short-circuits.
3. **EnsureCallbackMatchesTransaction.** Ref, session, amount (compared in thousandths), currency, transaction code, and posID must match the stored transaction, otherwise `callback_details_mismatch`.
4. **ApplyTransactionStatus.** Updates the attempt and, when propagation is allowed, the parent transaction inside one database transaction. Message types `8`, `P`, `M`, `A`, `B`, `C`, and `10` complete the payment; the SISP error codes fail it; anything else stays pending.
5. **DispatchPaymentEvents.** Emits `payment:completed`, `payment:failed`, or `payment:pending`.

After the pipeline the handler stores request metadata and updates the invoice status. Both run quietly: nothing after completion may break the callback response.

## Result page (GET /callback?ref=)

Returns render-ready JSON: transaction summary with `formatted_amount`, structured error data (code, category, suggested action, labels translated to the transaction locale), invoice summary, and a signed `retryUrl` when retry is available. Adapters or frontends decide how to render it.

**Next:** [Transaction Management](05-transaction-management.md)
