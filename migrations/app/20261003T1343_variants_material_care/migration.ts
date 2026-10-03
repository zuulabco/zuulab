#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/3dd20eb6730fbda10e7b47ef4221456ab340849514681eb099abe1c4c99fb2f2/contract';
import startContract from '../../snapshots/3dd20eb6730fbda10e7b47ef4221456ab340849514681eb099abe1c4c99fb2f2/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e40f6c721605fb07dad5c2d6a59b8a38140a7aaf96085b7e19a8f20269a89ac9/contract';
import endContract from '../../snapshots/e40f6c721605fb07dad5c2d6a59b8a38140a7aaf96085b7e19a8f20269a89ac9/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'product_materials',
        column: col('care', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'product_variants',
        column: col('image_url', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'product_variants',
        column: col('options', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'products',
        column: col('variant_options', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
