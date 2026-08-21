import { RetailTemplate, RetailType } from '@/modules/retail-template/types';

/**
 * IRetailTemplateRepository — contract for RetailTemplate data access.
 */
export interface IRetailTemplateRepository {
  findAll(): Promise<RetailTemplate[]>;
  findByType(retailType: RetailType): Promise<RetailTemplate | null>;
  findEnabled(): Promise<RetailTemplate[]>;
}
