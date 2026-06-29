import type { Knex } from 'knex';
import type { SispTables } from '../../../application/config';

export async function createSispTables(db: Knex, tables: SispTables): Promise<void> {
  await createTransactionsTable(db, tables);
  await createTransactionItemsTable(db, tables);
  await createInvoicesTable(db, tables);
  await createRequestMetadataTable(db, tables);
  await createRateLimitsTable(db, tables);
  await createBlacklistTable(db, tables);
}

async function createTransactionsTable(db: Knex, tables: SispTables): Promise<void> {
  if (await db.schema.hasTable(tables.transactions)) {
    return;
  }

  await db.schema.createTable(tables.transactions, (table) => {
    table.bigIncrements('id');
    table.string('merchant_ref').notNullable();
    table.string('merchant_session').notNullable();
    table.bigInteger('amount_cents').notNullable().defaultTo(0);
    table.string('currency').notNullable().defaultTo('132');
    table.string('status').notNullable().defaultTo('pending');
    table.string('transaction_code').nullable();
    table.string('transaction_id').nullable();
    table.string('message_type').nullable();
    table.string('response_code').nullable();
    table.text('merchant_response').nullable();
    table.text('fingerprint').nullable();
    table.text('payload', 'longtext').nullable();
    table.string('customer_name').nullable();
    table.string('customer_email').nullable();
    table.string('customer_phone').nullable();
    table.string('customer_country').nullable();
    table.string('customer_city').nullable();
    table.string('customer_address').nullable();
    table.string('customer_postal_code').nullable();
    table.string('locale', 5).notNullable().defaultTo('pt');
    table.timestamp('cancelled_at').nullable();
    table.timestamp('refunded_at').nullable();
    table.timestamps();
    table.index(['merchant_ref', 'merchant_session', 'status', 'message_type']);
    table.index(['transaction_id']);
    table.index(['customer_email']);
  });
}

async function createTransactionItemsTable(db: Knex, tables: SispTables): Promise<void> {
  if (await db.schema.hasTable(tables.transactionItems)) {
    return;
  }

  await db.schema.createTable(tables.transactionItems, (table) => {
    table.bigIncrements('id');
    table
      .bigInteger('transaction_id')
      .unsigned()
      .notNullable()
      .references('id')
      .inTable(tables.transactions)
      .onDelete('CASCADE');
    table.string('product_id').nullable();
    table.string('product_name').notNullable();
    table.integer('quantity').notNullable().defaultTo(1);
    table.bigInteger('unit_price_cents').notNullable();
    table.bigInteger('total_price_cents').notNullable();
    table.text('description').nullable();
    table.json('metadata').nullable();
    table.timestamps();
    table.index(['transaction_id', 'product_id']);
  });
}

async function createInvoicesTable(db: Knex, tables: SispTables): Promise<void> {
  if (await db.schema.hasTable(tables.invoices)) {
    return;
  }

  await db.schema.createTable(tables.invoices, (table) => {
    table.bigIncrements('id');
    table
      .bigInteger('transaction_id')
      .unsigned()
      .notNullable()
      .unique()
      .references('id')
      .inTable(tables.transactions)
      .onDelete('CASCADE');
    table.string('invoice_number').notNullable().unique();
    table.date('invoice_date').notNullable();
    table.date('due_date').nullable();
    table.string('status').notNullable().defaultTo('pending');
    table.string('customer_name').nullable();
    table.string('customer_email').nullable();
    table.string('customer_city').nullable();
    table.string('customer_address').nullable();
    table.string('customer_country').nullable();
    table.text('notes').nullable();
    table.string('pdf_path').nullable();
    table.json('metadata').nullable();
    table.timestamps();
    table.index(['invoice_number', 'status']);
  });
}

async function createRequestMetadataTable(db: Knex, tables: SispTables): Promise<void> {
  if (await db.schema.hasTable(tables.requestMetadata)) {
    return;
  }

  await db.schema.createTable(tables.requestMetadata, (table) => {
    table.bigIncrements('id');
    table
      .bigInteger('transaction_id')
      .unsigned()
      .nullable()
      .references('id')
      .inTable(tables.transactions)
      .onDelete('CASCADE');
    table.string('ip_address').notNullable();
    table.string('user_agent').nullable();
    table.string('referer').nullable();
    table.string('country_code').nullable();
    table.string('country_name').nullable();
    table.string('region').nullable();
    table.string('city').nullable();
    table.decimal('latitude', 10, 8).nullable();
    table.decimal('longitude', 11, 8).nullable();
    table.string('isp').nullable();
    table.string('device_type').nullable();
    table.string('browser').nullable();
    table.string('os').nullable();
    table.string('device_fingerprint').nullable();
    table.integer('response_time_ms').nullable();
    table.string('api_version').nullable();
    table.boolean('is_vpn').notNullable().defaultTo(false);
    table.boolean('is_proxy').notNullable().defaultTo(false);
    table.boolean('is_mobile').notNullable().defaultTo(false);
    table.integer('risk_score').notNullable().defaultTo(0);
    table.string('risk_reason').nullable();
    table.json('custom_metadata').nullable();
    table.timestamps();
    table.index(['ip_address', 'created_at']);
    table.index(['country_code']);
    table.index(['device_fingerprint']);
    table.index(['risk_score']);
    table.index(['transaction_id']);
  });
}

async function createRateLimitsTable(db: Knex, tables: SispTables): Promise<void> {
  if (await db.schema.hasTable(tables.rateLimits)) {
    return;
  }

  await db.schema.createTable(tables.rateLimits, (table) => {
    table.bigIncrements('id');
    table.string('identifier').notNullable();
    table.string('limit_type').notNullable();
    table.string('context').nullable();
    table.integer('hits').notNullable().defaultTo(1);
    table.integer('limit').notNullable().defaultTo(100);
    table.integer('window_seconds').notNullable().defaultTo(3600);
    table.timestamp('reset_at').notNullable();
    table.boolean('is_blocked').notNullable().defaultTo(false);
    table.timestamp('blocked_until').nullable();
    table.timestamps();
    table.index(['identifier', 'limit_type', 'reset_at']);
    table.index(['is_blocked']);
    table.index(['reset_at']);
  });
}

async function createBlacklistTable(db: Knex, tables: SispTables): Promise<void> {
  if (await db.schema.hasTable(tables.blacklist)) {
    return;
  }

  await db.schema.createTable(tables.blacklist, (table) => {
    table.bigIncrements('id');
    table.string('type').notNullable();
    table.string('value').notNullable();
    table.string('reason').nullable();
    table.string('severity').notNullable();
    table.text('notes').nullable();
    table.string('added_by').nullable();
    table.timestamp('expires_at').nullable();
    table.timestamps();
    table.unique(['type', 'value']);
    table.index(['expires_at']);
    table.index(['severity']);
  });
}
