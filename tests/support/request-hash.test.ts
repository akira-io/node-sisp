import { describe, expect, it } from 'vitest';
import { paymentRequestHash } from '../../src/support/request-hash';

describe('paymentRequestHash', () => {
  it('ignores key order and the idempotency keys themselves', () => {
    const a = paymentRequestHash(
      { checkout_intent_id: 'k1', amount: '1500', items: [{ b: 1, a: 2 }] },
      ['checkout_intent_id'],
    );
    const b = paymentRequestHash(
      { items: [{ a: 2, b: 1 }], amount: '1500', checkout_intent_id: 'k2' },
      ['checkout_intent_id'],
    );

    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(paymentRequestHash({ amount: 1500 }, [])).toBe(
      paymentRequestHash({ amount: '1500' }, []),
    );
  });

  it('changes when any field changes', () => {
    const base = { amount: '1500', items: [{ a: 1 }] };

    expect(paymentRequestHash(base, [])).not.toBe(
      paymentRequestHash({ ...base, amount: '1501' }, []),
    );
    expect(paymentRequestHash(base, [])).not.toBe(
      paymentRequestHash({ ...base, items: [{ a: 2 }] }, []),
    );
  });
});
