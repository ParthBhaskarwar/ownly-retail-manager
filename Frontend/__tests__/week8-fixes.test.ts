import { computeTax, round2 } from '../src/lib/money';
import { getDateRange } from '../src/modules/reports/services/ReportService';
import { applyPhotoSuggestions } from '../src/modules/attributes/applySuggestions';
import type { AttributeDefinition } from '../src/modules/attributes/types';

describe('computeTax (mirrors the server so the POS preview matches the charge)', () => {
  test('no GST configured leaves the total alone', () => {
    expect(computeTax(undefined, 1000)).toEqual({ taxAmount: 0, grandTotal: 1000 });
    expect(computeTax({ gstEnabled: false, gstRate: 18, inclusiveTax: false }, 1000)).toEqual({
      taxAmount: 0,
      grandTotal: 1000,
    });
  });

  test('exclusive GST is added on top', () => {
    expect(computeTax({ gstEnabled: true, gstRate: 18, inclusiveTax: false }, 1000)).toEqual({
      taxAmount: 180,
      grandTotal: 1180,
    });
  });

  test('inclusive GST is carved out of the price, total unchanged', () => {
    const r = computeTax({ gstEnabled: true, gstRate: 18, inclusiveTax: true }, 1180);
    expect(r.grandTotal).toBe(1180);
    expect(r.taxAmount).toBe(180);
  });

  test('round2 avoids floating point drift', () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
  });
});

describe('getDateRange', () => {
  const now = new Date(2026, 8, 28, 15, 30); // 28 Sep 2026, local time

  test('ALL_TIME has no bounds', () => {
    expect(getDateRange('ALL_TIME', now)).toEqual({});
  });

  test('TODAY is a single day', () => {
    expect(getDateRange('TODAY', now)).toEqual({ from: '2026-09-28', to: '2026-09-28' });
  });

  test('LAST_7_DAYS reaches back seven days inclusive of today as the end', () => {
    expect(getDateRange('LAST_7_DAYS', now)).toEqual({ from: '2026-09-21', to: '2026-09-28' });
  });

  test('THIS_MONTH starts on the 1st', () => {
    expect(getDateRange('THIS_MONTH', now)).toEqual({ from: '2026-09-01', to: '2026-09-28' });
  });

  test('LAST_90_DAYS crosses month boundaries correctly', () => {
    expect(getDateRange('LAST_90_DAYS', now)).toEqual({ from: '2026-06-30', to: '2026-09-28' });
  });
});

describe('applyPhotoSuggestions', () => {
  const def = (id: string, name: string, enumValues: string[] | null = null): AttributeDefinition =>
    ({
      id,
      name,
      dataType: enumValues ? 'ENUM' : 'TEXT',
      enumValues: enumValues ? JSON.stringify(enumValues) : null,
    }) as unknown as AttributeDefinition;

  const defs = [
    def('colour', 'Colour'),
    def('pattern', 'Pattern', ['Solid', 'Striped', 'Checked']),
  ];

  test('overwrites what is already typed — the user clicked Apply', () => {
    const out = applyPhotoSuggestions(defs, { colour: 'Red', pattern: 'Solid' }, {
      colours: ['Navy Blue'],
      pattern: 'Striped',
      patternConfidence: 0.9,
    });
    expect(out.colour).toBe('Navy Blue');
    expect(out.pattern).toBe('Striped');
  });

  test('matches pattern options case-insensitively and ignores unknown patterns', () => {
    const ok = applyPhotoSuggestions(defs, {}, { colours: [], pattern: 'checked', patternConfidence: 0.5 });
    expect(ok.pattern).toBe('Checked');

    const unknown = applyPhotoSuggestions(defs, { pattern: 'Solid' }, { colours: [], pattern: 'Paisley', patternConfidence: 0.5 });
    expect(unknown.pattern).toBe('Solid');
  });

  test('does not mutate its input', () => {
    const input = { colour: 'Red' };
    applyPhotoSuggestions(defs, input, { colours: ['Blue'], pattern: 'Solid', patternConfidence: 1 });
    expect(input.colour).toBe('Red');
  });
});
