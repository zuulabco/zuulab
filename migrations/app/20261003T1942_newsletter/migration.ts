#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/50b533fcf70cd97836b6b1b19becdffe72e09b7058483c7a6cad9c1cb9b01f48/contract';
import endContract from '../../snapshots/50b533fcf70cd97836b6b1b19becdffe72e09b7058483c7a6cad9c1cb9b01f48/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e40f6c721605fb07dad5c2d6a59b8a38140a7aaf96085b7e19a8f20269a89ac9/contract';
import startContract from '../../snapshots/e40f6c721605fb07dad5c2d6a59b8a38140a7aaf96085b7e19a8f20269a89ac9/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'newsletter_subscribers',
        columns: [
          col('confirm_email_at', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('confirmed_at', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('consent_agent', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('consent_ip', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('consent_text', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('coupon_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamp(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('source', 'text', {
            notNull: true,
            default: lit('homepage'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('token', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('unsubscribed_at', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('updated_at', 'timestamp(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'coupons',
        column: col('assigned_email', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'coupons',
        column: col('source', 'text', {
          notNull: true,
          default: lit('MANUAL'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.createIndex({
        schema: 'public',
        table: 'newsletter_subscribers',
        index: 'newsletter_subscribers_email_key',
        columns: ['email'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'newsletter_subscribers',
        index: 'newsletter_subscribers_status_idx',
        columns: ['status'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'newsletter_subscribers',
        index: 'newsletter_subscribers_token_key',
        columns: ['token'],
        extras: { unique: true },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
