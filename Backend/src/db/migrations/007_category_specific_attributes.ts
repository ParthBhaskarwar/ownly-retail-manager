import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('attribute_definitions', 'applicable_categories');
  if (!hasColumn) {
    await knex.schema.alterTable('attribute_definitions', (t) => {
      t.jsonb('applicable_categories').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('attribute_definitions', 'applicable_categories');
  if (hasColumn) {
    await knex.schema.alterTable('attribute_definitions', (t) => {
      t.dropColumn('applicable_categories');
    });
  }
}
