'use client';

import React from 'react';
import type { InventoryMovement } from '@/modules/inventory/types';

const MOVEMENT_LABELS: Record<string, { label: string; color: string }> = {
  PURCHASE:          { label: 'Stock Added',       color: 'success' },
  SALE:              { label: 'Sold',              color: 'info'    },
  RETURN_TO_STOCK:   { label: 'Returned to Stock', color: 'warning' },
  RETURN_DAMAGED:    { label: 'Returned Damaged',  color: 'error'   },
  DAMAGE_WRITE_OFF:  { label: 'Damage Write-off',  color: 'error'   },
  LOSS_WRITE_OFF:    { label: 'Loss Write-off',    color: 'error'   },
  TRANSFER_OUT:      { label: 'Transferred Out',   color: 'muted'   },
  TRANSFER_IN:       { label: 'Transferred In',    color: 'success' },
  MANUAL_ADJUSTMENT: { label: 'Manual Adjustment', color: 'warning' },
};

interface MovementTimelineProps {
  movements: InventoryMovement[];
}

export function MovementTimeline({ movements }: MovementTimelineProps) {
  if (movements.length === 0) {
    return (
      <div className="movement-timeline--empty">
        <p>No movement history yet.</p>
      </div>
    );
  }

  return (
    <ol className="movement-timeline" aria-label="Movement history">
      {movements.map((m, i) => {
        const meta = MOVEMENT_LABELS[m.movementType] ?? { label: m.movementType, color: 'muted' };
        const date = new Date(m.performedAt);
        return (
          <li
            key={m.id}
            className={`movement-timeline__item movement-timeline__item--${meta.color}`}
          >
            {i < movements.length - 1 && (
              <div className="movement-timeline__connector" aria-hidden="true" />
            )}
            <div className="movement-timeline__dot" aria-hidden="true" />
            <div className="movement-timeline__content">
              <div className="movement-timeline__header">
                <span className={`status-badge status-badge--${meta.color}`}>
                  {meta.label}
                </span>
                <time
                  className="movement-timeline__time"
                  dateTime={m.performedAt}
                >
                  {date.toLocaleDateString('en-IN', {
                    day: 'numeric', month: 'short', year: 'numeric',
                  })}
                  {' '}
                  {date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                </time>
              </div>
              <div className="movement-timeline__detail">
                <span className="movement-timeline__status-change">
                  {m.fromStatus} → {m.toStatus}
                </span>
                {m.notes && (
                  <span className="movement-timeline__notes">{m.notes}</span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
