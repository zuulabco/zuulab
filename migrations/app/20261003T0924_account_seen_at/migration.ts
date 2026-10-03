#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/5a4e5b15e17b99f0e2fa41e601fc2051fb07a92d0f103d1f967b39585586b4a6/contract';
import startContract from '../../snapshots/5a4e5b15e17b99f0e2fa41e601fc2051fb07a92d0f103d1f967b39585586b4a6/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/d1d54d53246f311021f50089eebf363c8a1d30444a5817120274e57d4af4c5a5/contract';
import endContract from '../../snapshots/d1d54d53246f311021f50089eebf363c8a1d30444a5817120274e57d4af4c5a5/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'users',
        column: col('orders_seen_at', 'timestamp(3)', {
          codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'users',
        column: col('support_seen_at', 'timestamp(3)', {
          codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
        }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
