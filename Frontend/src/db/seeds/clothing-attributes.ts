/**
 * Seed: Clothing & Fashion attribute definitions.
 *
 * Called once during Dexie version 1 upgrade.
 * Seeds AttributeDefinition rows for retailTemplateId = 'CLOTHING'.
 *
 * is_variant_level = true → Size (differentiates variants within a product).
 * is_variant_level = false → all other attributes live at the product level.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Transaction } from 'dexie';

export const CLOTHING_TEMPLATE_ID = 'tpl_clothing';

const CLOTHING_ATTRIBUTES = [
  // ── Variant-level (differentiates a ProductVariant) ──────────────────────
  {
    name: 'Size',
    dataType: 'ENUM' as const,
    isRequired: true,
    isVariantLevel: true,
    enumValues: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Free Size'],
    displayOrder: 1,
  },

  // ── Product-level attributes ──────────────────────────────────────────────
  {
    name: 'Colour',
    dataType: 'TEXT' as const,
    isRequired: false,
    isVariantLevel: false,
    enumValues: null,
    displayOrder: 2,
  },
  {
    name: 'Material',
    dataType: 'TEXT' as const,
    isRequired: false,
    isVariantLevel: false,
    enumValues: null,
    displayOrder: 3,
  },
  {
    name: 'Pattern',
    dataType: 'ENUM' as const,
    isRequired: false,
    isVariantLevel: false,
    enumValues: ['Solid', 'Striped', 'Checked', 'Printed', 'Embroidered', 'Floral', 'Abstract'],
    displayOrder: 4,
  },
  {
    name: 'Brand',
    dataType: 'TEXT' as const,
    isRequired: false,
    isVariantLevel: false,
    enumValues: null,
    displayOrder: 5,
  },
  {
    name: 'Fit',
    dataType: 'ENUM' as const,
    isRequired: false,
    isVariantLevel: false,
    enumValues: ['Slim Fit', 'Regular Fit', 'Relaxed Fit', 'Oversized'],
    displayOrder: 6,
  },
  {
    name: 'Sleeve',
    dataType: 'ENUM' as const,
    isRequired: false,
    isVariantLevel: false,
    enumValues: ['Sleeveless', 'Short Sleeve', '3/4 Sleeve', 'Full Sleeve'],
    displayOrder: 7,
  },
  {
    name: 'Neck',
    dataType: 'ENUM' as const,
    isRequired: false,
    isVariantLevel: false,
    enumValues: ['Round Neck', 'V-Neck', 'Collared', 'Turtle Neck', 'Square Neck', 'Boat Neck'],
    displayOrder: 8,
  },
] as const;

export async function seedClothingAttributes(tx: Transaction): Promise<void> {
  const table = tx.table('attributeDefinitions');

  // Idempotency: skip if already seeded
  const existing = await table.where('retailTemplateId').equals(CLOTHING_TEMPLATE_ID).count();
  if (existing > 0) return;

  const now = new Date().toISOString();
  const records = CLOTHING_ATTRIBUTES.map((attr) => ({
    id: uuidv4(),
    retailTemplateId: CLOTHING_TEMPLATE_ID,
    name: attr.name,
    dataType: attr.dataType,
    isRequired: attr.isRequired,
    isVariantLevel: attr.isVariantLevel,
    enumValues: attr.enumValues ? JSON.stringify(attr.enumValues) : null,
    displayOrder: attr.displayOrder,
    isActive: true,
    createdAt: now,
  }));

  await table.bulkAdd(records);
}
