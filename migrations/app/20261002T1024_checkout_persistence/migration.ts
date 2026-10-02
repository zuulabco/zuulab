#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/75115e7b4751c6f8f9ac5046ab9049957cb005f1c83dd911bb78a63e4f66f2f7/contract';
import startContract from '../../snapshots/75115e7b4751c6f8f9ac5046ab9049957cb005f1c83dd911bb78a63e4f66f2f7/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/ab818d05942e6b4504bad4b1025c533f5246554fc3eb0d99c8c53238afaa2b88/contract';
import endContract from '../../snapshots/ab818d05942e6b4504bad4b1025c533f5246554fc3eb0d99c8c53238afaa2b88/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createNativeEnumType({
        schema: 'public',
        typeName: 'StockHoldState',
        members: ['NONE', 'HELD', 'COMMITTED', 'RELEASED'],
      }),
      this.addColumn({
        schema: 'public',
        table: 'orders',
        column: col('billing_snapshot', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'orders',
        column: col('channel', 'text', {
          notNull: true,
          default: lit('DIRECT'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'orders',
        column: col('checkout_key', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'orders',
        column: col('email', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'orders',
        column: col('paid_at', 'timestamp(3)', {
          codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'orders',
        column: col('payment_expires_at', 'timestamp(3)', {
          codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'orders',
        column: col('shipping_method', 'text', {
          notNull: true,
          default: lit('STANDARD'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'orders',
        column: col('stock_state', '"StockHoldState"', {
          notNull: true,
          default: lit('NONE'),
          codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'StockHoldState' } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'payments',
        column: col('attempt_number', 'int4', {
          notNull: true,
          default: lit(1),
          codecRef: { codecId: 'pg/int4@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'payments',
        column: col('expires_at', 'timestamp(3)', {
          codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'payments',
        column: col('installment_count', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'payments',
        column: col('merchant_oid', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'payments',
        column: col('paid_amount', 'numeric(10,2)', {
          codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 10, scale: 2 } },
        }),
      }),
      this.createIndex({
        schema: 'public',
        table: 'order_items',
        index: 'order_items_order_id_idx',
        columns: ['order_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'order_status_history',
        index: 'order_status_history_order_id_idx',
        columns: ['order_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'orders',
        index: 'orders_checkout_key_key',
        columns: ['checkout_key'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'orders',
        index: 'orders_status_created_at_idx',
        columns: ['status', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'orders',
        index: 'orders_stock_state_payment_expires_at_idx',
        columns: ['stock_state', 'payment_expires_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'orders',
        index: 'orders_user_id_idx',
        columns: ['user_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'payments',
        index: 'payments_merchant_oid_key',
        columns: ['merchant_oid'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'payments',
        index: 'payments_order_id_idx',
        columns: ['order_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'payments',
        index: 'payments_status_expires_at_idx',
        columns: ['status', 'expires_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'product_collections',
        index: 'product_collections_collection_id_idx',
        columns: ['collection_id'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
