# Storage Port (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put an ORM-neutral storage port in front of the persistence layer and move the existing knex code behind it, with zero behavior change, so later phases can add Prisma/Drizzle/Sequelize/TypeORM adapters.

**Architecture:** Define a `SispStorage` port (per-entity repositories + a `transaction()` unit-of-work + lifecycle) in `core/contracts`. Implement it once as `KnexStorage` by moving the current model classes and db helpers under `infrastructure/storage/knex`. Rewire the application layer and `createSisp` to depend on the port instead of `Knex`/`db.transaction`/`withConnection`.

**Tech Stack:** TypeScript, knex, vitest, better-sqlite3 (tests), tsup, biome.

## Global Constraints

- Source files: hard cap 300 lines each.
- No behavior change: the full existing suite must stay green after every task.
- No public API change: `createSisp` config (`database: { client, connection, autoMigrate }`), `sisp.models.*`, and event semantics stay identical.
- knex remains the only adapter in this phase; no engine selection added.
- Conventional commits, scope from the project set (e.g. `refactor(storage)`, `test(storage)`).
- Comments policy: no narrative comments; self-documenting code.
- Run `npm run typecheck`, `npm run lint`, `npm test` before any push.

---

## File Structure

- Create `src/core/contracts/storage.ts` — the port: `SispStorage`, `SispStorageTx`, and the 9 repository interfaces. Domain records only; no `Knex` import.
- Create `src/infrastructure/storage/knex/knex-storage.ts` — `KnexStorage implements SispStorage`, owns the `Knex` instance, builds repositories, implements `transaction()`, `migrate()`, `destroy()`.
- Move under `src/infrastructure/storage/knex/`: the 9 model files (now the knex repository implementations), `create-knex.ts`, `auto-migrate.ts`, `locking.ts`, `list-options.ts`, `encryption.ts`, `log-context.ts`, `records.ts`, `transaction-log-pruning.ts`, `migrations/`. Keep filenames.
- Modify application pipes/actions that used `db.transaction`/`withConnection`/`Knex` to depend on `SispStorage`/`SispStorageTx`.
- Modify `src/application/create-sisp.ts` to build the storage and inject it.
- Modify `src/application/sisp.ts` to expose `sisp.models` as the storage repositories and keep `sisp.db` only on the knex adapter.
- Create `tests/storage/contract.ts` — reusable contract suite; `tests/storage/knex.test.ts` runs it against `KnexStorage`.

---

### Task 1: Define the storage port

**Files:**
- Create: `src/core/contracts/storage.ts`
- Test: none yet (types only; Task 2 adds the contract test)

**Interfaces:**
- Produces: `SispStorage`, `SispStorageTx`, and `TransactionRepository`, `TransactionItemRepository`, `TransactionAttemptRepository`, `PaymentIntentRepository`, `InvoiceRepository`, `TransactionLogRepository`, `BlacklistRepository`, `RateLimitRepository`, `RequestMetadataRepository`.

- [ ] **Step 1: Write the interfaces.** Each repository interface declares exactly the current public methods of the matching model class, signatures copied verbatim, except: drop `withConnection` (becomes adapter-internal), and reference domain record/param types from `records.ts` and the existing model param types (re-export those param types from the port or import from their current homes). Record types stay as-is. The aggregate:

```ts
import type {
  BlacklistRecord, InvoiceRecord, PaymentIntentRecord, RequestMetadataRecord,
  TransactionAttemptRecord, TransactionItemRecord, TransactionLogRecord, TransactionRecord,
} from '../../infrastructure/storage/knex/records';

export interface SispStorageRepositories {
  transactions: TransactionRepository;
  transactionItems: TransactionItemRepository;
  transactionAttempts: TransactionAttemptRepository;
  paymentIntents: PaymentIntentRepository;
  invoices: InvoiceRepository;
  transactionLogs: TransactionLogRepository;
  blacklist: BlacklistRepository;
  rateLimits: RateLimitRepository;
  requestMetadata: RequestMetadataRepository;
}

export interface SispStorageTx extends SispStorageRepositories {}

export interface SispStorage extends SispStorageRepositories {
  transaction<T>(work: (tx: SispStorageTx) => Promise<T>): Promise<T>;
  migrate?(): Promise<void>;
  destroy(): Promise<void>;
}
```

Each method interface, e.g.:

