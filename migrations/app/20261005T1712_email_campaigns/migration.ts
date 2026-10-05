#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/13c17381116e27ea419f0cde231147dd00da3554458a9ac803f489285669834e/contract';
import startContract from '../../snapshots/13c17381116e27ea419f0cde231147dd00da3554458a9ac803f489285669834e/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/375b15beb03a2e927691f954f5b7215a88950af1837cd9cd6ff5b814e936b80f/contract';
import endContract from '../../snapshots/375b15beb03a2e927691f954f5b7215a88950af1837cd9cd6ff5b814e936b80f/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'email_campaigns',
        columns: [
          col('content', 'jsonb', { notNull: true, codecRef: { codecId: 'pg/jsonb@1' } }),
          col('created_at', 'timestamp(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('created_by', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('preheader', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('recipient_count', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('sent_at', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('DRAFT'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('subject', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamp(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'email_messages',
        columns: [
          col('bounced_at', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('campaign_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('click_count', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('complained_at', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('created_at', 'timestamp(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('delivered_at', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('error', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('first_clicked_at', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('first_opened_at', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('last_event', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('last_event_at', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('open_count', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('resend_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('sent_at', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('status', 'text', {
            notNull: true,
            default: lit('QUEUED'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('subscriber_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('unsubscribed_at', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'email_webhook_events',
        columns: [
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('received_at', 'timestamp(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'email_campaigns',
        index: 'email_campaigns_status_created_at_idx',
        columns: ['status', 'created_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'email_messages',
        index: 'email_messages_campaign_id_idx',
        columns: ['campaign_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'email_messages',
        index: 'email_messages_email_idx',
        columns: ['email'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'email_messages',
        index: 'email_messages_resend_id_key',
        columns: ['resend_id'],
        extras: { unique: true },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'email_messages',
        foreignKey: {
          name: 'email_messages_campaign_id_fkey',
          columns: ['campaign_id'],
          references: { schema: 'public', table: 'email_campaigns', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
