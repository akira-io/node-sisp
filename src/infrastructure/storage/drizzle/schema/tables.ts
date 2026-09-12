import type { ColumnSpec, TableSpec } from './spec';

const TIMESTAMPS: readonly ColumnSpec[] = [
  { name: 'created_at', type: { kind: 'timestamp' } },
  { name: 'updated_at', type: { kind: 'timestamp' } },
];

const CUSTOMER_COLUMNS: readonly ColumnSpec[] = [
  { name: 'customer_name', type: { kind: 'string' } },
  { name: 'customer_email', type: { kind: 'string' } },
  { name: 'customer_phone', type: { kind: 'string' } },
  { name: 'customer_country', type: { kind: 'string' } },
  { name: 'customer_city', type: { kind: 'string' } },
  { name: 'customer_address', type: { kind: 'string' } },
  { name: 'customer_postal_code', type: { kind: 'string' } },
];

const transactions: TableSpec = {
  key: 'transactions',
  columns: [
    { name: 'id', type: { kind: 'id' } },
    { name: 'merchant_ref', type: { kind: 'string' }, notNull: true },
    { name: 'merchant_session', type: { kind: 'string' }, notNull: true },
    { name: 'pos_id', type: { kind: 'string', length: 32 } },
    { name: 'amount_cents', type: { kind: 'bigint' }, notNull: true, default: 0 },
    { name: 'currency', type: { kind: 'string' }, notNull: true, default: '132' },
    { name: 'status', type: { kind: 'string' }, notNull: true, default: 'pending' },
    { name: 'transaction_code', type: { kind: 'string' } },
    { name: 'transaction_id', type: { kind: 'string' } },
    { name: 'message_type', type: { kind: 'string' } },
    { name: 'response_code', type: { kind: 'string' } },
    { name: 'merchant_response', type: { kind: 'text' } },
    { name: 'fingerprint', type: { kind: 'text' } },
    { name: 'payload', type: { kind: 'longtext' } },
    ...CUSTOMER_COLUMNS,
    { name: 'locale', type: { kind: 'string', length: 5 }, notNull: true, default: 'pt' },
    { name: 'cancelled_at', type: { kind: 'timestamp' } },
    { name: 'refunded_at', type: { kind: 'timestamp' } },
    ...TIMESTAMPS,
  ],
  uniques: [['merchant_ref']],
  indexes: [
    ['merchant_ref', 'merchant_session', 'status', 'message_type'],
    ['transaction_id'],
    ['customer_email'],
    ['pos_id'],
  ],
};

const transactionItems: TableSpec = {
  key: 'transactionItems',
  columns: [
    { name: 'id', type: { kind: 'id' } },
    {
      name: 'transaction_id',
      type: { kind: 'bigint' },
      notNull: true,
      references: { table: 'transactions', onDelete: 'CASCADE' },
    },
    { name: 'product_id', type: { kind: 'string' } },
    { name: 'product_name', type: { kind: 'string' }, notNull: true },
    { name: 'quantity', type: { kind: 'integer' }, notNull: true, default: 1 },
    { name: 'unit_price_cents', type: { kind: 'bigint' }, notNull: true },
    { name: 'total_price_cents', type: { kind: 'bigint' }, notNull: true },
    { name: 'description', type: { kind: 'text' } },
    { name: 'metadata', type: { kind: 'json' } },
    ...TIMESTAMPS,
  ],
  uniques: [],
  indexes: [['transaction_id', 'product_id']],
};

