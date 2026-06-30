CREATE TABLE IF NOT EXISTS "sisp_transactions" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "merchant_ref" TEXT NOT NULL,
  "merchant_session" TEXT NOT NULL,
  "amount_cents" BIGINT NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT '132',
  "status" TEXT NOT NULL DEFAULT 'pending',
  "transaction_code" TEXT,
  "transaction_id" TEXT,
  "message_type" TEXT,
  "response_code" TEXT,
  "merchant_response" TEXT,
  "fingerprint" TEXT,
  "payload" TEXT,
  "customer_name" TEXT,
  "customer_email" TEXT,
  "customer_phone" TEXT,
  "customer_country" TEXT,
  "customer_city" TEXT,
  "customer_address" TEXT,
  "customer_postal_code" TEXT,
  "locale" TEXT NOT NULL DEFAULT 'pt',
  "cancelled_at" DATETIME,
  "refunded_at" DATETIME,
  "created_at" DATETIME,
  "updated_at" DATETIME
);

CREATE TABLE IF NOT EXISTS "sisp_transaction_items" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "transaction_id" BIGINT NOT NULL,
  "product_id" TEXT,
  "product_name" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unit_price_cents" BIGINT NOT NULL,
  "total_price_cents" BIGINT NOT NULL,
  "description" TEXT,
  "metadata" TEXT,
  "created_at" DATETIME,
  "updated_at" DATETIME
);

CREATE TABLE IF NOT EXISTS "sisp_transaction_attempts" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "transaction_id" BIGINT NOT NULL,
  "attempt_number" INTEGER NOT NULL,
  "merchant_ref" TEXT NOT NULL,
  "merchant_session" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "gateway_transaction_id" TEXT,
  "message_type" TEXT,
  "response_code" TEXT,
  "merchant_response" TEXT,
  "fingerprint" TEXT,
  "payload" TEXT,
  "callback_payload" TEXT,
  "failure_reason" TEXT,
  "submitted_at" DATETIME,
  "callback_received_at" DATETIME,
  "superseded_at" DATETIME,
  "created_at" DATETIME,
  "updated_at" DATETIME
);

CREATE TABLE IF NOT EXISTS "sisp_payment_intents" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "idempotency_key" TEXT NOT NULL,
  "transaction_id" BIGINT,
  "status" TEXT NOT NULL DEFAULT 'processing',
  "failure_reason" TEXT,
  "created_at" DATETIME,
  "updated_at" DATETIME
);

CREATE UNIQUE INDEX IF NOT EXISTS "sisp_payment_intents_idempotency_key_key" ON "sisp_payment_intents"("idempotency_key");

CREATE TABLE IF NOT EXISTS "sisp_invoices" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "transaction_id" BIGINT NOT NULL,
  "invoice_number" TEXT NOT NULL,
  "invoice_date" DATETIME NOT NULL,
  "due_date" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "customer_name" TEXT,
  "customer_email" TEXT,
  "customer_city" TEXT,
  "customer_address" TEXT,
  "customer_country" TEXT,
  "notes" TEXT,
  "pdf_path" TEXT,
  "metadata" TEXT,
  "created_at" DATETIME,
  "updated_at" DATETIME
);

CREATE UNIQUE INDEX IF NOT EXISTS "sisp_invoices_transaction_id_key" ON "sisp_invoices"("transaction_id");
CREATE UNIQUE INDEX IF NOT EXISTS "sisp_invoices_invoice_number_key" ON "sisp_invoices"("invoice_number");

CREATE TABLE IF NOT EXISTS "sisp_transaction_logs" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "transaction_id" BIGINT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'model',
  "changed_attributes" TEXT NOT NULL,
  "old_values" TEXT,
  "new_values" TEXT,
  "created_at" DATETIME,
  "updated_at" DATETIME
);

CREATE TABLE IF NOT EXISTS "sisp_blacklist" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "type" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "reason" TEXT,
  "severity" TEXT NOT NULL,
  "notes" TEXT,
  "added_by" TEXT,
  "expires_at" DATETIME,
  "created_at" DATETIME,
  "updated_at" DATETIME
);

CREATE UNIQUE INDEX IF NOT EXISTS "sisp_blacklist_type_value_key" ON "sisp_blacklist"("type", "value");

CREATE TABLE IF NOT EXISTS "sisp_rate_limits" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "identifier" TEXT NOT NULL,
  "limit_type" TEXT NOT NULL,
  "context" TEXT,
  "hits" INTEGER NOT NULL DEFAULT 1,
  "limit" INTEGER NOT NULL DEFAULT 100,
  "window_seconds" INTEGER NOT NULL DEFAULT 3600,
  "reset_at" DATETIME NOT NULL,
  "is_blocked" BOOLEAN NOT NULL DEFAULT false,
  "blocked_until" DATETIME,
  "created_at" DATETIME,
  "updated_at" DATETIME
);

CREATE TABLE IF NOT EXISTS "sisp_request_metadata" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "transaction_id" BIGINT,
  "ip_address" TEXT NOT NULL,
  "user_agent" TEXT,
  "referer" TEXT,
  "country_code" TEXT,
  "country_name" TEXT,
  "region" TEXT,
  "city" TEXT,
  "latitude" REAL,
  "longitude" REAL,
  "isp" TEXT,
  "device_type" TEXT,
  "browser" TEXT,
  "os" TEXT,
  "device_fingerprint" TEXT,
  "response_time_ms" INTEGER,
  "api_version" TEXT,
  "is_vpn" BOOLEAN NOT NULL DEFAULT false,
  "is_proxy" BOOLEAN NOT NULL DEFAULT false,
  "is_mobile" BOOLEAN NOT NULL DEFAULT false,
  "risk_score" INTEGER NOT NULL DEFAULT 0,
  "risk_reason" TEXT,
  "custom_metadata" TEXT,
  "created_at" DATETIME,
  "updated_at" DATETIME
);
