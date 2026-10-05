#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/13c17381116e27ea419f0cde231147dd00da3554458a9ac803f489285669834e/contract';
import endContract from '../../snapshots/13c17381116e27ea419f0cde231147dd00da3554458a9ac803f489285669834e/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/507ae5e0d725f70ced4e3c372caec7591fed478eeb78040d3d0723407ad647d5/contract';
import startContract from '../../snapshots/507ae5e0d725f70ced4e3c372caec7591fed478eeb78040d3d0723407ad647d5/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'marketing_events',
        columns: [
          col('anonymous_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamp(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('event_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('occurred_at', 'timestamp(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('order_number', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('page_path', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('product_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('session_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('utm_campaign', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('utm_content', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('utm_medium', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('utm_source', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('value', 'numeric(12,2)', {
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 12, scale: 2 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'marketing_events',
        index: 'marketing_events_anonymous_id_idx',
        columns: ['anonymous_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'marketing_events',
        index: 'marketing_events_event_id_key',
        columns: ['event_id'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'marketing_events',
        index: 'marketing_events_name_occurred_at_idx',
        columns: ['name', 'occurred_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'marketing_events',
        index: 'marketing_events_occurred_at_idx',
        columns: ['occurred_at'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
