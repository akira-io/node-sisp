# Handling cancellation

When the customer clicks Cancel on the gateway card or OTP page, the gateway posts the callback with `UserCancelled=true`, `merchantRef`, and `merchantSession`. The package resolves the transaction, cancels it, and emits `transaction:cancelled` before redirecting.

```ts
sisp.on('transaction:cancelled', ({ transaction, reason }) => {
  // reason is 'user_cancelled' for a gateway cancellation
  releaseHeldStock(transaction.merchant_ref);
  console.log('cancelled', transaction.merchant_ref, reason);
});
```

The transaction lands in the `cancelled` state with `merchant_response` set to `user_cancelled`. Unknown or already-terminal transactions are redirected without an event.

Observed callback payload from the live gateway:

```json
{ "merchantRef": "Rmqzujqavi5xf96", "merchantSession": "Smqzujqavctgcpo", "UserCancelled": "true" }
```

**Next:** [Handling failed payments](04-failed-payments.md)
