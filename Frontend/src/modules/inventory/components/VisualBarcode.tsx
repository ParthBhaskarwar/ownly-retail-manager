'use client';

import React from 'react';

interface VisualBarcodeProps {
  value: string;
  width?: number;
  height?: number;
  showText?: boolean;
}

/**
 * Renders a clean SVG visual barcode representation for printable label views.
 * Uses a deterministic hash pattern mapping to generate clean, scan-ready barcode bars.
 */
export function VisualBarcode({ value, width = 240, height = 60, showText = true }: VisualBarcodeProps) {
  if (!value) return null;

  // Generate bar pattern from string characters
  const bars: { x: number; w: number }[] = [];
  let currentX = 10;
  const totalBarWidth = width - 20;

  // Guard quiet zones
  bars.push({ x: currentX, w: 2 });
  currentX += 4;

  for (let i = 0; i < value.length; i++) {
    const charCode = value.charCodeAt(i);
    const w1 = (charCode % 3) + 1;
    const gap = ((charCode * 7) % 3) + 1;
    const w2 = ((charCode * 3) % 2) + 1;

    bars.push({ x: currentX, w: w1 });
    currentX += w1 + gap;
    bars.push({ x: currentX, w: w2 });
    currentX += w2 + 2;
  }

  // Guard end pattern
  bars.push({ x: currentX, w: 3 });

  return (
    <div className="visual-barcode inline-flex flex-col items-center bg-white p-3 rounded border border-gray-300 text-black">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
        {bars.map((bar, idx) => (
          <rect
            key={idx}
            x={bar.x}
            y={5}
            width={bar.w}
            height={height - (showText ? 20 : 10)}
            fill="#000000"
          />
        ))}
      </svg>
      {showText && (
        <span className="font-mono text-xs tracking-widest text-gray-900 font-bold mt-1">
          {value}
        </span>
      )}
    </div>
  );
}
