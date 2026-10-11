'use client';

import React, { useEffect } from 'react';
import type { AttributeDefinition } from '../types';
import { getApplicableAttributes } from '../config/categoryAttributes';
import { AttributeFieldRenderer } from './AttributeFieldRenderer';

interface CategoryAttributeFormProps {
  definitions: AttributeDefinition[];
  categoryName?: string;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
}

export function CategoryAttributeForm({
  definitions,
  categoryName,
  values,
  onChange,
}: CategoryAttributeFormProps) {
  const applicableDefs = getApplicableAttributes(definitions, categoryName);

  // When category changes, purge any values belonging to definitions no longer applicable
  useEffect(() => {
    const applicableIds = new Set(applicableDefs.map((d) => d.id));
    const nextValues: Record<string, string> = {};
    let changed = false;

    Object.entries(values).forEach(([defId, val]) => {
      if (applicableIds.has(defId)) {
        nextValues[defId] = val;
      } else {
        changed = true; // Stale attribute purged
      }
    });

    if (changed) {
      onChange(nextValues);
    }
  }, [categoryName, applicableDefs, values, onChange]);

  if (applicableDefs.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between border-b border-gray-800 pb-2">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-violet-400">
          {categoryName ? `${categoryName} Attributes` : 'Product Attributes'}
        </h3>
        <span className="text-xs text-gray-400">
          {applicableDefs.length} attribute{applicableDefs.length !== 1 ? 's' : ''} applicable
        </span>
      </div>

      <div className="form-grid">
        {applicableDefs.map((def) => (
          <AttributeFieldRenderer
            key={def.id}
            definition={def}
            value={values[def.id] ?? ''}
            onChange={(val) =>
              onChange({
                ...values,
                [def.id]: val,
              })
            }
          />
        ))}
      </div>
    </div>
  );
}
