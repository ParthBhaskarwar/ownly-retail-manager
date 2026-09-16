/**
 * Attributes module — AttributeDefinition, ProductAttributeValue, VariantAttributeValue.
 *
 * This is the EAV-lite system that enables retail-type extensibility without
 * hard-coding columns on the Product table.
 */

// ─── Attribute Definition ─────────────────────────────────────────────────────

export type AttributeDataType = 'TEXT' | 'NUMBER' | 'BOOLEAN' | 'ENUM';

export interface AttributeDefinition {
  id: string;
  retailTemplateId: string;
  name: string;
  dataType: AttributeDataType;
  isRequired: boolean;
  isVariantLevel: boolean;  // true = differentiates variants (e.g. Size); false = product-level
  enumValues: string | null; // JSON-serialized string[]; only for dataType='ENUM'
  applicableCategories?: string | null; // JSON-serialized string[] of category names, or null/empty for global
  displayOrder: number;
  isActive: boolean;
  createdAt: string;
}

/** Parses enumValues JSON string into an array. Returns [] if null or invalid. */
export function parseEnumValues(def: AttributeDefinition): string[] {
  if (!def.enumValues) return [];
  try {
    return JSON.parse(def.enumValues) as string[];
  } catch {
    return [];
  }
}

/** Parses applicableCategories JSON string into an array. Returns [] if null or applicable to all. */
export function parseApplicableCategories(def: AttributeDefinition): string[] {
  if (!def.applicableCategories) return [];
  try {
    const parsed = typeof def.applicableCategories === 'string' ? JSON.parse(def.applicableCategories) : def.applicableCategories;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// ─── Attribute Values ─────────────────────────────────────────────────────────

/** One row per (product, attributeDefinition). Product-level attributes only. */
export interface ProductAttributeValue {
  id: string;
  productId: string;
  attributeDefinitionId: string;
  value: string; // always stored as string; parsed by application per dataType
}

/** One row per (variant, attributeDefinition). Variant-level attributes only (e.g. Size). */
export interface VariantAttributeValue {
  id: string;
  variantId: string;
  attributeDefinitionId: string;
  value: string;
}

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface AttributeValueInput {
  attributeDefinitionId: string;
  value: string;
}

/** Resolved attribute: definition + value for display purposes. */
export interface ResolvedAttribute {
  definition: AttributeDefinition;
  value: string;
}