const transactionAttempts: TableSpec = {
  key: 'transactionAttempts',
  columns: [
    { name: 'id', type: { kind: 'id' } },
    {
      name: 'transaction_id',
      type: { kind: 'bigint' },
      notNull: true,
      references: { table: 'transactions', onDelete: 'CASCADE' },
    },
    { name: 'attempt_number', type: { kind: 'integer' }, notNull: true },
    { name: 'merchant_ref', type: { kind: 'string' }, notNull: true },
    { name: 'merchant_session', type: { kind: 'string' }, notNull: true },
    { name: 'status', type: { kind: 'string' }, notNull: true, default: 'pending' },
    { name: 'gateway_transaction_id', type: { kind: 'string' } },
    { name: 'message_type', type: { kind: 'string' } },
    { name: 'response_code', type: { kind: 'string' } },
    { name: 'merchant_response', type: { kind: 'text' } },
    { name: 'fingerprint', type: { kind: 'text' } },
    { name: 'payload', type: { kind: 'longtext' } },
    { name: 'callback_payload', type: { kind: 'longtext' } },
    { name: 'failure_reason', type: { kind: 'string' } },
    { name: 'submitted_at', type: { kind: 'timestamp' } },
    { name: 'callback_received_at', type: { kind: 'timestamp' } },
    { name: 'superseded_at', type: { kind: 'timestamp' } },
    ...TIMESTAMPS,
  ],
  uniques: [
    ['merchant_session'],
    ['merchant_ref', 'merchant_session'],
    ['transaction_id', 'attempt_number'],
  ],
  indexes: [['transaction_id', 'status'], ['gateway_transaction_id']],
};

const paymentIntents: TableSpec = {
  key: 'paymentIntents',
  columns: [
    { name: 'id', type: { kind: 'id' } },
    { name: 'idempotency_key', type: { kind: 'string' }, notNull: true, unique: true },
    { name: 'request_hash', type: { kind: 'string', length: 64 } },
    {
      name: 'transaction_id',
      type: { kind: 'bigint' },
      references: { table: 'transactions', onDelete: 'SET NULL' },
    },
    { name: 'status', type: { kind: 'string' }, notNull: true, default: 'processing' },
    { name: 'failure_reason', type: { kind: 'text' } },
    ...TIMESTAMPS,
  ],
  uniques: [],
  indexes: [['transaction_id', 'status']],
};

const invoices: TableSpec = {
  key: 'invoices',
  columns: [
    { name: 'id', type: { kind: 'id' } },
    {
      name: 'transaction_id',
      type: { kind: 'bigint' },
      notNull: true,
      unique: true,
      references: { table: 'transactions', onDelete: 'CASCADE' },
    },
    { name: 'invoice_number', type: { kind: 'string' }, notNull: true, unique: true },
    { name: 'invoice_date', type: { kind: 'date' }, notNull: true },
    { name: 'due_date', type: { kind: 'date' } },
    { name: 'status', type: { kind: 'string' }, notNull: true, default: 'pending' },
    { name: 'customer_name', type: { kind: 'string' } },
    { name: 'customer_email', type: { kind: 'string' } },
    { name: 'customer_city', type: { kind: 'string' } },
    { name: 'customer_address', type: { kind: 'string' } },
    { name: 'customer_country', type: { kind: 'string' } },
    { name: 'notes', type: { kind: 'text' } },
    { name: 'pdf_path', type: { kind: 'string' } },
    { name: 'metadata', type: { kind: 'json' } },
    ...TIMESTAMPS,
  ],
  uniques: [],
  indexes: [['invoice_number', 'status']],
};

const transactionLogs: TableSpec = {
  key: 'transactionLogs',
  columns: [
    { name: 'id', type: { kind: 'id' } },
    {
      name: 'transaction_id',
      type: { kind: 'bigint' },
      notNull: true,
      references: { table: 'transactions', onDelete: 'CASCADE' },
    },
    { name: 'source', type: { kind: 'string' }, notNull: true, default: 'model' },
    { name: 'changed_attributes', type: { kind: 'json' }, notNull: true },
    { name: 'old_values', type: { kind: 'json' } },
    { name: 'new_values', type: { kind: 'json' } },
    ...TIMESTAMPS,
  ],
  uniques: [],
  indexes: [
    ['transaction_id', 'created_at'],
    ['source', 'created_at'],
  ],
};

