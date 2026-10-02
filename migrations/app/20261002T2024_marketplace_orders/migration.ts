#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/b452931b02cf8e518fcb8f7422149441a52d3d3a77fce65248b963375b2af30a/contract';
import endContract from '../../snapshots/b452931b02cf8e518fcb8f7422149441a52d3d3a77fce65248b963375b2af30a/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/ec08f5d8d1493e2009e8215d1c261177792cc33c9e284aab47b5f8dfd7dac0c3/contract';
import startContract from '../../snapshots/ec08f5d8d1493e2009e8215d1c261177792cc33c9e284aab47b5f8dfd7dac0c3/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'marketplace_orders',
        columns: [
          col('affects_stock', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('cargo_provider', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamp(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('customer_name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('external_order_number', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('last_error', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('last_modified_at', 'timestamp(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('lines', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('order_date', 'timestamp(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('order_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('package_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('store_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('total_amount', 'numeric(10,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 10, scale: 2 } },
          }),
          col('tracking_number', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('tracking_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('unmatched_count', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('updated_at', 'timestamp(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'marketplace_orders',
        index: 'marketplace_orders_order_id_key',
        columns: ['order_id'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'marketplace_orders',
        index: 'marketplace_orders_status_idx',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'marketplace_orders',
        index: 'marketplace_orders_store_id_package_id_key',
        columns: ['store_id', 'package_id'],
        extras: { unique: true },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'marketplace_orders',
        foreignKey: {
          name: 'marketplace_orders_store_id_fkey',
          columns: ['store_id'],
          references: { schema: 'public', table: 'marketplace_stores', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'marketplace_orders',
        foreignKey: {
          name: 'marketplace_orders_order_id_fkey',
          columns: ['order_id'],
          references: { schema: 'public', table: 'orders', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
