/**
 * RetailTemplateService — reads the retail-template configuration.
 *
 * This one stays entirely client-side: RETAIL_TEMPLATES is static
 * configuration, not stored data. There is nothing to fetch, so routing it
 * through the API would add a network round-trip for a constant.
 *
 * The methods remain async so RetailTypeSelector and the onboarding page,
 * which await them, did not need changing.
 */

import { RETAIL_TEMPLATES } from '@/config/retail-templates';
import { RetailTemplate, RetailType } from '@/modules/retail-template/types';

export const RetailTemplateService = {
  async getAll(): Promise<RetailTemplate[]> {
    return RETAIL_TEMPLATES;
  },

  async getEnabled(): Promise<RetailTemplate[]> {
    return RETAIL_TEMPLATES.filter((t) => t.enabled);
  },

  async getByType(type: RetailType): Promise<RetailTemplate | null> {
    return RETAIL_TEMPLATES.find((t) => t.retailType === type) ?? null;
  },

  async isEnabled(type: RetailType): Promise<boolean> {
    const template = await this.getByType(type);
    return template?.enabled ?? false;
  },
};
