/**
 * Catalog routes — categories, subcategories, suppliers, attribute definitions.
 *
 * Reads only need inventory:view; writes need inventory:edit.
 */

import { Router } from 'express';
import { z } from 'zod';
import { CatalogService } from '@/services/catalog.service';
import { AttributeService } from '@/services/attribute.service';
import { authenticate, requirePermission, requireStoreId } from '@/middleware/auth.middleware';
import { param } from '@/shared/AppError';

export const catalogRouter = Router();
catalogRouter.use(authenticate);

// ─── Categories ───────────────────────────────────────────────────────────────

catalogRouter.get('/categories', requirePermission('inventory:view'), async (req, res, next) => {
  try {
    const retailTemplateId = z.string().min(1).parse(req.query.retailTemplateId);
    // storeId may be absent during onboarding; global categories still resolve.
    const storeId = req.user?.storeId ?? null;
    res.json({ categories: await CatalogService.listCategories(retailTemplateId, storeId) });
  } catch (err) {
    next(err);
  }
});

catalogRouter.post('/categories', requirePermission('inventory:edit'), async (req, res, next) => {
  try {
    const input = z.object({
      retailTemplateId: z.string().min(1),
      name: z.string().trim().min(1, 'Category name is required.'),
    }).parse(req.body);
    const category = await CatalogService.createCategory(requireStoreId(req), req.user!.userId, input);
    res.status(201).json({ category });
  } catch (err) {
    next(err);
  }
});

catalogRouter.get('/categories/:id/subcategories', requirePermission('inventory:view'), async (req, res, next) => {
  try {
    const storeId = req.user?.storeId ?? null;
    res.json({ subcategories: await CatalogService.listSubcategories(param(req.params, 'id'), storeId) });
  } catch (err) {
    next(err);
  }
});

catalogRouter.post('/subcategories', requirePermission('inventory:edit'), async (req, res, next) => {
  try {
    const input = z.object({
      categoryId: z.string().uuid(),
      name: z.string().trim().min(1, 'Subcategory name is required.'),
    }).parse(req.body);
    const subcategory = await CatalogService.createSubcategory(requireStoreId(req), req.user!.userId, input);
    res.status(201).json({ subcategory });
  } catch (err) {
    next(err);
  }
});

// ─── Suppliers ────────────────────────────────────────────────────────────────

catalogRouter.get('/suppliers', requirePermission('inventory:view'), async (req, res, next) => {
  try {
    const includeInactive = req.query.includeInactive === 'true';
    res.json({ suppliers: await CatalogService.listSuppliers(requireStoreId(req), includeInactive) });
  } catch (err) {
    next(err);
  }
});

catalogRouter.post('/suppliers', requirePermission('inventory:edit'), async (req, res, next) => {
  try {
    const input = z.object({
      name: z.string().trim().min(1, 'Supplier name is required.'),
      code: z.string().trim().min(1, 'Supplier code is required.'),
      gstin: z.string().trim().optional(),
      address: z.string().trim().optional(),
      paymentTerms: z.string().trim().optional(),
      notes: z.string().trim().optional(),
    }).parse(req.body);
    const supplier = await CatalogService.createSupplier(requireStoreId(req), req.user!.userId, input);
    res.status(201).json({ supplier });
  } catch (err) {
    next(err);
  }
});

catalogRouter.put('/suppliers/:id', requirePermission('inventory:edit'), async (req, res, next) => {
  try {
    const updates = z.object({
      name: z.string().trim().min(1).optional(),
      gstin: z.string().trim().optional(),
      address: z.string().trim().optional(),
      paymentTerms: z.string().trim().optional(),
      notes: z.string().trim().optional(),
      isActive: z.boolean().optional(),
    }).parse(req.body);
    const supplier = await CatalogService.updateSupplier(
      requireStoreId(req), req.user!.userId, param(req.params, 'id'), updates
    );
    res.json({ supplier });
  } catch (err) {
    next(err);
  }
});

// ─── Attribute definitions ────────────────────────────────────────────────────

catalogRouter.get('/attributes/definitions', requirePermission('inventory:view'), async (req, res, next) => {
  try {
    const retailTemplateId = z.string().min(1).parse(req.query.retailTemplateId);
    const level = req.query.level;

    const definitions =
      level === 'product' ? await AttributeService.findProductLevelDefinitions(retailTemplateId)
      : level === 'variant' ? await AttributeService.findVariantLevelDefinitions(retailTemplateId)
      : await AttributeService.findDefinitionsByTemplate(retailTemplateId);

    res.json({ definitions });
  } catch (err) {
    next(err);
  }
});
