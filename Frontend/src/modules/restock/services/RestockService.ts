import { ProductService, VariantService } from '@/modules/product/services/ProductService';
import { SupplierService } from '@/modules/catalog/services/CategoryService';
import { InventoryItemService } from '@/modules/inventory/services/InventoryItemService';
import { AuditService } from '@/shared/audit/AuditService';
import type { ExecuteRestockInput, RestockResult, RestockReminder, RestockVariantLine } from '../types';
import type { ProductDetail } from '@/modules/product/types';

export const RestockService = {
  async executeRestock(input: ExecuteRestockInput): Promise<RestockResult> {
    const { storeId, storeCode, productId, lines, performedBy, notes } = input;

    const product = await ProductService.getProductDetail(productId);
    if (!product) {
      throw new Error(`Product ${productId} not found.`);
    }

    const activeLines = lines.filter((line) => line.restockQty > 0);
    if (activeLines.length === 0) {
      throw new Error('Please enter a restock quantity greater than 0 for at least one size.');
    }

    const allGeneratedItems: import('@/modules/inventory/types').InventoryItem[] = [];
    let totalPurchaseCost = 0;
    let expectedSalesValue = 0;

    for (const line of activeLines) {
      const costPrice = line.costPriceOverride ?? product.baseCostPrice;
      const sellingPrice = line.sellingPriceOverride ?? product.baseSellingPrice;

      if (
        line.costPriceOverride !== undefined ||
        line.sellingPriceOverride !== undefined
      ) {
        await VariantService.updateVariant(
          line.variantId,
          {
            costPriceOverride: line.costPriceOverride,
            sellingPriceOverride: line.sellingPriceOverride,
          },
          productId
        );
      }

      const items = await InventoryItemService.addStock(
        {
          storeId,
          variantId: line.variantId,
          quantity: line.restockQty,
          purchaseCostPrice: costPrice,
          purchaseDate: new Date().toISOString(),
          performedBy: performedBy || 'system',
          notes: notes ? `Restock: ${notes}` : `Manual Restock (${line.displayName})`,
        },
        line.sku
      );

      allGeneratedItems.push(...items);
      totalPurchaseCost += costPrice * line.restockQty;
      expectedSalesValue += sellingPrice * line.restockQty;
    }

    if (input.supplierId && input.supplierId !== product.supplierId) {
      await ProductService.updateProduct(productId, {
        supplierId: input.supplierId,
        updatedBy: performedBy || 'system',
      });
    }

    const totalQuantity = allGeneratedItems.length;
    const potentialProfit = expectedSalesValue - totalPurchaseCost;
    const barcodes = allGeneratedItems.map((item) => item.barcode);

    AuditService.log('inventory.restock', productId, storeId, {
      productName: product.name,
      totalQuantity,
      totalPurchaseCost,
      linesCount: activeLines.length,
      barcodesSummary: barcodes.length > 0 ? `${barcodes[0]} ... ${barcodes[barcodes.length - 1]}` : '',
    });

    return {
      productId,
      totalQuantity,
      totalPurchaseCost,
      expectedSalesValue,
      potentialProfit,
      generatedItems: allGeneratedItems,
      barcodes,
    };
  },

  async getRestockReminders(storeId: string, minStockThreshold = 5): Promise<RestockReminder[]> {
    const { items: products } = await ProductService.searchProducts({ storeId, pageSize: 200 });
    const reminders: RestockReminder[] = [];

    const allSuppliers = await SupplierService.getSuppliers(storeId);
    const supplierMap = new Map(allSuppliers.map((s) => [s.id, s.name]));

    for (const p of products) {
      const detail = await ProductService.getProductDetail(p.id);
      if (!detail) continue;

      const supplierName = p.supplierId ? supplierMap.get(p.supplierId) : undefined;

      for (const v of detail.variants) {
        const inStock = v.stock?.inStock ?? 0;
        if (inStock <= minStockThreshold) {
          const sizeName = v.displayName.split('—').pop()?.trim() || 'Standard';
          const suggestedQuantity = Math.max(10, minStockThreshold * 3 - inStock);

          reminders.push({
            productId: p.id,
            productName: p.name,
            baseSku: p.baseSku,
            variantId: v.id,
            variantSku: v.sku,
            sizeName,
            currentStock: inStock,
            minThreshold: minStockThreshold,
            suggestedQuantity,
            supplierId: p.supplierId,
            supplierName,
            costPrice: v.costPriceOverride ?? p.baseCostPrice,
            sellingPrice: v.sellingPriceOverride ?? p.baseSellingPrice,
            urgency: inStock === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
          });
        }
      }
    }

    return reminders.sort((a, b) => {
      if (a.urgency !== b.urgency) {
        return a.urgency === 'OUT_OF_STOCK' ? -1 : 1;
      }
      return a.currentStock - b.currentStock;
    });
  },

  async getRestockLinesForProduct(productId: string): Promise<{
    product: ProductDetail;
    lines: RestockVariantLine[];
  } | null> {
    const detail = await (await import('@/modules/product/services/ProductService')).ProductService.getProductDetail(productId);
    if (!detail) return null;

    const lines: RestockVariantLine[] = detail.variants.map((v) => {
      const sizeName = v.displayName.split('—').pop()?.trim() || v.sku;
      return {
        variantId: v.id,
        sku: v.sku,
        displayName: v.displayName,
        sizeName,
        currentStock: v.stock.inStock,
        restockQty: 0,
        costPriceOverride: v.costPriceOverride,
        sellingPriceOverride: v.sellingPriceOverride,
      };
    });

    return { product: detail, lines };
  },
};
