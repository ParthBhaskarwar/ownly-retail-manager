/**
 * Unit tests: Retail template config resolution.
 * Tests that CLOTHING_FASHION is enabled and all other types are disabled.
 */

import { RETAIL_TEMPLATES, isRetailTypeEnabled } from '@/config/retail-templates';
import { RetailType } from '@/modules/retail-template/types';

const ALL_RETAIL_TYPES = Object.values(RetailType);

describe('RETAIL_TEMPLATES config', () => {
  test('contains all defined retail types', () => {
    const configuredTypes = RETAIL_TEMPLATES.map((t) => t.retailType);
    ALL_RETAIL_TYPES.forEach((type) => {
      expect(configuredTypes).toContain(type);
    });
  });

  test('has exactly one enabled template', () => {
    const enabledTemplates = RETAIL_TEMPLATES.filter((t) => t.enabled);
    expect(enabledTemplates).toHaveLength(1);
  });

  test('CLOTHING_FASHION is enabled', () => {
    const clothing = RETAIL_TEMPLATES.find((t) => t.retailType === RetailType.CLOTHING_FASHION);
    expect(clothing).toBeDefined();
    expect(clothing?.enabled).toBe(true);
  });

  test('CLOTHING_FASHION has a non-empty label', () => {
    const clothing = RETAIL_TEMPLATES.find((t) => t.retailType === RetailType.CLOTHING_FASHION);
    expect(clothing?.label).toBeTruthy();
  });

  test('CLOTHING_FASHION has productFieldSchema with fields', () => {
    const clothing = RETAIL_TEMPLATES.find((t) => t.retailType === RetailType.CLOTHING_FASHION);
    expect(clothing?.productFieldSchema.fields.length).toBeGreaterThan(0);
  });

  test('CLOTHING_FASHION has dashboardCardSchema with cards', () => {
    const clothing = RETAIL_TEMPLATES.find((t) => t.retailType === RetailType.CLOTHING_FASHION);
    expect(clothing?.dashboardCardSchema.cards.length).toBeGreaterThan(0);
  });

  test('all templates have required shape (retailType, enabled, label, icon)', () => {
    RETAIL_TEMPLATES.forEach((template) => {
      expect(template.retailType).toBeTruthy();
      expect(typeof template.enabled).toBe('boolean');
      expect(template.label).toBeTruthy();
      expect(template.icon).toBeTruthy();
    });
  });
});

describe('Disabled retail types', () => {
  const disabledTypes = [
    RetailType.FOOTWEAR,
    RetailType.GROCERY,
    RetailType.ELECTRONICS,
    RetailType.COSMETICS,
    RetailType.JEWELLERY,
    RetailType.GENERAL_RETAIL,
  ];

  test.each(disabledTypes)('%s is disabled', (type) => {
    const template = RETAIL_TEMPLATES.find((t) => t.retailType === type);
    expect(template).toBeDefined();
    expect(template?.enabled).toBe(false);
  });
});

describe('isRetailTypeEnabled()', () => {
  test('returns true for CLOTHING_FASHION', () => {
    expect(isRetailTypeEnabled(RetailType.CLOTHING_FASHION)).toBe(true);
  });

  test('returns false for FOOTWEAR', () => {
    expect(isRetailTypeEnabled(RetailType.FOOTWEAR)).toBe(false);
  });

  test('returns false for GROCERY', () => {
    expect(isRetailTypeEnabled(RetailType.GROCERY)).toBe(false);
  });

  test('returns false for ELECTRONICS', () => {
    expect(isRetailTypeEnabled(RetailType.ELECTRONICS)).toBe(false);
  });

  test('returns false for COSMETICS', () => {
    expect(isRetailTypeEnabled(RetailType.COSMETICS)).toBe(false);
  });

  test('returns false for JEWELLERY', () => {
    expect(isRetailTypeEnabled(RetailType.JEWELLERY)).toBe(false);
  });

  test('returns false for GENERAL_RETAIL', () => {
    expect(isRetailTypeEnabled(RetailType.GENERAL_RETAIL)).toBe(false);
  });

  test('only CLOTHING_FASHION resolves as enabled among all types', () => {
    const enabled = ALL_RETAIL_TYPES.filter(isRetailTypeEnabled);
    expect(enabled).toEqual([RetailType.CLOTHING_FASHION]);
  });

  test('total disabled types equals total types minus 1', () => {
    const disabled = ALL_RETAIL_TYPES.filter((t) => !isRetailTypeEnabled(t));
    expect(disabled).toHaveLength(ALL_RETAIL_TYPES.length - 1);
  });
});