const blacklist: TableSpec = {
  key: 'blacklist',
  columns: [
    { name: 'id', type: { kind: 'id' } },
    { name: 'type', type: { kind: 'string' }, notNull: true },
    { name: 'value', type: { kind: 'string' }, notNull: true },
    { name: 'reason', type: { kind: 'string' } },
    { name: 'severity', type: { kind: 'string' }, notNull: true },
    { name: 'notes', type: { kind: 'text' } },
    { name: 'added_by', type: { kind: 'string' } },
    { name: 'expires_at', type: { kind: 'timestamp' } },
    ...TIMESTAMPS,
  ],
  uniques: [['type', 'value']],
  indexes: [['expires_at'], ['severity']],
};

const rateLimits: TableSpec = {
  key: 'rateLimits',
  columns: [
    { name: 'id', type: { kind: 'id' } },
    { name: 'identifier', type: { kind: 'string' }, notNull: true },
    { name: 'limit_type', type: { kind: 'string' }, notNull: true },
    { name: 'context', type: { kind: 'string' }, notNull: true, default: '' },
    { name: 'hits', type: { kind: 'integer' }, notNull: true, default: 1 },
    { name: 'limit', type: { kind: 'integer' }, notNull: true, default: 100 },
    { name: 'window_seconds', type: { kind: 'integer' }, notNull: true, default: 3600 },
    { name: 'reset_at', type: { kind: 'timestamp' }, notNull: true },
    { name: 'is_blocked', type: { kind: 'boolean' }, notNull: true, default: false },
    { name: 'blocked_until', type: { kind: 'timestamp' } },
    ...TIMESTAMPS,
  ],
  uniques: [['identifier', 'limit_type', 'context']],
  indexes: [['identifier', 'limit_type', 'reset_at'], ['is_blocked'], ['reset_at']],
};

const requestMetadata: TableSpec = {
  key: 'requestMetadata',
  columns: [
    { name: 'id', type: { kind: 'id' } },
    {
      name: 'transaction_id',
      type: { kind: 'bigint' },
      references: { table: 'transactions', onDelete: 'CASCADE' },
    },
    { name: 'ip_address', type: { kind: 'string' }, notNull: true },
    { name: 'user_agent', type: { kind: 'string' } },
    { name: 'referer', type: { kind: 'string' } },
    { name: 'country_code', type: { kind: 'string' } },
    { name: 'country_name', type: { kind: 'string' } },
    { name: 'region', type: { kind: 'string' } },
    { name: 'city', type: { kind: 'string' } },
    { name: 'latitude', type: { kind: 'decimal', precision: 10, scale: 8 } },
    { name: 'longitude', type: { kind: 'decimal', precision: 11, scale: 8 } },
    { name: 'isp', type: { kind: 'string' } },
    { name: 'device_type', type: { kind: 'string' } },
    { name: 'browser', type: { kind: 'string' } },
    { name: 'os', type: { kind: 'string' } },
    { name: 'device_fingerprint', type: { kind: 'string' } },
    { name: 'response_time_ms', type: { kind: 'integer' } },
    { name: 'api_version', type: { kind: 'string' } },
    { name: 'is_vpn', type: { kind: 'boolean' }, notNull: true, default: false },
    { name: 'is_proxy', type: { kind: 'boolean' }, notNull: true, default: false },
    { name: 'is_mobile', type: { kind: 'boolean' }, notNull: true, default: false },
    { name: 'risk_score', type: { kind: 'integer' }, notNull: true, default: 0 },
    { name: 'risk_reason', type: { kind: 'string' } },
    { name: 'custom_metadata', type: { kind: 'json' } },
    ...TIMESTAMPS,
  ],
  uniques: [],
  indexes: [
    ['ip_address', 'created_at'],
    ['country_code'],
    ['device_fingerprint'],
    ['risk_score'],
    ['transaction_id'],
  ],
};

export const SISP_TABLE_SPECS: readonly TableSpec[] = [
  transactions,
  transactionItems,
  transactionAttempts,
  paymentIntents,
  invoices,
  transactionLogs,
  blacklist,
  rateLimits,
  requestMetadata,
];
