#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/024af94a5f6e25cb0cc7b808f62d90a5c5d551f5bcc0a08458676b98503a6cf5/contract';
import startContract from '../../snapshots/024af94a5f6e25cb0cc7b808f62d90a5c5d551f5bcc0a08458676b98503a6cf5/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/507ae5e0d725f70ced4e3c372caec7591fed478eeb78040d3d0723407ad647d5/contract';
import endContract from '../../snapshots/507ae5e0d725f70ced4e3c372caec7591fed478eeb78040d3d0723407ad647d5/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'orders',
        column: col('anonymous_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'orders',
        column: col('attribution', 'jsonb', { codecRef: { codecId: 'pg/jsonb@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'orders',
        column: col('marketing_consent', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
