#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/97645ca05bd2a115d4e1810645debafdb2fcd7c03d4dd3642f125696bd036357/contract';
import endContract from '../../snapshots/97645ca05bd2a115d4e1810645debafdb2fcd7c03d4dd3642f125696bd036357/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/a4046d88f2b00c18f5ba1f2e61ad66d1dce6a06e4eed2e5668bf3b12357b7431/contract';
import startContract from '../../snapshots/a4046d88f2b00c18f5ba1f2e61ad66d1dce6a06e4eed2e5668bf3b12357b7431/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'rate_limits',
        columns: [
          col('count', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('key', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('window_ends_at', 'timestamp(3)', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamp-temporal@1', typeParams: { precision: 3 } },
          }),
        ],
        constraints: [primaryKey(['key'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'rate_limits',
        index: 'rate_limits_window_ends_at_idx',
        columns: ['window_ends_at'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
