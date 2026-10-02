#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/e3170711a6fd4bab9279af7436e8b5fa11255ab938480f1ad13bb5775233f8a8/contract';
import startContract from '../../snapshots/e3170711a6fd4bab9279af7436e8b5fa11255ab938480f1ad13bb5775233f8a8/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/ec08f5d8d1493e2009e8215d1c261177792cc33c9e284aab47b5f8dfd7dac0c3/contract';
import endContract from '../../snapshots/ec08f5d8d1493e2009e8215d1c261177792cc33c9e284aab47b5f8dfd7dac0c3/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'marketplace_listings',
        columns: [
          col('archived', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('attributes', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('barcode', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('brand', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('category_name', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('created_at', 'timestamp(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('external_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('ignored', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('image_urls', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
          col('last_seen_at', 'timestamp(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('list_price', 'numeric(10,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 10, scale: 2 } },
          }),
          col('match_method', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('on_sale', 'bool', {
            notNull: true,
            default: lit(false),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('product_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('product_main_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('product_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('quantity', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('sale_price', 'numeric(10,2)', {
            notNull: true,
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 10, scale: 2 } },
          }),
          col('stock_code', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('store_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('target_list_price', 'numeric(10,2)', {
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 10, scale: 2 } },
          }),
          col('target_sale_price', 'numeric(10,2)', {
            codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 10, scale: 2 } },
          }),
          col('title', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updated_at', 'timestamp(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('variant_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('vat_rate', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'marketplace_listings',
        index: 'marketplace_listings_product_id_idx',
        columns: ['product_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'marketplace_listings',
        index: 'marketplace_listings_product_main_id_idx',
        columns: ['product_main_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'marketplace_listings',
        index: 'marketplace_listings_store_id_barcode_key',
        columns: ['store_id', 'barcode'],
        extras: { unique: true },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'marketplace_listings',
        foreignKey: {
          name: 'marketplace_listings_store_id_fkey',
          columns: ['store_id'],
          references: { schema: 'public', table: 'marketplace_stores', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'marketplace_listings',
        foreignKey: {
          name: 'marketplace_listings_product_id_fkey',
          columns: ['product_id'],
          references: { schema: 'public', table: 'products', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'marketplace_listings',
        foreignKey: {
          name: 'marketplace_listings_variant_id_fkey',
          columns: ['variant_id'],
          references: { schema: 'public', table: 'product_variants', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
