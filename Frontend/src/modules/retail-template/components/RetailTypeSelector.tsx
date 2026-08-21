'use client';

import React, { useEffect, useState } from 'react';
import { RetailTemplateService } from '@/modules/retail-template/services/RetailTemplateService';
import type { RetailTemplate, RetailType } from '@/modules/retail-template/types';
import { Badge } from '@/shared/components/Badge';
import { Button } from '@/shared/components/Button';

interface RetailTypeSelectorProps {
  onSelect: (type: RetailType) => void;
  isLoading?: boolean;
  selectedType?: RetailType;
}

export function RetailTypeSelector({ onSelect, isLoading, selectedType }: RetailTypeSelectorProps) {
  const [templates, setTemplates] = useState<RetailTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    RetailTemplateService.getAll().then((all) => {
      setTemplates(all);
      setLoadingTemplates(false);
    });
  }, []);

  if (loadingTemplates) {
    return (
      <div className="retail-type-grid stagger-children">
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="skeleton retail-type-skeleton" />
        ))}
      </div>
    );
  }

  return (
    <div className="retail-type-selector">
      <div className="retail-type-grid stagger-children animate-fade-in-up">
        {templates.map((template) => (
          <RetailTypeCard
            key={template.retailType}
            template={template}
            isSelected={selectedType === template.retailType}
            isHovered={hovered === template.retailType}
            onHover={(t) => setHovered(t)}
            onSelect={onSelect}
            isSubmitting={isLoading}
          />
        ))}
      </div>
    </div>
  );
}

interface RetailTypeCardProps {
  template: RetailTemplate;
  isSelected: boolean;
  isHovered: boolean;
  onHover: (type: string | null) => void;
  onSelect: (type: RetailType) => void;
  isSubmitting?: boolean;
}

function RetailTypeCard({
  template,
  isSelected,
  isHovered,
  onHover,
  onSelect,
  isSubmitting,
}: RetailTypeCardProps) {
  const { retailType, enabled, label, description, icon } = template;

  return (
    <button
      id={`retail-type-${retailType.toLowerCase()}`}
      type="button"
      className={[
        'retail-type-card',
        enabled ? 'retail-type-card--enabled' : 'retail-type-card--disabled',
        isSelected ? 'retail-type-card--selected' : '',
        isHovered && enabled ? 'retail-type-card--hovered' : '',
      ].filter(Boolean).join(' ')}
      disabled={!enabled || isSubmitting}
      onClick={() => enabled && onSelect(retailType)}
      onMouseEnter={() => onHover(retailType)}
      onMouseLeave={() => onHover(null)}
      aria-pressed={isSelected}
      aria-label={`${label}${!enabled ? ' (Coming soon)' : ''}`}
    >
      {/* Coming soon overlay */}
      {!enabled && (
        <div className="retail-type-card__coming-soon">
          <Badge variant="neutral" size="sm">Coming Soon</Badge>
        </div>
      )}

      {/* Selected indicator */}
      {isSelected && (
        <div className="retail-type-card__selected-check" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z"/>
          </svg>
        </div>
      )}

      <div className="retail-type-card__icon" aria-hidden="true">{icon}</div>
      <div className="retail-type-card__label">{label}</div>
      <div className="retail-type-card__desc">{description}</div>
    </button>
  );
}
