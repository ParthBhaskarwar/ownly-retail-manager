/**
 * Display text and colour tone for AI decisions — one place, so the badge on
 * the dashboard and the header on the restock screen always agree.
 */

import type { AiDecision, LifecycleStage, OwnerAction, ProductAction } from './types';

export type Tone = 'buy' | 'trial' | 'hold' | 'avoid' | 'neutral';

export const DECISION_META: Record<AiDecision, { label: string; tone: Tone; hint: string }> = {
  STRONG_BUY:     { label: 'Strong Buy',     tone: 'buy',   hint: 'Fast, profitable and low risk — buy with confidence.' },
  CONTROLLED_BUY: { label: 'Controlled Buy', tone: 'buy',   hint: 'Worth buying, but only about a month of demand.' },
  TRIAL:          { label: 'Trial',          tone: 'trial', hint: 'Too little evidence — buy a small test quantity first.' },
  HOLD:           { label: 'Hold',           tone: 'hold',  hint: 'Do not buy now.' },
  AVOID:          { label: 'Avoid',          tone: 'avoid', hint: 'Likely to become dead stock or be returned.' },
};

export const ACTION_META: Record<ProductAction, { label: string; tone: Tone }> = {
  RESTOCK:        { label: 'Restock',        tone: 'buy' },
  CONTROLLED_BUY: { label: 'Controlled Buy', tone: 'buy' },
  TRIAL:          { label: 'Trial',          tone: 'trial' },
  HOLD:           { label: 'Hold',           tone: 'hold' },
  DISCOUNT:       { label: 'Discount',       tone: 'hold' },
  CLEARANCE:      { label: 'Clearance',      tone: 'avoid' },
  AVOID:          { label: 'Avoid',          tone: 'avoid' },
};

export const LIFECYCLE_LABEL: Record<LifecycleStage, string> = {
  NEW: 'New', GROWING: 'Growing', MATURE: 'Mature', DECLINING: 'Declining', DEAD: 'Not selling',
};

export const OWNER_ACTION_LABEL: Record<OwnerAction, string> = {
  ACCEPTED: 'Accepted', MODIFIED: 'Modified', IGNORED: 'Ignored', REJECTED: 'Rejected',
};

export const pct = (x: number | null | undefined, digits = 0) =>
  x === null || x === undefined ? '—' : `${(x * 100).toFixed(digits)}%`;

export const inr = (n: number) =>
  '₹' + Math.round(n).toLocaleString('en-IN');