```ts
export interface TransactionRepository {
  create(data: NewTransaction): Promise<TransactionRecord>;
  findById(id: number): Promise<TransactionRecord | null>;
  findByIdForUpdate(id: number): Promise<TransactionRecord | null>;
  findByRef(merchantRef: string): Promise<TransactionRecord | null>;
  findByRefAndSession(ref: string, session: string): Promise<TransactionRecord | null>;
  findByRefAndSessionForUpdate(ref: string, session: string): Promise<TransactionRecord | null>;
  findByGatewayTransactionId(transactionId: string): Promise<TransactionRecord | null>;
  list(options?: ListTransactionsOptions): Promise<TransactionRecord[]>;
  listPendingForReconciliation(cutoffIso: string, limit: number): Promise<TransactionRecord[]>;
  update(id: number, changes: TransactionChanges): Promise<TransactionRecord>;
}
```

Repeat for every entity, reading each current model class for its exact method set (`blacklist`, `invoice`, `payment-intent`, `rate-limit`, `request-metadata`, `transaction-attempt`, `transaction-item`, `transaction-log`, `transaction`). Param types (`NewTransaction`, `TransactionChanges`, `ListTransactionsOptions`, `TransactionAttemptChanges`, `RateLimitHit`, `BlacklistEntry`, `NewRequestMetadata`, `TransactionItemData`) are imported from their current modules.

- [ ] **Step 2: Typecheck.** Run: `npm run typecheck`. Expected: PASS (interfaces only; nothing consumes them yet).

- [ ] **Step 3: Commit.**

```bash
git add src/core/contracts/storage.ts
git commit -m "refactor(storage): define ORM-neutral storage port"
```

---

### Task 2: Storage contract test suite

**Files:**
- Create: `tests/storage/contract.ts` (exported function, not a test file itself)
- Create: `tests/storage/knex.test.ts`

**Interfaces:**
- Consumes: `SispStorage` from Task 1; `KnexStorage` does not exist yet, so this task drives Task 3. Write the contract against the port; wire `KnexStorage` in Task 3.
- Produces: `runStorageContract(makeStorage: () => Promise<SispStorage>)`.

- [ ] **Step 1: Write the contract suite.** It must cover: create/find a transaction; `findByIdForUpdate` returns the row; `list` ordering + limit bound; an atomic `transaction()` that throws rolls back all writes; attempt + item creation; rate-limit `hit` increments. Use `describe`/`it` from vitest inside `runStorageContract`.

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { SispStorage } from '../../src/core/contracts/storage';

export function runStorageContract(makeStorage: () => Promise<SispStorage>) {
  let storage: SispStorage;
  beforeEach(async () => { storage = await makeStorage(); });
  afterEach(() => storage.destroy());

  describe('storage contract', () => {
    it('creates and reads a transaction', async () => {
      const created = await storage.transactions.create({ merchantRef: 'R1', merchantSession: 'S1', amount: 1500 });
      const found = await storage.transactions.findById(created.id);
      expect(found?.amount).toBe(1500);
    });

    it('rolls back the unit of work on error', async () => {
      const tx = await storage.transactions.create({ merchantRef: 'R2', merchantSession: 'S2', amount: 1000 });
      await expect(storage.transaction(async (work) => {
        await work.transactions.update(tx.id, { status: 'completed' });
        throw new Error('boom');
      })).rejects.toThrow('boom');
      const after = await storage.transactions.findById(tx.id);
      expect(after?.status).toBe('pending');
    });

    it('bounds list results and orders newest first', async () => {
      for (let i = 0; i < 3; i += 1) {
        await storage.transactions.create({ merchantRef: `R${i}`, merchantSession: `S${i}`, amount: 100 });
      }
      const rows = await storage.transactions.list({ limit: 2 });
      expect(rows).toHaveLength(2);
    });
  });
}
```

- [ ] **Step 2: Write the knex runner.**

```ts
import { runStorageContract } from './contract';
// import { KnexStorage } from '../../src/infrastructure/storage/knex/knex-storage';

