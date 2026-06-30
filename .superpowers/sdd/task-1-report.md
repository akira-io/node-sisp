# Task 1 Report — ORM-neutral storage port

File: `src/core/contracts/storage.ts`

## Repository interfaces and methods

### TransactionRepository
- `create(data: NewTransaction): Promise<TransactionRecord>`
- `findById(id: number): Promise<TransactionRecord | null>`
- `findByIdForUpdate(id: number): Promise<TransactionRecord | null>`
- `findByRefAndSession(merchantRef: string, merchantSession: string): Promise<TransactionRecord | null>`
- `findByRefAndSessionForUpdate(merchantRef: string, merchantSession: string): Promise<TransactionRecord | null>`
- `findByRef(merchantRef: string): Promise<TransactionRecord | null>`
- `findByGatewayTransactionId(transactionId: string): Promise<TransactionRecord | null>`
- `list(options?: ListTransactionsOptions): Promise<TransactionRecord[]>`
- `listPendingForReconciliation(cutoffIso: string, limit: number): Promise<TransactionRecord[]>`
- `update(id: number, changes: TransactionChanges): Promise<TransactionRecord>`

### TransactionItemRepository
- `createMany(transactionId: number, items: readonly TransactionItemData[]): Promise<void>`
- `listByTransaction(transactionId: number, options?: ListByTransactionOptions): Promise<TransactionItemRecord[]>`

### TransactionAttemptRepository
- `createForPayment(transaction: TransactionRecord, paymentRequest: PaymentRequest, supersedeCurrent?: boolean): Promise<TransactionAttemptRecord>`
- `createFromTransaction(transaction: TransactionRecord): Promise<TransactionAttemptRecord>`
- `findByRefAndSession(merchantRef: string, merchantSession: string): Promise<TransactionAttemptRecord | null>`
- `findByRefAndSessionForUpdate(merchantRef: string, merchantSession: string): Promise<TransactionAttemptRecord | null>`
- `listByTransaction(transactionId: number, options?: ListByTransactionOptions): Promise<TransactionAttemptRecord[]>`
- `existsByTransaction(transactionId: number): Promise<boolean>`
- `currentByTransaction(transactionId: number): Promise<TransactionAttemptRecord | null>`
- `update(id: number, changes: TransactionAttemptChanges): Promise<TransactionAttemptRecord>`

### PaymentIntentRepository
- `reserve(idempotencyKey: string): Promise<boolean>`
- `findByKey(idempotencyKey: string): Promise<PaymentIntentRecord | null>`
- `submit(idempotencyKey: string, transactionId: number): Promise<void>`
- `fail(idempotencyKey: string, reason: string, transactionId?: number | null): Promise<void>`

### InvoiceRepository
- `createForTransaction(transaction: TransactionRecord): Promise<InvoiceRecord>`
- `findByTransaction(transactionId: number): Promise<InvoiceRecord | null>`
- `updateStatus(transactionId: number, status: InvoiceStatus): Promise<void>`

### TransactionLogRepository
- `listByTransaction(transactionId: number, options?: ListByTransactionOptions): Promise<TransactionLogRecord[]>`

### BlacklistRepository
- `find(type: string, value: string): Promise<BlacklistRecord | null>`
- `isBlacklisted(type: string, value: string): Promise<boolean>`
- `add(entry: BlacklistEntry): Promise<BlacklistRecord>`
- `remove(type: string, value: string): Promise<boolean>`

### RateLimitRepository
- `hit(params: RateLimitHit): Promise<boolean>`

### RequestMetadataRepository
- `create(data: NewRequestMetadata): Promise<void>`
- `listByTransaction(transactionId: number, options?: ListByTransactionOptions): Promise<RequestMetadataRecord[]>`

## Aggregate interfaces

- `SispStorageRepositories` — aggregate with all 9 repository properties
- `SispStorageTx extends SispStorageRepositories` — transaction-scoped view (no additional methods)
- `SispStorage extends SispStorageRepositories` — full port with `transaction<T>()`, optional `migrate()`, and `destroy()`

## Typecheck result

`npm run typecheck` exits 0 with no errors or warnings.

## Ambiguities

- `Invoice.withConnection` is absent from the invoice model but all other models have it. It was excluded from all repository interfaces per task instructions (adapter-internal).
- `RateLimit` has only one public method (`hit`); all other methods are private. The port exposes only `hit`.
- `TransactionLog` has no write methods at all in the model; the port correctly exposes only `listByTransaction`.
- Import paths deliberately point to current locations (`../../infrastructure/database/...`). A later task will move domain types and update these paths.
- `NewRequestMetadata` is a derived `Omit & Pick` type declared in the model file; it is re-exported from there rather than inlined here to keep the port self-documenting and avoid duplicating the type derivation.
