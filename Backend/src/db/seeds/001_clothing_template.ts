/**
 * Seed 001 — Clothing & Fashion retail template.
 *
 * Seed category taxonomy and category-specific attribute definitions.
 */

import type { Knex } from 'knex';
import { randomUUID } from 'crypto';

export const CLOTHING_TEMPLATE_ID = 'tpl_clothing';

// ─── Attribute definitions ────────────────────────────────────────────────────

export const CLOTHING_ATTRIBUTES = [
  // ── Variant-level (differentiates a ProductVariant) ──────────────────────
  {
    name: 'Size',
    dataType: 'ENUM',
    isRequired: true,
    isVariantLevel: true,
    enumValues: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Free Size'],
    applicableCategories: null,
    displayOrder: 1,
  },

  // ── Global Product-level attributes ──────────────────────────────────────
  { name: 'Colour',   dataType: 'TEXT', isRequired: false, isVariantLevel: false, enumValues: null, applicableCategories: null, displayOrder: 2 },
  { name: 'Material', dataType: 'TEXT', isRequired: false, isVariantLevel: false, enumValues: null, applicableCategories: null, displayOrder: 3 },
  {
    name: 'Pattern',
    dataType: 'ENUM',
    isRequired: false,
    isVariantLevel: false,
    enumValues: ['Solid', 'Striped', 'Checked', 'Printed', 'Embroidered', 'Floral', 'Abstract'],
    applicableCategories: null,
    displayOrder: 4,
  },
  { name: 'Brand', dataType: 'TEXT', isRequired: false, isVariantLevel: false, enumValues: null, applicableCategories: null, displayOrder: 5 },

  // ── Topwear & Dresses Attributes ──────────────────────────────────────────
  {
    name: 'Fit',
    dataType: 'ENUM',
    isRequired: false,
    isVariantLevel: false,
    enumValues: ['Slim Fit', 'Regular Fit', 'Relaxed Fit', 'Oversized', 'Skinny', 'Baggy'],
    applicableCategories: ['Topwear', 'Bottomwear', 'Dresses & Jumpsuits', 'Activewear', 'Winter Wear'],
    displayOrder: 6,
  },
  {
    name: 'Sleeve',
    dataType: 'ENUM',
    isRequired: false,
    isVariantLevel: false,
    enumValues: ['Sleeveless', 'Short Sleeve', '3/4 Sleeve', 'Full Sleeve', 'Cap Sleeve'],
    applicableCategories: ['Topwear', 'Dresses & Jumpsuits', 'Winter Wear', 'Ethnic Wear'],
    displayOrder: 7,
  },
  {
    name: 'Neck',
    dataType: 'ENUM',
    isRequired: false,
    isVariantLevel: false,
    enumValues: ['Round Neck', 'V-Neck', 'Collared', 'Turtle Neck', 'Square Neck', 'Boat Neck', 'Polo', 'Henley'],
    applicableCategories: ['Topwear', 'Dresses & Jumpsuits', 'Ethnic Wear'],
    displayOrder: 8,
  },

  // ── Bottomwear Attributes ────────────────────────────────────────────────
  {
    name: 'Rise',
    dataType: 'ENUM',
    isRequired: false,
    isVariantLevel: false,
    enumValues: ['Low Rise', 'Mid Rise', 'High Rise'],
    applicableCategories: ['Bottomwear', 'Activewear'],
    displayOrder: 9,
  },
  {
    name: 'Bottom Length',
    dataType: 'ENUM',
    isRequired: false,
    isVariantLevel: false,
    enumValues: ['Full Length', 'Ankle Length', 'Cropped', 'Knee Length', 'Shorts'],
    applicableCategories: ['Bottomwear', 'Activewear'],
    displayOrder: 10,
  },
  {
    name: 'Waist Type',
    dataType: 'ENUM',
    isRequired: false,
    isVariantLevel: false,
    enumValues: ['Elasticated', 'Fixed Waist', 'Drawstring', 'High Waist'],
    applicableCategories: ['Bottomwear', 'Activewear'],
    displayOrder: 11,
  },

  // ── Dresses & Outerwear Attributes ────────────────────────────────────────
  {
    name: 'Dress Length',
    dataType: 'ENUM',
    isRequired: false,
    isVariantLevel: false,
    enumValues: ['Mini', 'Midi', 'Maxi', 'Knee Length', 'Ankle Length'],
    applicableCategories: ['Dresses & Jumpsuits'],
    displayOrder: 12,
  },
  {
    name: 'Collar Type',
    dataType: 'ENUM',
    isRequired: false,
    isVariantLevel: false,
    enumValues: ['Shirt Collar', 'Stand Collar', 'Lapel', 'Hooded', 'Mandarin'],
    applicableCategories: ['Winter Wear', 'Topwear'],
    displayOrder: 13,
  },
  {
    name: 'Closure Type',
    dataType: 'ENUM',
    isRequired: false,
    isVariantLevel: false,
    enumValues: ['Zipper', 'Button', 'Drawstring', 'Elastic', 'Hook & Eye', 'Open Front'],
    applicableCategories: ['Winter Wear', 'Bottomwear', 'Dresses & Jumpsuits'],
    displayOrder: 14,
  },

  // ── Ethnic Wear Attributes ────────────────────────────────────────────────
  {
    name: 'Work / Embellishment',
    dataType: 'ENUM',
    isRequired: false,
    isVariantLevel: false,
    enumValues: ['Zari Work', 'Mirror Work', 'Sequins', 'Chikankari', 'Printed', 'Plain / Solid'],
    applicableCategories: ['Ethnic Wear', 'Dresses & Jumpsuits'],
    displayOrder: 15,
  },
  {
    name: 'Occasion',
    dataType: 'ENUM',
    isRequired: false,
    isVariantLevel: false,
    enumValues: ['Casual', 'Formal', 'Party', 'Festive', 'Wedding'],
    applicableCategories: ['Ethnic Wear', 'Dresses & Jumpsuits', 'Topwear'],
    displayOrder: 16,
  },
];

// ─── Category taxonomy ────────────────────────────────────────────────────────

const CLOTHING_TAXONOMY = [
  {
    name: 'Topwear',
    subcategories: [
      'T-Shirts', 'Shirts', 'Sweatshirts & Hoodies', 'Kurtas & Kurtis', 'Blouses', 'Crop Tops', 'Sweaters', 'Vests & Waistcoats',
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
      'Jackets', 'Blazers', 'Overcoats', 'Leather Jackets', 'Puffer Jackets', 'Shawls & Wraps', 'Mufflers & Scarves',
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
    // ── Upsert Attribute definitions ──────────────────────────────────────────
    for (const attr of CLOTHING_ATTRIBUTES) {
      const existing = await trx('attribute_definitions')
        .where({ retail_template_id: CLOTHING_TEMPLATE_ID, name: attr.name })
        .first();

      const data = {
        retail_template_id: CLOTHING_TEMPLATE_ID,
        name: attr.name,
        data_type: attr.dataType,
        is_required: attr.isRequired,
        is_variant_level: attr.isVariantLevel,
        enum_values: attr.enumValues ? JSON.stringify(attr.enumValues) : null,
        applicable_categories: attr.applicableCategories ? JSON.stringify(attr.applicableCategories) : null,
        display_order: attr.displayOrder,
        is_active: true,
      };

      if (existing) {
        await trx('attribute_definitions').where({ id: existing.id }).update(data);
      } else {
        await trx('attribute_definitions').insert({ id: randomUUID(), ...data });
      }
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
        store_id: null,
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
