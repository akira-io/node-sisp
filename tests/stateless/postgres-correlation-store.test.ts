import knexFactory, { type Knex } from 'knex';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mapTransactionStatus } from '../../src/application/actions/map-transaction-status';
import type { CallbackOutcome } from '../../src/core/contracts/callback-verifier';
import type {
  CorrelationClaim,
  PaymentCorrelationStore,
} from '../../src/core/contracts/payment-correlation-store';
import { callbackPayloadFrom } from '../../src/domain/value-objects/callback-payload';
import type { PaymentRequest } from '../../src/domain/value-objects/payment-request';
import { paymentRequestFixture, runCorrelationStoreContract } from './correlation-contract';
import {
  CORRELATION_TABLE,
  createCorrelationTable,
  KnexCorrelationStore,
} from './knex-correlation-store';

const connectionString = process.env.SISP_TEST_POSTGRES_URL;

class Barrier {
  private arrivals = 0;

  private release: (() => void) | null = null;

  private readonly ready: Promise<void> = new Promise((resolve) => {
    this.release = resolve;
  });

  async arrive(): Promise<void> {
    this.arrivals += 1;

    if (this.arrivals >= this.parties && this.release !== null) {
      this.release();
    }

    await this.ready;
  }

  constructor(private readonly parties: number) {}
}

class NaiveCorrelationStore implements PaymentCorrelationStore {
  constructor(
    private readonly db: Knex,
    private readonly table: string,
    private readonly beforeUpdate: () => Promise<void>,
  ) {}

  async record(request: PaymentRequest): Promise<void> {
    await this.db(this.table).insert({
      merchant_ref: request.merchantRef,
      merchant_session: request.merchantSession,
      amount: request.amount,
      currency: request.currency,
      transaction_code: request.transactionCode,
      claimed_at: null,
      processed_verified: null,
      processed_reason: null,
    });
  }

  async claim(merchantRef: string, merchantSession: string): Promise<CorrelationClaim> {
    const existing = await this.db(this.table)
      .where({ merchant_ref: merchantRef, merchant_session: merchantSession })
      .first();

    if (existing === undefined) {
      return { status: 'missing' };
    }

    if (existing.claimed_at !== null) {
      return { status: 'already_processed' };
    }

    await this.beforeUpdate();

    await this.db(this.table)
      .where({ merchant_ref: merchantRef, merchant_session: merchantSession })
      .update({ claimed_at: this.db.fn.now() });

    return {
      status: 'claimed',
      payment: {
        amount: existing.amount,
        currency: existing.currency,
        transactionCode: existing.transaction_code,
      },
    };
  }

  async markProcessed(
    merchantRef: string,
    merchantSession: string,
    outcome: CallbackOutcome,
  ): Promise<void> {
    await this.db(this.table)
      .where({ merchant_ref: merchantRef, merchant_session: merchantSession })
      .update({
        processed_verified: outcome.verified,
        processed_reason: outcome.reason,
      });
  }
}

describe.skipIf(connectionString === undefined)('PaymentCorrelationStore against Postgres', () => {
  let db: Knex;

  beforeAll(async () => {
    db = knexFactory({ client: 'pg', connection: connectionString });
    await createCorrelationTable(db, CORRELATION_TABLE);
  });

  afterAll(async () => {
    await db.schema.dropTableIfExists(CORRELATION_TABLE);
    await db.destroy();
  });

  runCorrelationStoreContract(
    'KnexCorrelationStore (Postgres)',
    async () => {
      await db(CORRELATION_TABLE).del();

      return new KnexCorrelationStore(db, CORRELATION_TABLE);
    },
    async (_store, merchantRef, merchantSession) => {
      const row = await db(CORRELATION_TABLE)
        .where({ merchant_ref: merchantRef, merchant_session: merchantSession })
        .first();

      if (row === undefined || row.processed_verified === null) {
        return null;
      }

      const messageType = row.processed_verified ? '8' : '6';

      return {
        verified: row.processed_verified,
        status: mapTransactionStatus(messageType),
        reason: row.processed_reason,
        payload: callbackPayloadFrom({ messageType }),
      };
    },
  );

  describe('atomicity under real concurrent connections', () => {
    let dbA: Knex;
    let dbB: Knex;

    beforeAll(() => {
      dbA = knexFactory({ client: 'pg', connection: connectionString });
      dbB = knexFactory({ client: 'pg', connection: connectionString });
    });

    afterAll(async () => {
      await dbA.destroy();
      await dbB.destroy();
    });

    it('KnexCorrelationStore yields exactly one claim across two independent connections', async () => {
      await db(CORRELATION_TABLE).del();
      await new KnexCorrelationStore(db, CORRELATION_TABLE).record(
        paymentRequestFixture({ merchantRef: 'ATOMIC1', merchantSession: 'S1' }),
      );

      const storeA = new KnexCorrelationStore(dbA, CORRELATION_TABLE);
      const storeB = new KnexCorrelationStore(dbB, CORRELATION_TABLE);

      const results = await Promise.all([
        storeA.claim('ATOMIC1', 'S1'),
        storeB.claim('ATOMIC1', 'S1'),
      ]);

      expect(results.map((result) => result.status).sort()).toEqual([
        'already_processed',
        'claimed',
      ]);
    });

    it('naive SELECT-then-UPDATE claim yields two claims across two independent connections', async () => {
      await db(CORRELATION_TABLE).del();
      await new KnexCorrelationStore(db, CORRELATION_TABLE).record(
        paymentRequestFixture({ merchantRef: 'RACE1', merchantSession: 'S1' }),
      );

      const barrier = new Barrier(2);
      const storeA = new NaiveCorrelationStore(dbA, CORRELATION_TABLE, () => barrier.arrive());
      const storeB = new NaiveCorrelationStore(dbB, CORRELATION_TABLE, () => barrier.arrive());

      const results = await Promise.all([storeA.claim('RACE1', 'S1'), storeB.claim('RACE1', 'S1')]);

      expect(results.map((result) => result.status)).toEqual(['claimed', 'claimed']);
    });
  });
});
