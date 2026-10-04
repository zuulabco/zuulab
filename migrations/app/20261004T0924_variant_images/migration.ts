#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/024af94a5f6e25cb0cc7b808f62d90a5c5d551f5bcc0a08458676b98503a6cf5/contract';
import endContract from '../../snapshots/024af94a5f6e25cb0cc7b808f62d90a5c5d551f5bcc0a08458676b98503a6cf5/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/50b533fcf70cd97836b6b1b19becdffe72e09b7058483c7a6cad9c1cb9b01f48/contract';
import startContract from '../../snapshots/50b533fcf70cd97836b6b1b19becdffe72e09b7058483c7a6cad9c1cb9b01f48/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'product_variants',
        column: col('images', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
