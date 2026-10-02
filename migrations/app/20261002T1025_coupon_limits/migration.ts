#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/ab818d05942e6b4504bad4b1025c533f5246554fc3eb0d99c8c53238afaa2b88/contract';
import startContract from '../../snapshots/ab818d05942e6b4504bad4b1025c533f5246554fc3eb0d99c8c53238afaa2b88/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/cbc26e14b11e003714392972b471404b6e1a678e04e995700c1c56aa22c18960/contract';
import endContract from '../../snapshots/cbc26e14b11e003714392972b471404b6e1a678e04e995700c1c56aa22c18960/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'coupons',
        column: col('max_discount', 'numeric(10,2)', {
          codecRef: { codecId: 'pg/numeric@1', typeParams: { precision: 10, scale: 2 } },
        }),
      }),
      this.createIndex({
        schema: 'public',
        table: 'coupon_usages',
        index: 'coupon_usages_coupon_id_order_id_key',
        columns: ['coupon_id', 'order_id'],
        extras: { unique: true },
      }),
      this.createIndex({
        schema: 'public',
        table: 'coupon_usages',
        index: 'coupon_usages_coupon_id_user_id_idx',
        columns: ['coupon_id', 'user_id'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
