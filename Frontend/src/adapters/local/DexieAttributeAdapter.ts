import { v4 as uuidv4 } from 'uuid';
import { db } from '@/db/db';
import type { IAttributeRepository } from '@/modules/attributes/repository/IAttributeRepository';
import type {
  AttributeDefinition,
  ProductAttributeValue,
  VariantAttributeValue,
  AttributeValueInput,
} from '@/modules/attributes/types';

export class DexieAttributeAdapter implements IAttributeRepository {
  // ── Definitions ─────────────────────────────────────────────────────────────

  async findDefinitionsByTemplate(retailTemplateId: string): Promise<AttributeDefinition[]> {
    return db.attributeDefinitions
      .where('retailTemplateId')
      .equals(retailTemplateId)
      .sortBy('displayOrder');
  }

  async findProductLevelDefinitions(retailTemplateId: string): Promise<AttributeDefinition[]> {
    // isVariantLevel stored as boolean; Dexie IndexedDB stores booleans as 0/1
    const all = await this.findDefinitionsByTemplate(retailTemplateId);
    return all.filter((d) => !d.isVariantLevel && d.isActive);
  }

  async findVariantLevelDefinitions(retailTemplateId: string): Promise<AttributeDefinition[]> {
    const all = await this.findDefinitionsByTemplate(retailTemplateId);
    return all.filter((d) => d.isVariantLevel && d.isActive);
  }

  async findDefinitionById(id: string): Promise<AttributeDefinition | null> {
    return (await db.attributeDefinitions.get(id)) ?? null;
  }

  // ── Product attribute values ─────────────────────────────────────────────────

  async getProductAttributeValues(productId: string): Promise<ProductAttributeValue[]> {
    return db.productAttributeValues.where('productId').equals(productId).toArray();
  }

  async setProductAttributeValues(
    productId: string,
    values: AttributeValueInput[]
  ): Promise<ProductAttributeValue[]> {
    // Replace all existing values for this product atomically
    await db.transaction('rw', db.productAttributeValues, async () => {
      await db.productAttributeValues.where('productId').equals(productId).delete();
      const records: ProductAttributeValue[] = values.map((v) => ({
        id: uuidv4(),
        productId,
        attributeDefinitionId: v.attributeDefinitionId,
        value: v.value,
      }));
      if (records.length) await db.productAttributeValues.bulkAdd(records);
    });
    return this.getProductAttributeValues(productId);
  }

  async deleteProductAttributeValues(productId: string): Promise<void> {
    await db.productAttributeValues.where('productId').equals(productId).delete();
  }

  // ── Variant attribute values ─────────────────────────────────────────────────

  async getVariantAttributeValues(variantId: string): Promise<VariantAttributeValue[]> {
    return db.variantAttributeValues.where('variantId').equals(variantId).toArray();
  }

  async setVariantAttributeValues(
    variantId: string,
    values: AttributeValueInput[]
  ): Promise<VariantAttributeValue[]> {
    await db.transaction('rw', db.variantAttributeValues, async () => {
      await db.variantAttributeValues.where('variantId').equals(variantId).delete();
      const records: VariantAttributeValue[] = values.map((v) => ({
        id: uuidv4(),
        variantId,
        attributeDefinitionId: v.attributeDefinitionId,
        value: v.value,
      }));
      if (records.length) await db.variantAttributeValues.bulkAdd(records);
    });
    return this.getVariantAttributeValues(variantId);
  }

  async deleteVariantAttributeValues(variantId: string): Promise<void> {
    await db.variantAttributeValues.where('variantId').equals(variantId).delete();
  }
}
