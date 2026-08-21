import type {
  AttributeDefinition,
  ProductAttributeValue,
  VariantAttributeValue,
  AttributeValueInput,
} from '@/modules/attributes/types';

export interface IAttributeRepository {
  // ── Definitions ────────────────────────────────────────────────────────────
  findDefinitionsByTemplate(retailTemplateId: string): Promise<AttributeDefinition[]>;
  findProductLevelDefinitions(retailTemplateId: string): Promise<AttributeDefinition[]>;
  findVariantLevelDefinitions(retailTemplateId: string): Promise<AttributeDefinition[]>;
  findDefinitionById(id: string): Promise<AttributeDefinition | null>;

  // ── Product attribute values ───────────────────────────────────────────────
  getProductAttributeValues(productId: string): Promise<ProductAttributeValue[]>;
  setProductAttributeValues(
    productId: string,
    values: AttributeValueInput[]
  ): Promise<ProductAttributeValue[]>;
  deleteProductAttributeValues(productId: string): Promise<void>;

  // ── Variant attribute values ───────────────────────────────────────────────
  getVariantAttributeValues(variantId: string): Promise<VariantAttributeValue[]>;
  setVariantAttributeValues(
    variantId: string,
    values: AttributeValueInput[]
  ): Promise<VariantAttributeValue[]>;
  deleteVariantAttributeValues(variantId: string): Promise<void>;
}
