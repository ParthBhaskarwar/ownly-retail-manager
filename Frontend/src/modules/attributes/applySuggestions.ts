import { parseEnumValues, type AttributeDefinition } from '@/modules/attributes/types';
import type { AttributeSuggestions } from '@/modules/product/types';

/**
 * Applies photo-AI colour / pattern suggestions to the product attribute values.
 *
 * The suggestion always wins over what is already typed — the user asked for it
 * by clicking "Apply". A pattern is only applied when the attribute actually
 * offers that option, so the enum select never ends up with an invalid value.
 * Returns a new values object (the input is not mutated).
 */
export function applyPhotoSuggestions(
  definitions: AttributeDefinition[],
  values: Record<string, string>,
  suggestions: AttributeSuggestions
): Record<string, string> {
  const updated = { ...values };
  const colourDef = definitions.find((d) => ['colour', 'color'].includes(d.name.toLowerCase()));
  const patternDef = definitions.find((d) => d.name.toLowerCase() === 'pattern');

  if (colourDef && suggestions.colours?.length > 0) {
    updated[colourDef.id] = suggestions.colours[0];
  }

  if (patternDef && suggestions.pattern) {
    const wanted = suggestions.pattern.toLowerCase();
    const match = parseEnumValues(patternDef).find((o) => o.toLowerCase() === wanted);
    if (match) updated[patternDef.id] = match;
  }

  return updated;
}
