#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/a4046d88f2b00c18f5ba1f2e61ad66d1dce6a06e4eed2e5668bf3b12357b7431/contract';
import endContract from '../../snapshots/a4046d88f2b00c18f5ba1f2e61ad66d1dce6a06e4eed2e5668bf3b12357b7431/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/cbc26e14b11e003714392972b471404b6e1a678e04e995700c1c56aa22c18960/contract';
import startContract from '../../snapshots/cbc26e14b11e003714392972b471404b6e1a678e04e995700c1c56aa22c18960/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createNativeEnumType({
        schema: 'public',
        typeName: 'SupportAuthorType',
        members: ['CUSTOMER', 'STAFF', 'SYSTEM'],
      }),
      this.addColumn({
        schema: 'public',
        table: 'support_messages',
        column: col('author_type', '"SupportAuthorType"', {
          notNull: true,
          default: lit('CUSTOMER'),
          codecRef: { codecId: 'pg/enum@1', typeParams: { typeName: 'SupportAuthorType' } },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'support_messages',
        column: col('author_user_id', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'support_tickets',
        column: col('channel', 'text', {
          notNull: true,
          default: lit('ACCOUNT'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.createIndex({
        schema: 'public',
        table: 'support_messages',
        index: 'support_messages_ticket_id_idx',
        columns: ['ticket_id'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'support_tickets',
        index: 'support_tickets_status_updated_at_idx',
        columns: ['status', 'updated_at'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'support_tickets',
        index: 'support_tickets_user_id_idx',
        columns: ['user_id'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'support_messages',
        foreignKey: {
          name: 'support_messages_author_user_id_fkey',
          columns: ['author_user_id'],
          references: { schema: 'public', table: 'users', columns: ['id'] },
          onDelete: 'setNull',
          onUpdate: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
