import type { AttributeDefinition } from '../types';
import { parseApplicableCategories } from '../types';

/**
 * Filter attribute definitions to return ONLY those applicable to the selected category.
 *
 * Rules:
 * - Definitions with no applicableCategories (or null/empty array) apply globally to ALL categories.
 * - Definitions with applicableCategories apply ONLY if the selected categoryName is in the list.
 */
export function getApplicableAttributes(
  defs: AttributeDefinition[],
  categoryName?: string
): AttributeDefinition[] {
  if (!defs || defs.length === 0) return [];

  return defs.filter((def) => {
    const applicable = parseApplicableCategories(def);
    // Global attribute (applies to all categories)
    if (applicable.length === 0) return true;
    if (!categoryName) return true; // If no category selected yet, show global

    // Check if selected category is in the applicable list
    return applicable.some((c) => c.toLowerCase() === categoryName.toLowerCase());
  });
}
