import { RetailTemplate, RetailType } from '@/modules/retail-template/types';
import { IRetailTemplateRepository } from '@/modules/retail-template/repository/IRetailTemplateRepository';
import { RETAIL_TEMPLATES } from '@/config/retail-templates';

/**
 * LocalRetailTemplateAdapter — reads from the static config seed data.
 * No persistence needed — retail templates are config, not user data.
 * When a real backend exists, swap this for an ApiRetailTemplateAdapter.
 */
export class LocalRetailTemplateAdapter implements IRetailTemplateRepository {
  async findAll(): Promise<RetailTemplate[]> {
    return [...RETAIL_TEMPLATES];
  }

  async findByType(retailType: RetailType): Promise<RetailTemplate | null> {
    return RETAIL_TEMPLATES.find((t) => t.retailType === retailType) ?? null;
  }

  async findEnabled(): Promise<RetailTemplate[]> {
    return RETAIL_TEMPLATES.filter((t) => t.enabled);
  }
}
