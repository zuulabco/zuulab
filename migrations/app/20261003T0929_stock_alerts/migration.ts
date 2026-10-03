#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/3f51d9dd72463b1d3fea40d7055267dd1ae51fefef9ac8bc2eef578687637a00/contract';
import endContract from '../../snapshots/3f51d9dd72463b1d3fea40d7055267dd1ae51fefef9ac8bc2eef578687637a00/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/d1d54d53246f311021f50089eebf363c8a1d30444a5817120274e57d4af4c5a5/contract';
import startContract from '../../snapshots/d1d54d53246f311021f50089eebf363c8a1d30444a5817120274e57d4af4c5a5/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'stock_alerts',
        columns: [
          col('created_at', 'timestamp(3)', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('email', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('notified_at', 'timestamp(3)', {
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
          col('product_id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('user_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('variant_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'stock_alerts',
        index: 'stock_alerts_product_id_idx',
        columns: ['product_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'stock_alerts',
        foreignKey: {
          name: 'stock_alerts_product_id_fkey',
          columns: ['product_id'],
          references: { schema: 'public', table: 'products', columns: ['id'] },
          onDelete: 'cascade',
          onUpdate: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
