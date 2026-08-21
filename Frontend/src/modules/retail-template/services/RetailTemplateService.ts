import { Adapters } from '@/adapters';
import { RetailTemplate, RetailType } from '@/modules/retail-template/types';

export const RetailTemplateService = {
  async getAll(): Promise<RetailTemplate[]> {
    return Adapters.retailTemplate.findAll();
  },

  async getEnabled(): Promise<RetailTemplate[]> {
    return Adapters.retailTemplate.findEnabled();
  },

  async getByType(type: RetailType): Promise<RetailTemplate | null> {
    return Adapters.retailTemplate.findByType(type);
  },

  async isEnabled(type: RetailType): Promise<boolean> {
    const template = await Adapters.retailTemplate.findByType(type);
    return template?.enabled ?? false;
  },
};
