#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/97645ca05bd2a115d4e1810645debafdb2fcd7c03d4dd3642f125696bd036357/contract';
import startContract from '../../snapshots/97645ca05bd2a115d4e1810645debafdb2fcd7c03d4dd3642f125696bd036357/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e3170711a6fd4bab9279af7436e8b5fa11255ab938480f1ad13bb5775233f8a8/contract';
import endContract from '../../snapshots/e3170711a6fd4bab9279af7436e8b5fa11255ab938480f1ad13bb5775233f8a8/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'marketplace_credentials',
        columns: [
          col('api_key_encrypted', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('api_key_hint', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('api_secret_encrypted', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('rotated_at', 'timestamp(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('store_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('version', 'int4', {
            notNull: true,
            default: lit(1),
            codecRef: { codecId: 'pg/int4@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'marketplace_stores',
        columns: [
          col('created_at', 'timestamp(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('environment', 'text', {
            notNull: true,
            default: lit('PRODUCTION'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('external_seller_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('last_connection_at', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('last_error', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('last_order_sync_at', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('order_import_enabled', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('price_markup_percent', 'numeric(5,2)', {
            notNull: true,
            default: lit('0'),
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 5, scale: 2 } },
          }),
          col('price_sync_enabled', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('provider', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('ACTIVE'),
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('stock_sync_enabled', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
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
        table: 'marketplace_credentials',
        index: 'marketplace_credentials_store_id_key',
        columns: ['store_id'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'marketplace_stores',
        index: 'marketplace_stores_provider_external_seller_id_environment_key',
        columns: ['provider', 'external_seller_id', 'environment'],
        extras: { unique: true },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'marketplace_credentials',
        foreignKey: {
          name: 'marketplace_credentials_store_id_fkey',
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
