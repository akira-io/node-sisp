# Decoupled SPA (Vue)

The package is framework-agnostic. The [React example](04-react.md) backend and flow are unchanged for any SPA; only the view layer differs. The contract is plain HTTP plus a full-page form submit:

1. `POST /sisp/payment/intent` returns `{ action, fields, ref }`.
2. Build a `<form>` and submit it full-page to the gateway.
3. After payment the package redirects to `${frontendResultUrl}?ref=...`.
4. The result route reads `ref` and polls `GET /api/transactions/:ref`.

The gateway submit is plain DOM, identical everywhere:

```ts
const API = 'http://localhost:3000';

export async function startPayment(data: Record<string, string>) {
  const response = await fetch(`${API}/sisp/payment/intent`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ...data,
      items: [
        { product_name: 'Plano Pro', quantity: '1', unit_price: data.amount, total_price: data.amount },
      ],
    }),
  });

  const { action, fields } = await response.json();
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = action;
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = String(value);
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}
```

## Checkout

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { startPayment } from './payment';

const submitting = ref(false);

async function pay(event: Event) {
  submitting.value = true;
  const form = event.target as HTMLFormElement;
  await startPayment(Object.fromEntries(new FormData(form).entries()) as Record<string, string>);
}
</script>

<template>
  <form @submit.prevent="pay">
    <input name="amount" type="number" value="1500" required />
    <input name="customer_email" type="email" value="cliente@example.cv" required />
    <input name="customer_country" value="CV" required />
    <input name="customer_city" value="Praia" required />
    <input name="customer_address" value="Av. Cidade de Lisboa" required />
    <input name="customer_postal_code" value="7600" required />
    <button :disabled="submitting">Pay</button>
  </form>
</template>
```

## Result route

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue';

const API = 'http://localhost:3000';
const transaction = ref<{ status: string; amount: number; detail: string | null } | null>(null);

onMounted(() => {
  const reference = new URLSearchParams(location.search).get('ref');
  if (!reference) return;

  let attempts = 0;
  const poll = async () => {
    attempts += 1;
    const response = await fetch(`${API}/api/transactions/${reference}`);
    if (!response.ok) return;
    transaction.value = await response.json();
    if (transaction.value?.status === 'pending' && attempts < 10) {
      setTimeout(poll, 1000);
    }
  };
  poll();
});
</script>

<template>
  <p v-if="transaction">Status: {{ transaction.status }} ({{ transaction.amount }})</p>
  <p v-else>Loading...</p>
</template>
```

The backend (API + CORS + `frontendResultUrl`) is exactly the one from the [React example](04-react.md), on either [knex](01-knex.md) or [Prisma](02-prisma.md) storage. Only the SPA router and components change per framework.

**Next:** [Decoupled SPA (Svelte)](06-svelte.md)
