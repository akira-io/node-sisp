# Payment Flow

Both flows run through pipelines of small single-purpose pipes, the same semantics as the Laravel package.

## Payment pipeline (POST /payment)

1. **Validation.** `amount` must be at least 0.01, `items` must be present, every line total must equal quantity times unit price in minor units, and the amount must equal the sum of line totals. Failures return HTTP 422 with Laravel-style error keys such as `items.0.total_price`.
2. **Duplicate guard.** A body carrying a `merchantRef` and `merchantSession` that already exist is redirected instead of reprocessed.
3. **EnsureIpIsNotBlacklisted.** Rejects blacklisted IPs with HTTP 403.
4. **EnforceRateLimits.** DB-backed per-IP window, HTTP 429 when exceeded.
5. **BuildPaymentRequest.** Fills refs, session, and timestamp from the generators, signs the request fingerprint, and builds the base64 `purchaseRequest` when `is3DSec` is `'1'` (missing customer data throws `MissingThreeDSecureDataError`).
6. **PersistTransaction.** Inside one DB transaction: pending transaction row with canonical `amount_cents`, customer data, items with prices in cents, plus an invoice stub. Invoice failures never break the payment.
7. **CaptureRequestMetadata.** IP, user agent, device type, browser, OS, device fingerprint, and a redacted copy of the request.

The handler responds with an auto-submitting HTML form. Its action is the driver's payment endpoint with `FingerPrint`, `TimeStamp`, and `FingerPrintVersion` repeated on the query string, exactly as SISP expects.

## Callback pipeline (POST /callback)

`UserCancelled` posts and payloads missing ref or session redirect to `redirectUrl`. Replays (the transaction already has a gateway `transaction_id`) redirect without reprocessing. Then:

1. **ResolveTransaction** by `merchantRef` plus `merchantSession`.
2. **ValidateFingerprint.** Constant-time comparison of the 16-field callback fingerprint. A mismatch marks the transaction failed with `invalid_callback_fingerprint`, emits `payment:failed`, and short-circuits.
3. **EnsureCallbackMatchesTransaction.** Ref, session, amount (compared in thousandths), currency, transaction code, and posID must match the stored transaction, otherwise `callback_details_mismatch`.
4. **ApplyTransactionStatus.** Message types `8`, `P`, `M`, `A`, `B`, `C`, and `10` complete the transaction; the 36 SISP error codes fail it; anything else stays pending.
5. **DispatchPaymentEvents.** Emits `payment:completed`, `payment:failed`, or `payment:pending`.

After the pipeline the handler stores request metadata and updates the invoice status. Both run quietly: nothing after completion may break the callback response.

## Result page (GET /callback?ref=)

Returns render-ready JSON: transaction summary with `formatted_amount`, structured error data (code, category, suggested action, labels translated to the transaction locale), invoice summary, and a signed `retryUrl` when retry is available. Adapters or frontends decide how to render it.

**Next:** [Transaction Management](05-transaction-management.md)
