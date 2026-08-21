/**
 * Adapter Registry — the single place where storage adapters are wired up.
 *
 * To swap from local/stub storage to a real API:
 * 1. Create ApiUserAdapter, ApiStoreAdapter, etc. implementing the same interfaces.
 * 2. Replace the imports below with the API adapters.
 * 3. Done — no service or component changes needed.
 *
 * Week 1 adapters: localStorage-based (flat records — users, sessions, store config)
 * Week 2 adapters: Dexie/IndexedDB-based (relational — products, inventory, catalog)
 */

// ── Week 1: localStorage adapters ────────────────────────────────────────────
import { LocalUserAdapter } from './local/LocalUserAdapter';
import { LocalSessionAdapter } from './local/LocalSessionAdapter';
import { LocalStoreAdapter } from './local/LocalStoreAdapter';
import { LocalStaffAdapter } from './local/LocalStaffAdapter';
import { LocalRolePermissionAdapter } from './local/LocalRolePermissionAdapter';
import { LocalRetailTemplateAdapter } from './local/LocalRetailTemplateAdapter';

// ── Week 2: Dexie adapters ────────────────────────────────────────────────────
import { DexieCategoryAdapter } from './local/DexieCategoryAdapter';
import { DexieSubcategoryAdapter } from './local/DexieSubcategoryAdapter';
import { DexieSupplierAdapter } from './local/DexieSupplierAdapter';
import { DexieAttributeAdapter } from './local/DexieAttributeAdapter';
import { DexieProductAdapter } from './local/DexieProductAdapter';
import { DexieProductVariantAdapter } from './local/DexieProductVariantAdapter';
import { DexieInventoryItemAdapter } from './local/DexieInventoryItemAdapter';
import { DexieInventoryMovementAdapter } from './local/DexieInventoryMovementAdapter';

// ── Repository interface imports ──────────────────────────────────────────────
import type { IUserRepository } from '@/modules/account/repository/IUserRepository';
import type { ISessionRepository } from '@/modules/account/repository/ISessionRepository';
import type { IStoreRepository } from '@/modules/store/repository/IStoreRepository';
import type { IStaffRepository } from '@/modules/staff/repository/IStaffRepository';
import type { IRolePermissionRepository } from '@/modules/staff/repository/IRolePermissionRepository';
import type { IRetailTemplateRepository } from '@/modules/retail-template/repository/IRetailTemplateRepository';
import type { ICategoryRepository } from '@/modules/catalog/repository/ICategoryRepository';
import type { ISubcategoryRepository } from '@/modules/catalog/repository/ISubcategoryRepository';
import type { ISupplierRepository } from '@/modules/catalog/repository/ISupplierRepository';
import type { IAttributeRepository } from '@/modules/attributes/repository/IAttributeRepository';
import type { IProductRepository } from '@/modules/product/repository/IProductRepository';
import type { IProductVariantRepository } from '@/modules/product/repository/IProductVariantRepository';
import type { IInventoryItemRepository } from '@/modules/inventory/repository/IInventoryItemRepository';
import type { IInventoryMovementRepository } from '@/modules/inventory/repository/IInventoryMovementRepository';

// ── Singleton instances ───────────────────────────────────────────────────────
let _userRepo: IUserRepository | null = null;
let _sessionRepo: ISessionRepository | null = null;
let _storeRepo: IStoreRepository | null = null;
let _staffRepo: IStaffRepository | null = null;
let _rolePermissionRepo: IRolePermissionRepository | null = null;
let _retailTemplateRepo: IRetailTemplateRepository | null = null;
let _categoryRepo: ICategoryRepository | null = null;
let _subcategoryRepo: ISubcategoryRepository | null = null;
let _supplierRepo: ISupplierRepository | null = null;
let _attributeRepo: IAttributeRepository | null = null;
let _productRepo: IProductRepository | null = null;
let _productVariantRepo: IProductVariantRepository | null = null;
let _inventoryItemRepo: IInventoryItemRepository | null = null;
let _inventoryMovementRepo: IInventoryMovementRepository | null = null;

export const Adapters = {
  // ── Week 1 ──────────────────────────────────────────────────────────────────
  get user(): IUserRepository {
    return (_userRepo ??= new LocalUserAdapter());
  },
  get session(): ISessionRepository {
    return (_sessionRepo ??= new LocalSessionAdapter());
  },
  get store(): IStoreRepository {
    return (_storeRepo ??= new LocalStoreAdapter());
  },
  get staff(): IStaffRepository {
    return (_staffRepo ??= new LocalStaffAdapter());
  },
  get rolePermission(): IRolePermissionRepository {
    return (_rolePermissionRepo ??= new LocalRolePermissionAdapter());
  },
  get retailTemplate(): IRetailTemplateRepository {
    return (_retailTemplateRepo ??= new LocalRetailTemplateAdapter());
  },

  // ── Week 2 ──────────────────────────────────────────────────────────────────
  get category(): ICategoryRepository {
    return (_categoryRepo ??= new DexieCategoryAdapter());
  },
  get subcategory(): ISubcategoryRepository {
    return (_subcategoryRepo ??= new DexieSubcategoryAdapter());
  },
  get supplier(): ISupplierRepository {
    return (_supplierRepo ??= new DexieSupplierAdapter());
  },
  get attribute(): IAttributeRepository {
    return (_attributeRepo ??= new DexieAttributeAdapter());
  },
  get product(): IProductRepository {
    return (_productRepo ??= new DexieProductAdapter());
  },
  get productVariant(): IProductVariantRepository {
    return (_productVariantRepo ??= new DexieProductVariantAdapter());
  },
  get inventoryItem(): IInventoryItemRepository {
    return (_inventoryItemRepo ??= new DexieInventoryItemAdapter());
  },
  get inventoryMovement(): IInventoryMovementRepository {
    return (_inventoryMovementRepo ??= new DexieInventoryMovementAdapter());
  },
};
