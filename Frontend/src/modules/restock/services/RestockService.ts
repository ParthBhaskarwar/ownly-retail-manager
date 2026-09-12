import { Adapters } from '@/adapters';
import { InventoryItemService } from '@/modules/inventory/services/InventoryItemService';
import { AuditService } from '@/shared/audit/AuditService';
import type { ExecuteRestockInput, RestockResult, RestockReminder, RestockVariantLine } from '../types';
import type { ProductDetail } from '@/modules/product/types';

export const RestockService = {
  /**
   * Execute manual restocking for a product across selected sizes/variants.
   * Generates new unique barcodes for each physical item and logs 'PURCHASE'/'RESTOCK' movements.
   */
  async executeRestock(input: ExecuteRestockInput): Promise<RestockResult> {
    const { storeId, storeCode, productId, lines, performedBy, notes } = input;

    const product = await Adapters.product.findById(productId);
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

      // Update variant prices if overridden
      if (
        line.costPriceOverride !== undefined ||
        line.sellingPriceOverride !== undefined
      ) {
        await Adapters.productVariant.update(line.variantId, {
          costPriceOverride: line.costPriceOverride,
          sellingPriceOverride: line.sellingPriceOverride,
        });
      }

      // Add stock items and movements
      const items = await InventoryItemService.addStock(
        {
          storeId,
          variantId: line.variantId,
          quantity: line.restockQty,
          purchaseCostPrice: costPrice,
          purchaseDate: new Date().toISOString(),
          performedBy,
          notes: notes ? `Restock: ${notes}` : `Manual Restock (${line.displayName})`,
        },
        storeCode || 'OWN',
        line.sku
      );

      allGeneratedItems.push(...items);
      totalPurchaseCost += costPrice * line.restockQty;
      expectedSalesValue += sellingPrice * line.restockQty;
    }

    // If product supplier was updated or confirmed
    if (input.supplierId && input.supplierId !== product.supplierId) {
      await Adapters.product.update(productId, {
        supplierId: input.supplierId,
        updatedBy: performedBy,
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
      barcodesSummary: `${barcodes[0]} ... ${barcodes[barcodes.length - 1]}`,
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

  /**
   * Scans inventory for low-stock and out-of-stock variants across all products.
   * Produces actionable Restock Reminders with suggested reorder quantities.
   */
  async getRestockReminders(storeId: string, minStockThreshold = 5): Promise<RestockReminder[]> {
    const { items: products } = await Adapters.product.search({ storeId, pageSize: 200 });
    const reminders: RestockReminder[] = [];

    for (const p of products) {
      const variants = await Adapters.productVariant.findByProductId(p.id);
      let supplierName: string | undefined;
      if (p.supplierId) {
        const supp = await Adapters.supplier.findById(p.supplierId);
        supplierName = supp?.name;
      }

      for (const v of variants) {
        const stock = await Adapters.inventoryItem.getStockSummary(v.id);
        if (stock.inStock <= minStockThreshold) {
          const sizeAttr = await Adapters.attribute.getVariantAttributeValues(v.id);
          const sizeName = v.displayName.split('—').pop()?.trim() || 'Standard';

          const suggestedQuantity = Math.max(10, minStockThreshold * 3 - stock.inStock);

          reminders.push({
            productId: p.id,
            productName: p.name,
            baseSku: p.baseSku,
            variantId: v.id,
            variantSku: v.sku,
            sizeName,
            currentStock: stock.inStock,
            minThreshold: minStockThreshold,
            suggestedQuantity,
            supplierId: p.supplierId,
            supplierName,
            costPrice: v.costPriceOverride ?? p.baseCostPrice,
            sellingPrice: v.sellingPriceOverride ?? p.baseSellingPrice,
            urgency: stock.inStock === 0 ? 'OUT_OF_STOCK' : 'LOW_STOCK',
          });
        }
      }
    }

    // Sort: OUT_OF_STOCK first, then lowest stock count
    return reminders.sort((a, b) => {
      if (a.urgency !== b.urgency) {
        return a.urgency === 'OUT_OF_STOCK' ? -1 : 1;
      }
      return a.currentStock - b.currentStock;
    });
  },

  /**
   * Prepares restock lines for a specific product.
   */
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