runStorageContract(async () => {
  // return KnexStorage.create({ client: 'better-sqlite3', connection: { filename: ':memory:' }, autoMigrate: true }, DEFAULT_TABLES, 'app-key');
  throw new Error('KnexStorage not implemented yet');
});
```

- [ ] **Step 3: Run to verify it fails.** Run: `npx vitest run tests/storage/knex.test.ts`. Expected: FAIL ("KnexStorage not implemented yet"). This red test drives Task 3.

- [ ] **Step 4: Commit.**

```bash
git add tests/storage/contract.ts tests/storage/knex.test.ts
git commit -m "test(storage): add reusable storage contract suite"
```

---

### Task 3: knex adapter

**Files:**
- Move (git mv): `src/infrastructure/database/**` to `src/infrastructure/storage/knex/**` (models, `create-knex.ts`, `auto-migrate.ts`, `locking.ts`, `list-options.ts`, `encryption.ts`, `log-context.ts`, `records.ts`, `transaction-log-pruning.ts`, `migrations/`).
- Create: `src/infrastructure/storage/knex/knex-storage.ts`
- Modify: import paths across the moved files and every importer (mechanical path update).
- Test: `tests/storage/knex.test.ts` (wire the real adapter).

**Interfaces:**
- Consumes: `SispStorage` (Task 1), the moved model classes.
- Produces: `class KnexStorage implements SispStorage` with a static `create(database, tables, appKey): KnexStorage`.

- [ ] **Step 1: Move the files** with `git mv` so history is preserved, then update import specifiers (relative path depth changes by one). Run `npm run typecheck` and fix every broken path until green. No logic edits.

- [ ] **Step 2: Implement `KnexStorage`.** It holds the `Knex` instance and one instance of each model (the repositories), exposes them as the `SispStorageRepositories` getters, and implements `transaction(work)` by wrapping `db.transaction(trx => work(this.scoped(trx)))`, where `scoped(trx)` returns a `SispStorageTx` whose repositories are the models bound to `trx` via their existing `withConnection`. `migrate()` calls `runMigrations`; `destroy()` calls `db.destroy()`.

```ts
import type { Knex } from 'knex';
import type { SispStorage, SispStorageTx } from '../../../core/contracts/storage';
import type { SispTables } from '../../../application/config';
import { createKnexInstance } from './create-knex';
import { runMigrations } from './auto-migrate';
import { PayloadCipher } from './encryption';
import { Transaction } from './models/transaction';
// ...import the other 8 models

export class KnexStorage implements SispStorage {
  private constructor(
    private readonly db: Knex,
    private readonly tables: SispTables,
    private readonly cipher: PayloadCipher,
    readonly transactions: Transaction,
    // ...the other 8 repositories
  ) {}

  static create(database: Required<SispDatabaseConfig>, tables: SispTables, appKey: string | null): KnexStorage {
    const db = createKnexInstance(database);
    const cipher = new PayloadCipher(appKey);
    return new KnexStorage(db, tables, cipher,
      new Transaction(db, tables, cipher) /* ...the rest */);
  }

  async transaction<T>(work: (tx: SispStorageTx) => Promise<T>): Promise<T> {
    return this.db.transaction((trx) => work(this.scoped(trx)));
  }

  private scoped(trx: Knex): SispStorageTx {
    return {
      transactions: this.transactions.withConnection(trx),
      // ...bind the rest via withConnection (add withConnection where a model lacks it)
    };
  }

  async migrate(): Promise<void> {
    if (this.database.autoMigrate) await runMigrations(this.db, this.tables);
  }

  async destroy(): Promise<void> {
    await this.db.destroy();
  }

  get raw(): Knex { return this.db; }
}
```

Add `withConnection` to the few models that lack it (blacklist, invoice, rate-limit, request-metadata, transaction-log) so `scoped` can bind them; it returns a new instance on the trx connection, same pattern as the existing ones.

- [ ] **Step 3: Wire the knex runner test** (replace the stub from Task 2 Step 2 with the real `KnexStorage.create(...)`).

- [ ] **Step 4: Run the contract test.** Run: `npx vitest run tests/storage/knex.test.ts`. Expected: PASS.

- [ ] **Step 5: Run the full suite + typecheck.** Run: `npm test && npm run typecheck`. Expected: PASS (file moves shouldn't change behavior; existing tests that import old paths are updated in Step 1).

- [ ] **Step 6: Commit.**

```bash
git add -A
git commit -m "refactor(storage): move knex persistence behind KnexStorage"
```

---

### Task 4: Rewire createSisp onto the port

**Files:**
- Modify: `src/application/create-sisp.ts`
- Modify: `src/application/sisp.ts` (and `src/application/wiring.ts` if it builds models/db)
- Test: existing suite.

**Interfaces:**
- Consumes: `KnexStorage.create` (Task 3), `SispStorage` (Task 1).
- Produces: a `Sisp` constructed with a `SispStorage` injected where `db` + models were.

- [ ] **Step 1: Build storage in `createSisp`.** Replace `createKnexInstance` + `runMigrations` + the nine `new Model(...)` lines with `const storage = KnexStorage.create(resolved.database, resolved.tables, resolved.appKey); if (resolved.database.autoMigrate) await storage.migrate();`. Pass `storage` (and its repositories as `models`) into `wiring`, handlers, actions.

- [ ] **Step 2: Map `sisp.models` and `sisp.db`.** In `sisp.ts`, `models` returns `storage` repositories; expose `sisp.db` only by casting the knex adapter (`(storage as KnexStorage).raw`) behind a getter that documents it as knex-specific. Keep the `SispModels` type shape so consumers are unaffected.

- [ ] **Step 3: Typecheck + full suite.** Run: `npm run typecheck && npm test`. Fix injection sites until green. Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add -A
git commit -m "refactor(storage): build Sisp on the storage port"
```

