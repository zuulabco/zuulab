#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/732f38ac913863b73f8e6e187a534bf21ffe437311be873e130c22f8d16b90a4/contract';
import endContract from '../../snapshots/732f38ac913863b73f8e6e187a534bf21ffe437311be873e130c22f8d16b90a4/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/b452931b02cf8e518fcb8f7422149441a52d3d3a77fce65248b963375b2af30a/contract';
import startContract from '../../snapshots/b452931b02cf8e518fcb8f7422149441a52d3d3a77fce65248b963375b2af30a/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'marketplace_push_batches',
        columns: [
          col('batch_request_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('checked_at', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('created_at', 'timestamp(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('failed_count', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('items', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('store_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'marketplace_listings',
        column: col('push_batch_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'marketplace_listings',
        column: col('push_error', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'marketplace_listings',
        column: col('push_error_at', 'timestamp(3)', {
          codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'marketplace_listings',
        column: col('pushed_at', 'timestamp(3)', {
          codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'marketplace_listings',
        column: col('pushed_list_price', 'numeric(10,2)', {
          codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 10, scale: 2 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'marketplace_listings',
        column: col('pushed_quantity', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'marketplace_listings',
        column: col('pushed_sale_price', 'numeric(10,2)', {
          codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 10, scale: 2 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'marketplace_stores',
        column: col('last_push_at', 'timestamp(3)', {
          codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
        }),
      }),
      this.createIndex({
        schema: 'public',
        table: 'marketplace_push_batches',
        index: 'marketplace_push_batches_status_created_at_idx',
        columns: ['status', 'created_at'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'marketplace_push_batches',
        foreignKey: {
          name: 'marketplace_push_batches_store_id_fkey',
          columns: ['store_id'],
          references: { schema: 'public', table: 'marketplace_stores', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
