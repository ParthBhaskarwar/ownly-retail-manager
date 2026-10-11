/**
 * AttributeService — the EAV-lite attribute system.
 *
 * Ported from Frontend/src/modules/attributes/.
 *
 * `enum_values` is a jsonb column, so Postgres hands it back as a parsed
 * array. The frontend contract expects `enumValues` to be a JSON *string*
 * (it calls JSON.parse on it), so it is re-stringified on the way out. That
 * keeps AttributeFieldRenderer and parseEnumValues working unchanged.
 */

import { randomUUID } from 'crypto';
import type { Knex } from 'knex';
import { db } from '@/db/client';
import type { AttributeDefinition, AttributeValueInput } from '@/types/domain';

interface AttributeDefinitionRow extends Omit<AttributeDefinition, 'enumValues' | 'applicableCategories'> {
  enumValues: string[] | null;
  applicableCategories: string[] | null;
}

function toDefinition(row: AttributeDefinitionRow): AttributeDefinition {
  return {
    ...row,
    enumValues: row.enumValues ? JSON.stringify(row.enumValues) : null,
    applicableCategories: row.applicableCategories ? JSON.stringify(row.applicableCategories) : null,
  };
}

export const AttributeService = {
  async findDefinitionsByTemplate(retailTemplateId: string): Promise<AttributeDefinition[]> {
    const rows = (await db('attribute_definitions')
      .where({ retail_template_id: retailTemplateId, is_active: true })
      .orderBy('display_order', 'asc')) as AttributeDefinitionRow[];
    return rows.map(toDefinition);
  },

  async findProductLevelDefinitions(retailTemplateId: string): Promise<AttributeDefinition[]> {
    const all = await this.findDefinitionsByTemplate(retailTemplateId);
    return all.filter((d) => !d.isVariantLevel);
  },

  async findVariantLevelDefinitions(retailTemplateId: string): Promise<AttributeDefinition[]> {
    const all = await this.findDefinitionsByTemplate(retailTemplateId);
    return all.filter((d) => d.isVariantLevel);
  },

  /**
   * Filters input attribute values so only those applicable to categoryId (if provided) are retained.
   */
  async filterApplicableAttributes(
    categoryId: string | null | undefined,
    values: AttributeValueInput[],
    trx?: Knex | Knex.Transaction
  ): Promise<AttributeValueInput[]> {
    if (!values.length) return [];
    const conn = trx ?? db;

    let categoryName: string | null = null;
    if (categoryId) {
      const cat = await conn('categories').where({ id: categoryId }).first();
      if (cat) categoryName = cat.name;
    }

    const defIds = values.map((v) => v.attributeDefinitionId);
    const defRows = await conn('attribute_definitions').whereIn('id', defIds);
    const defMap = new Map<string, AttributeDefinitionRow>(defRows.map((r: AttributeDefinitionRow) => [r.id, r]));

    return values.filter((v) => {
      const def = defMap.get(v.attributeDefinitionId);
      if (!def) return false;
      const applicable = def.applicableCategories;
      if (!applicable || applicable.length === 0) return true; // global attribute
      if (!categoryName) return true;
      return applicable.some((c) => c.toLowerCase() === categoryName!.toLowerCase());
    });
  },

  /** Replaces a product's attribute values. Purges stale ones, upserts new ones. */
  async replaceProductAttributeValues(
    productId: string,
    categoryId: string | null | undefined,
    values: AttributeValueInput[],
    trx?: Knex | Knex.Transaction
  ): Promise<void> {
    const conn = trx ?? db;
    const filteredValues = await this.filterApplicableAttributes(categoryId, values, conn);

    // Delete existing product_attribute_values for this product
    await conn('product_attribute_values').where({ product_id: productId }).delete();

    if (!filteredValues.length) return;

    await conn('product_attribute_values')
      .insert(
        filteredValues.map((v) => ({
          id: randomUUID(),
          product_id: productId,
          attribute_definition_id: v.attributeDefinitionId,
          value: v.value,
        }))
      );
  },

  /** Replaces a product's attribute values. Upsert on (product, definition). */
  async setProductAttributeValues(
    productId: string,
    values: AttributeValueInput[],
    trx?: Knex.Transaction
  ): Promise<void> {
    if (!values.length) return;
    const conn = trx ?? db;
    await conn('product_attribute_values')
      .insert(
        values.map((v) => ({
          id: randomUUID(),
          product_id: productId,
          attribute_definition_id: v.attributeDefinitionId,
          value: v.value,
        }))
      )
      .onConflict(['product_id', 'attribute_definition_id'])
      .merge(['value']);
  },

  async setVariantAttributeValues(
    variantId: string,
    values: AttributeValueInput[],
    trx?: Knex.Transaction
  ): Promise<void> {
    if (!values.length) return;
    const conn = trx ?? db;
    await conn('variant_attribute_values')
      .insert(
        values.map((v) => ({
          id: randomUUID(),
          variant_id: variantId,
          attribute_definition_id: v.attributeDefinitionId,
          value: v.value,
        }))
      )
      .onConflict(['variant_id', 'attribute_definition_id'])
      .merge(['value']);
  },
};

export { toDefinition };
export type { AttributeDefinitionRow };
