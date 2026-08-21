'use client';

import React from 'react';
import type { AttributeDefinition } from '@/modules/attributes/types';
import { parseEnumValues } from '@/modules/attributes/types';

interface AttributeFieldRendererProps {
  definition: AttributeDefinition;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

/**
 * AttributeFieldRenderer — renders the correct input type for an attribute
 * based on the definition's dataType:
 *   - ENUM    → <select> with predefined options
 *   - TEXT    → <input type="text">
 *   - NUMBER  → <input type="number">
 *   - BOOLEAN → <input type="checkbox">
 */
export function AttributeFieldRenderer({
  definition,
  value,
  onChange,
  disabled = false,
}: AttributeFieldRendererProps) {
  const fieldId = `attr-${definition.id}`;

  return (
    <div className="attribute-field">
      <label className="form-field__label" htmlFor={fieldId}>
        {definition.name}
        {definition.isRequired && <span className="form-field__required">*</span>}
      </label>

      {definition.dataType === 'ENUM' && (
        <select
          id={fieldId}
          className="form-field__input attribute-field--enum"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={definition.isRequired}
          disabled={disabled}
        >
          <option value="">Select {definition.name}…</option>
          {parseEnumValues(definition).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      )}

      {definition.dataType === 'TEXT' && (
        <input
          id={fieldId}
          type="text"
          className="form-field__input attribute-field--text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={definition.isRequired}
          disabled={disabled}
          placeholder={`Enter ${definition.name.toLowerCase()}…`}
        />
      )}

      {definition.dataType === 'NUMBER' && (
        <input
          id={fieldId}
          type="number"
          className="form-field__input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={definition.isRequired}
          disabled={disabled}
          step="any"
        />
      )}

      {definition.dataType === 'BOOLEAN' && (
        <label className="attribute-field--checkbox">
          <input
            id={fieldId}
            type="checkbox"
            checked={value === 'true'}
            onChange={(e) => onChange(e.target.checked ? 'true' : 'false')}
            disabled={disabled}
          />
          <span>{definition.name}</span>
        </label>
      )}
    </div>
  );
}

// ─── VariantAttributeSet ──────────────────────────────────────────────────────

interface VariantAttributeSetProps {
  definitions: AttributeDefinition[];
  values: Record<string, string>; // attributeDefinitionId → value
  onChange: (definitionId: string, value: string) => void;
  disabled?: boolean;
}

/**
 * VariantAttributeSet — renders a set of AttributeFieldRenderers for
 * all variant-level attributes (e.g., Size for CLOTHING).
 */
export function VariantAttributeSet({
  definitions,
  values,
  onChange,
  disabled = false,
}: VariantAttributeSetProps) {
  return (
    <div className="variant-attribute-set">
      {definitions.map((def) => (
        <AttributeFieldRenderer
          key={def.id}
          definition={def}
          value={values[def.id] ?? ''}
          onChange={(v) => onChange(def.id, v)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
