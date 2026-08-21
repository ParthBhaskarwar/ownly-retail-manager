/**
 * Retail-template module — RetailTemplate domain types.
 */

export enum RetailType {
  CLOTHING_FASHION = 'CLOTHING_FASHION',
  FOOTWEAR = 'FOOTWEAR',
  GROCERY = 'GROCERY',
  ELECTRONICS = 'ELECTRONICS',
  COSMETICS = 'COSMETICS',
  JEWELLERY = 'JEWELLERY',
  GENERAL_RETAIL = 'GENERAL_RETAIL',
}

/** Schema placeholder — populated per retail type in future weeks. */
export interface ProductFieldSchema {
  fields: string[];
}

/** Schema placeholder — populated per retail type in future weeks. */
export interface DashboardCardSchema {
  cards: string[];
}

export interface RetailTemplate {
  retailType: RetailType;
  enabled: boolean;
  label: string;
  description: string;
  icon: string;
  productFieldSchema: ProductFieldSchema;
  dashboardCardSchema: DashboardCardSchema;
}
