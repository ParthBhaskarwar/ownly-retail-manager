/**
 * Retail-template seed configuration.
 *
 * This is the SINGLE SOURCE OF TRUTH for which retail types exist and
 * whether they are enabled. No component hard-codes "clothing" anywhere —
 * components read from RetailTemplateService which reads from this config.
 *
 * To enable a new retail type: change enabled: false → true here.
 * To add a new retail type: add an entry to RETAIL_TEMPLATES.
 */

import { RetailTemplate, RetailType } from '@/modules/retail-template/types';

export const RETAIL_TEMPLATES: RetailTemplate[] = [
  {
    retailType: RetailType.CLOTHING_FASHION,
    enabled: true,
    label: 'Clothing & Fashion',
    description: 'Apparel, garments, accessories, and fashion retail.',
    icon: '👗',
    productFieldSchema: {
      fields: ['name', 'sku', 'category', 'size', 'color', 'material', 'brand', 'mrp', 'sellingPrice', 'stock'],
    },
    dashboardCardSchema: {
      cards: ['totalSales', 'lowStock', 'topProducts', 'recentOrders'],
    },
  },
  {
    retailType: RetailType.FOOTWEAR,
    enabled: false,
    label: 'Footwear',
    description: 'Shoes, sandals, boots, and footwear retail.',
    icon: '👟',
    productFieldSchema: { fields: [] },
    dashboardCardSchema: { cards: [] },
  },
  {
    retailType: RetailType.GROCERY,
    enabled: false,
    label: 'Grocery & Supermarket',
    description: 'Food, beverages, household items, and daily essentials.',
    icon: '🛒',
    productFieldSchema: { fields: [] },
    dashboardCardSchema: { cards: [] },
  },
  {
    retailType: RetailType.ELECTRONICS,
    enabled: false,
    label: 'Electronics',
    description: 'Gadgets, appliances, and electronics retail.',
    icon: '📱',
    productFieldSchema: { fields: [] },
    dashboardCardSchema: { cards: [] },
  },
  {
    retailType: RetailType.COSMETICS,
    enabled: false,
    label: 'Cosmetics & Beauty',
    description: 'Skincare, makeup, fragrances, and beauty products.',
    icon: '💄',
    productFieldSchema: { fields: [] },
    dashboardCardSchema: { cards: [] },
  },
  {
    retailType: RetailType.JEWELLERY,
    enabled: false,
    label: 'Jewellery',
    description: 'Gold, silver, diamonds, and fine jewellery retail.',
    icon: '💎',
    productFieldSchema: { fields: [] },
    dashboardCardSchema: { cards: [] },
  },
  {
    retailType: RetailType.GENERAL_RETAIL,
    enabled: false,
    label: 'General Retail',
    description: 'Mixed-category general merchandise stores.',
    icon: '🏪',
    productFieldSchema: { fields: [] },
    dashboardCardSchema: { cards: [] },
  },
];

/**
 * Resolve whether a given retail type is enabled.
 * Returns false for unknown types.
 */
export function isRetailTypeEnabled(type: RetailType): boolean {
  const template = RETAIL_TEMPLATES.find((t) => t.retailType === type);
  return template?.enabled ?? false;
}

/**
 * Identifier for the Clothing & Fashion template.
 *
 * Must match `retail_template_id` in the backend seed
 * (Backend/src/db/seeds/001_clothing_template.ts) — categories and attribute
 * definitions are looked up by this value.
 *
 * Previously lived in the Dexie seed file, which no longer exists.
 */
export const CLOTHING_TEMPLATE_ID = 'tpl_clothing';
