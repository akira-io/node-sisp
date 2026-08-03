import { expectTypeOf, test } from 'vitest';
import type { Sisp } from '../../src/application/sisp';
import type { StatelessSisp } from '../../src/application/stateless-sisp';
import type {
  CallbackOutcome,
  StoredCallbackOutcome,
} from '../../src/core/contracts/callback-verifier';

test('StatelessSisp hides every stateful member', () => {
  expectTypeOf<StatelessSisp>().not.toHaveProperty('models');
  expectTypeOf<StatelessSisp>().not.toHaveProperty('storage');
  expectTypeOf<StatelessSisp>().not.toHaveProperty('db');
  expectTypeOf<StatelessSisp>().not.toHaveProperty('cancel');
  expectTypeOf<StatelessSisp>().not.toHaveProperty('refund');
  expectTypeOf<StatelessSisp>().not.toHaveProperty('reconcilePending');
  expectTypeOf<StatelessSisp>().not.toHaveProperty('forCredentials');
  expectTypeOf<StatelessSisp>().not.toHaveProperty('signedCancelUrl');
  expectTypeOf<StatelessSisp>().not.toHaveProperty('signedRetryUrl');
});

test('Sisp is assignable to StatelessSisp so the factory swap keeps compiling', () => {
  expectTypeOf<Sisp>().toExtend<StatelessSisp>();
});

test('handleCallback widens rather than narrows in the stateful subclass', () => {
  expectTypeOf<StatelessSisp['handleCallback']>().returns.resolves.toEqualTypeOf<CallbackOutcome>();
  expectTypeOf<Sisp['handleCallback']>().returns.resolves.toEqualTypeOf<StoredCallbackOutcome>();
  expectTypeOf<StoredCallbackOutcome>().toExtend<CallbackOutcome>();
});

test('handlePaymentCallback is gone from both classes', () => {
  expectTypeOf<StatelessSisp>().not.toHaveProperty('handlePaymentCallback');
  expectTypeOf<Sisp>().not.toHaveProperty('handlePaymentCallback');
});
