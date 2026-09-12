# Handling failed payments

A declined payment, an invalid callback, or a 3D Secure / OTP authentication failure emits `payment:failed` and marks the transaction `failed`.

```ts
sisp.on('payment:failed', ({ transaction, payload }) => {
  console.log('failed', transaction.merchant_ref, {
    messageType: payload.messageType,
    responseCode: payload.responseCode,
    errorCode: payload.errorCode,
    errorDescription: payload.errorDescription,
    detail: payload.additionalErrorMessage,
  });
});
```

## 3D Secure / OTP failure

When the customer enters a wrong OTP, the gateway posts an error callback. Its fingerprint is computed with the error function of section 2.4.2.2 of the security protocol, over a different field set and a different order than a success callback, so the package verifies it with that function. A signature that matches is a genuine decline and fails the transaction; a signature that does not match is rejected without writing anything, and the transaction keeps its status. `payment:failed` carries the gateway detail on the payload.

Observed callback payload from the live gateway:

```json
{
  "messageType": "6",
  "merchantRespErrorCode": "F",
  "merchantRespErrorDescription": "FALHA NA AUTENTICACAO CLIENTE",
  "merchantRespMerchantRef": "Rmqzuyv87xwwjl2",
  "merchantRespMerchantSession": "Smqzuyv879ijvys",
  "merchantRespAdditionalErrorMessage": "Código de autenticação errado. Favor tentar novamente"
}
```

The customer-facing result carries the gateway's own error fields and whether a retry is allowed. `customerMessage` is `merchantRespAdditionalErrorMessage`, which the specification defines as the message to show the end customer:

```jsonc
{
  "status": "failed",
  "error": {
    "code": "F",
    "description": "FALHA NA AUTENTICACAO CLIENTE",
    "detail": "",
    "customerMessage": "Código de autenticação errado. Favor tentar novamente"
  },
  "allowRetry": true
}
```

Use `payload.additionalErrorMessage` for the specific gateway reason (e.g. the OTP failure text) and the mapped `error` for a user-facing label.

**Next:** [Listing transactions](09-listing-transactions.md)
