# Handling failed payments

A declined payment, an invalid callback, or a 3D Secure / OTP authentication failure emits `payment:failed` and marks the transaction `failed`.

```ts
sisp.on('payment:failed', ({ transaction, payload }) => {
  console.log('failed', transaction.merchant_ref, {
    messageType: payload.messageType,
    responseCode: payload.responseCode,
    detail: payload.additionalErrorMessage,
  });
});
```

## 3D Secure / OTP failure

When the customer enters a wrong OTP, the gateway posts an error callback whose fingerprint is signed over a different field set than a success callback. The package fails the transaction and emits `payment:failed`; the gateway detail is on the payload.

Observed callback payload from the live gateway:

```json
{
  "messageType": "6",
  "merchantRespErrorCode": "F",
  "merchantRespErrorDescription": "FALHA NA AUTENTICACAO CLIENTE",
  "merchantRespMerchantRef": "Rmqzuyv87xwwjl2",
  "merchantRespMerchantSession": "Smqzuyv879ijvys"
}
```

The customer-facing result carries the mapped error and whether a retry is allowed:

```jsonc
{
  "status": "failed",
  "error": { "code": "6", "label": "Erro do emissor ou sistema bancário", "action": "retry" },
  "allowRetry": true
}
```

Use `payload.additionalErrorMessage` for the specific gateway reason (e.g. the OTP failure text) and the mapped `error` for a user-facing label.

**Next:** [Listing transactions](05-listing-transactions.md)
