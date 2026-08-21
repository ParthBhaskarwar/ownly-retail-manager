/**
 * Seed: Clothing & Fashion categories and subcategories.
 *
 * Called once during Dexie version 1 upgrade.
 * Seeds system Category + Subcategory rows for CLOTHING.
 * storeId = null → these are global template categories, not store-specific.
 */

import { v4 as uuidv4 } from 'uuid';
import type { Transaction } from 'dexie';
import { CLOTHING_TEMPLATE_ID } from './clothing-attributes';

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

export async function seedClothingCategories(tx: Transaction): Promise<void> {
  const catTable = tx.table('categories');
  const subTable = tx.table('subcategories');

  // Idempotency: skip if already seeded
  const existing = await catTable.where('retailTemplateId').equals(CLOTHING_TEMPLATE_ID).count();
  if (existing > 0) return;

  const now = new Date().toISOString();

  for (const { name, subcategories } of CLOTHING_TAXONOMY) {
    const categoryId = uuidv4();
    await catTable.add({
      id: categoryId,
      retailTemplateId: CLOTHING_TEMPLATE_ID,
      storeId: null,   // null = global system category
      name,
      isSystem: true,
      isActive: true,
      sortOrder: CLOTHING_TAXONOMY.indexOf({ name, subcategories } as never),
      createdAt: now,
    });

    let sortOrder = 0;
    for (const subName of subcategories) {
      await subTable.add({
        id: uuidv4(),
        categoryId,
        storeId: null,
        name: subName,
        isSystem: true,
        isActive: true,
        sortOrder: sortOrder++,
        createdAt: now,
      });
    }
  }
}
