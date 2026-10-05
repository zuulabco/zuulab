#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/7b57f971e71f0d8f2cc8581cf1eb0c49157a82fc878000b23faddca402218629/contract';
import startContract from '../../snapshots/7b57f971e71f0d8f2cc8581cf1eb0c49157a82fc878000b23faddca402218629/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/cf49718ab263910973d595e9a338964c3a632dd2d0200a9e33b4966d1a1d017f/contract';
import endContract from '../../snapshots/cf49718ab263910973d595e9a338964c3a632dd2d0200a9e33b4966d1a1d017f/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'email_consents',
        columns: [
          col('consent_agent', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('consent_ip', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('consent_text', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamp(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('granted_at', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('source', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamp(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('user_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('withdrawn_at', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'email_consents',
        index: 'email_consents_email_key',
        columns: ['email'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'email_consents',
        index: 'email_consents_status_idx',
        columns: ['status'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
