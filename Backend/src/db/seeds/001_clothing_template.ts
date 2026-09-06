/**
 * Seed 001 — Clothing & Fashion retail template.
 *
 * Ports the attribute definitions and category taxonomy that previously lived
 * in Frontend/src/db/seeds/ (Dexie-specific) into Postgres. The data arrays are
 * carried over verbatim.
 *
 * Idempotent: re-running is a no-op once the clothing template exists, so this
 * is safe to run on every deploy.
 *
 * storeId = null on categories/subcategories means "global system category",
 * shared by every store rather than owned by one.
 */

import type { Knex } from 'knex';
import { randomUUID } from 'crypto';

export const CLOTHING_TEMPLATE_ID = 'tpl_clothing';

// ─── Attribute definitions ────────────────────────────────────────────────────

const CLOTHING_ATTRIBUTES = [
  // ── Variant-level (differentiates a ProductVariant) ──────────────────────
  {
    name: 'Size',
    dataType: 'ENUM',
    isRequired: true,
    isVariantLevel: true,
    enumValues: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Free Size'],
    displayOrder: 1,
  },

  // ── Product-level attributes ──────────────────────────────────────────────
  { name: 'Colour',   dataType: 'TEXT', isRequired: false, isVariantLevel: false, enumValues: null, displayOrder: 2 },
  { name: 'Material', dataType: 'TEXT', isRequired: false, isVariantLevel: false, enumValues: null, displayOrder: 3 },
  {
    name: 'Pattern',
    dataType: 'ENUM',
    isRequired: false,
    isVariantLevel: false,
    enumValues: ['Solid', 'Striped', 'Checked', 'Printed', 'Embroidered', 'Floral', 'Abstract'],
    displayOrder: 4,
  },
  { name: 'Brand', dataType: 'TEXT', isRequired: false, isVariantLevel: false, enumValues: null, displayOrder: 5 },
  {
    name: 'Fit',
    dataType: 'ENUM',
    isRequired: false,
    isVariantLevel: false,
    enumValues: ['Slim Fit', 'Regular Fit', 'Relaxed Fit', 'Oversized'],
    displayOrder: 6,
  },
  {
    name: 'Sleeve',
    dataType: 'ENUM',
    isRequired: false,
    isVariantLevel: false,
    enumValues: ['Sleeveless', 'Short Sleeve', '3/4 Sleeve', 'Full Sleeve'],
    displayOrder: 7,
  },
  {
    name: 'Neck',
    dataType: 'ENUM',
    isRequired: false,
    isVariantLevel: false,
    enumValues: ['Round Neck', 'V-Neck', 'Collared', 'Turtle Neck', 'Square Neck', 'Boat Neck'],
    displayOrder: 8,
  },
] as const;

// ─── Category taxonomy ────────────────────────────────────────────────────────

const CLOTHING_TAXONOMY = [
  {
    name: 'Topwear',
    subcategories: [
      'T-Shirts', 'Shirts', 'Sweatshirts & Hoodies', 'Jackets', 'Blazers',
      'Kurtas & Kurtis', 'Blouses', 'Crop Tops', 'Sweaters', 'Vests & Waistcoats',
    ],
  },
  {
    name: 'Bottomwear',
    subcategories: [
      'Jeans', 'Trousers', 'Shorts', 'Skirts', 'Leggings',
      'Palazzos', 'Track Pants', 'Salwar & Churidars',
    ],
  },
  {
    name: 'Ethnic Wear',
    subcategories: [
      'Sarees', 'Salwar Suits', 'Lehengas', 'Sherwanis', 'Kurta Sets',
      'Dupattas', 'Ethnic Jackets',
    ],
  },
  {
    name: 'Dresses & Jumpsuits',
    subcategories: [
      'Casual Dresses', 'Formal Dresses', 'Party Dresses',
      'Jumpsuits', 'Rompers', 'Co-ord Sets',
    ],
  },
  {
    name: 'Activewear',
    subcategories: [
      'Sports T-Shirts', 'Track Pants', 'Yoga Wear', 'Sports Shorts',
      'Cycling Wear', 'Sports Bras',
    ],
  },
  {
    name: 'Innerwear & Sleepwear',
    subcategories: [
      'Innerwear', 'Bras', 'Briefs & Trunks', 'Sleepwear', 'Loungewear', 'Thermals',
    ],
  },
  {
    name: 'Winter Wear',
    subcategories: [
      'Overcoats', 'Leather Jackets', 'Puffer Jackets', 'Shawls & Wraps', 'Mufflers & Scarves',
    ],
  },
  {
    name: 'Accessories',
    subcategories: [
      'Belts', 'Ties & Bow Ties', 'Handkerchiefs', 'Pocket Squares',
      'Socks', 'Caps & Hats', 'Scarves',
    ],
  },
] as const;

// ─── Seed ─────────────────────────────────────────────────────────────────────

export async function seed(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    // ── Attribute definitions ────────────────────────────────────────────────
    const existingAttrs = await trx('attribute_definitions')
      .where({ retail_template_id: CLOTHING_TEMPLATE_ID })
      .count<{ count: number }[]>('* as count')
      .first();

    if (!Number(existingAttrs?.count)) {
      await trx('attribute_definitions').insert(
        CLOTHING_ATTRIBUTES.map((attr) => ({
          id: randomUUID(),
          retail_template_id: CLOTHING_TEMPLATE_ID,
          name: attr.name,
          data_type: attr.dataType,
          is_required: attr.isRequired,
          is_variant_level: attr.isVariantLevel,
          // jsonb column — pass JSON text, or null when the attribute is free-form
          enum_values: attr.enumValues ? JSON.stringify(attr.enumValues) : null,
          display_order: attr.displayOrder,
          is_active: true,
        }))
      );
    }

    // ── Categories + subcategories ───────────────────────────────────────────
    const existingCats = await trx('categories')
      .where({ retail_template_id: CLOTHING_TEMPLATE_ID })
      .count<{ count: number }[]>('* as count')
      .first();

    if (Number(existingCats?.count)) return;

    for (const [index, entry] of CLOTHING_TAXONOMY.entries()) {
      const categoryId = randomUUID();

      await trx('categories').insert({
        id: categoryId,
        retail_template_id: CLOTHING_TEMPLATE_ID,
        store_id: null, // global system category
        name: entry.name,
        is_system: true,
        is_active: true,
        sort_order: index,
      });

      await trx('subcategories').insert(
        entry.subcategories.map((name, subIndex) => ({
          id: randomUUID(),
          category_id: categoryId,
          store_id: null,
          name,
          is_system: true,
          is_active: true,
          sort_order: subIndex,
        }))
      );
    }
  });
}
