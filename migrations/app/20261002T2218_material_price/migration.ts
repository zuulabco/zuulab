#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/5a4e5b15e17b99f0e2fa41e601fc2051fb07a92d0f103d1f967b39585586b4a6/contract';
import endContract from '../../snapshots/5a4e5b15e17b99f0e2fa41e601fc2051fb07a92d0f103d1f967b39585586b4a6/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/5abbddd2ea45b1320ec9198ddb831887a239528229f0bda5afd871cf35f21ae3/contract';
import startContract from '../../snapshots/5abbddd2ea45b1320ec9198ddb831887a239528229f0bda5afd871cf35f21ae3/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'material_stocks',
        column: col('price_per_kg_tl', 'numeric(10,2)', {
          codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 10, scale: 2 } },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
