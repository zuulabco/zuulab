#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/375b15beb03a2e927691f954f5b7215a88950af1837cd9cd6ff5b814e936b80f/contract';
import startContract from '../../snapshots/375b15beb03a2e927691f954f5b7215a88950af1837cd9cd6ff5b814e936b80f/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/7b57f971e71f0d8f2cc8581cf1eb0c49157a82fc878000b23faddca402218629/contract';
import endContract from '../../snapshots/7b57f971e71f0d8f2cc8581cf1eb0c49157a82fc878000b23faddca402218629/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'email_optouts',
        columns: [
          col('created_at', 'timestamp(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('source', 'text', {
            notNull: true,
            default: lit('review_request'),
            codecRef: { codecId: 'pg/text@1' },
          }),
        ],
        constraints: [primaryKey(['email'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'email_campaigns',
        column: col('automation_key', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'email_campaigns',
        column: col('kind', 'text', {
          notNull: true,
          default: lit('CAMPAIGN'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'email_messages',
        column: col('order_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.createIndex({
        schema: 'public',
        table: 'email_campaigns',
        index: 'email_campaigns_automation_key_key',
        columns: ['automation_key'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'email_messages',
        index: 'email_messages_campaign_id_order_id_key',
        columns: ['campaign_id', 'order_id'],
        extras: { unique: true },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
