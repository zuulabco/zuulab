#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/5abbddd2ea45b1320ec9198ddb831887a239528229f0bda5afd871cf35f21ae3/contract';
import endContract from '../../snapshots/5abbddd2ea45b1320ec9198ddb831887a239528229f0bda5afd871cf35f21ae3/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/732f38ac913863b73f8e6e187a534bf21ffe437311be873e130c22f8d16b90a4/contract';
import startContract from '../../snapshots/732f38ac913863b73f8e6e187a534bf21ffe437311be873e130c22f8d16b90a4/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'production_orders',
        column: col('grams_per_unit', 'numeric(10,2)', {
          codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 10, scale: 2 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'production_orders',
        column: col('material_consumed_grams', 'numeric(12,2)', {
          codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 12, scale: 2 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'production_orders',
        column: col('material_stock_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'production_orders',
        foreignKey: {
          name: 'production_orders_material_stock_id_fkey',
          columns: ['material_stock_id'],
          references: { schema: 'public', table: 'material_stocks', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