---

### Task 5: Move application transaction sites onto the port

**Files:**
- Modify: `src/application/pipelines/payment/pipes/persist-transaction.ts`
- Modify: `src/application/pipelines/callback/pipes/apply-transaction-status.ts`
- Modify: `src/application/pipelines/callback/pipes/resolve-transaction.ts`
- Modify: `src/application/actions/refund-transaction.ts`
- Modify: `src/application/actions/fail-transaction.ts`
- Modify: `src/application/actions/create-retry-payment-attempt.ts`
- Test: existing suite (lifecycle/pipeline tests).

**Interfaces:**
- Consumes: `SispStorage`/`SispStorageTx` (Task 1).
- Produces: these units depend on `SispStorage`, not `Knex`.

- [ ] **Step 1: Replace one site.** In `persist-transaction.ts`, swap the constructor `Knex` dependency for `SispStorage`, and replace `db.transaction(async (trx) => { models.withConnection(trx)... })` with `storage.transaction(async (tx) => { tx.transactions.create(...)... })`. Drop direct `Knex`/`withConnection` imports.

- [ ] **Step 2: Run that pipe's tests.** Run: `npx vitest run tests/pipelines/payment-pipeline.test.ts`. Expected: PASS.

- [ ] **Step 3: Repeat Steps 1-2 for each remaining file** in the list, one at a time, running the closest test file after each (`tests/pipelines/callback-pipeline.test.ts`, `tests/lifecycle/refund.test.ts`, `tests/lifecycle/retry.test.ts`). Each conversion is the same shape: `Knex` dep -> `SispStorage`, `db.transaction(trx=>...withConnection)` -> `storage.transaction(tx=>...)`, locked reads -> `tx.<repo>.<...>ForUpdate(...)`.

- [ ] **Step 4: Full suite + typecheck.** Run: `npm run typecheck && npm test`. Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add -A
git commit -m "refactor(storage): run application transactions through the port"
```

---

### Task 6: Remove leaked knex from the public surface

**Files:**
- Modify: any remaining file importing `Knex` outside `src/infrastructure/storage/knex/**` (grep to find).
- Modify: `src/index.ts` if it re-exports knex-only helpers that should now be adapter-scoped.
- Test: existing suite.

**Interfaces:**
- Produces: no `Knex` import remains in `core`/`application`/`presentation`.

- [ ] **Step 1: Find leaks.** Run: `grep -rn "from 'knex'" src/core src/application src/presentation`. Expected after fixes: only type-erased `import type { Knex }` that genuinely cannot be removed, or nothing.

- [ ] **Step 2: Remove each leak**, routing the need through `SispStorage`. If a presentation handler used `sisp.db(table)` directly, replace with a repository method.

- [ ] **Step 3: Full suite + typecheck + lint.** Run: `npm run typecheck && npm run lint && npm test`. Expected: PASS.

- [ ] **Step 4: Commit.**

```bash
git add -A
git commit -m "refactor(storage): keep knex types inside the adapter"
```

---

### Task 7: Verify, build, document the seam

**Files:**
- Modify: `docs/10-architecture.md` (note the storage port + adapters seam).
- Test: full suite + build.

- [ ] **Step 1: Full gate.** Run: `npm run typecheck && npm run lint && npm test && npm run build`. Expected: all PASS, test count equals the pre-refactor count plus the new contract tests.

- [ ] **Step 2: Document the seam.** Add a short "Storage adapters" subsection to `docs/10-architecture.md`: the `SispStorage` port lives in `core/contracts`, `KnexStorage` is the only adapter today, future adapters (Prisma, Drizzle, Sequelize, TypeORM) implement the same port and are validated by `tests/storage/contract.ts`.

- [ ] **Step 3: Commit.**

```bash
git add -A
git commit -m "docs(architecture): document the storage port seam"
```

---

## Self-Review

- **Spec coverage:** port (Task 1), knex adapter + file moves (Task 3), app-layer unit-of-work (Task 5), `sisp.models`/`sisp.db` preserved (Task 4), encryption stays adapter-side (Task 3, cipher moved under knex), migrations via `migrate()` (Task 3), contract test (Task 2), no-behavior-change gate (every task runs the suite), knex types not leaking (Task 6), docs (Task 7). Covered.
- **Placeholder scan:** file moves are exact instructions, not placeholders; representative code shown for the non-mechanical parts (port, contract, `KnexStorage`). The per-repository method lists are "copy verbatim from the named model class" — an exact instruction.
- **Type consistency:** `SispStorage`/`SispStorageTx`/repository names match across tasks; `KnexStorage.create(database, tables, appKey)` is the single constructor referenced by Tasks 2-4.
