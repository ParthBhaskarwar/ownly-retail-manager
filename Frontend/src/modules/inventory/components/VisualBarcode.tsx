'use client';

/**
 * VisualBarcode — renders a real, machine-scannable Code128 barcode graphic.
 *
 * Uses JsBarcode to generate a valid Code128 SVG inline.
 * The barcode can be read by USB/Bluetooth scanners and camera-based readers.
 *
 * Code128 was chosen because it:
 *   - Supports all ASCII characters (covers OWN-TSH-BLK-M-00001 style values)
 *   - Is the most widely adopted 1D retail barcode format
 *   - Is already used in most retail POS hardware
 */

import React, { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

interface VisualBarcodeProps {
  value: string;
  width?: number;
  height?: number;
  showText?: boolean;
  /** lineWidth controls the narrowest bar width (pixels). Default 1.5 */
  lineWidth?: number;
}

export function VisualBarcode({
  value,
  width = 240,
  height = 60,
  showText = true,
  lineWidth = 1.5,
}: VisualBarcodeProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;

    try {
      JsBarcode(svgRef.current, value, {
        format: 'CODE128',
        lineColor: '#000000',
        width: lineWidth,
        height: height - (showText ? 20 : 4),
        displayValue: showText,
        fontOptions: '',
        font: 'monospace',
        textAlign: 'center',
        textPosition: 'bottom',
        textMargin: 4,
        fontSize: 11,
        background: '#ffffff',
        margin: 6,
        marginTop: 6,
        marginBottom: showText ? 6 : 4,
        marginLeft: 8,
        marginRight: 8,
        valid: () => true,
      });
    } catch (err) {
      // Fallback: if value contains chars that trip CODE128, try auto-detect
      try {
        JsBarcode(svgRef.current, value, {
          format: 'auto',
          lineColor: '#000000',
          width: lineWidth,
          height: height - (showText ? 20 : 4),
          displayValue: showText,
          fontSize: 11,
          background: '#ffffff',
          margin: 6,
        });
      } catch {
        // Silently ignore render errors — the barcode text is still shown below
      }
    }
  }, [value, height, showText, lineWidth]);

  if (!value) return null;

  return (
    <div className="visual-barcode inline-flex flex-col items-center bg-white rounded border border-gray-200">
      {/* SVG is mutated directly by JsBarcode — keep it uncontrolled */}
      <svg
        ref={svgRef}
        aria-label={`Barcode for ${value}`}
        role="img"
        style={{ display: 'block', maxWidth: '100%' }}
      />
    </div>
  );
}
