/**
 * Week 7 AI types — the contract between the scoring engine, the API and the
 * frontend (Frontend/src/modules/ai/types.ts mirrors these).
 */

export type AiDecision = 'STRONG_BUY' | 'CONTROLLED_BUY' | 'TRIAL' | 'HOLD' | 'AVOID';
export type ProductAction =
  | 'RESTOCK' | 'HOLD' | 'CONTROLLED_BUY' | 'TRIAL' | 'DISCOUNT' | 'CLEARANCE' | 'AVOID';
export type LifecycleStage = 'NEW' | 'GROWING' | 'MATURE' | 'DECLINING' | 'DEAD';
export type ConfidenceTier = 'HIGH' | 'MEDIUM' | 'LOW';
export type DataSufficiency = 'SUFFICIENT' | 'LIMITED' | 'INSUFFICIENT';
export type OwnerAction = 'ACCEPTED' | 'MODIFIED' | 'IGNORED' | 'REJECTED';
export type ReasonImpact = 'positive' | 'negative' | 'neutral';

export interface AiScore {
  /** 0–100. For the two risk scores, higher is worse. */
  value: number;
  label: 'High' | 'Medium' | 'Low';
  /** One line saying what the number means for this product. */
  detail: string;
}

export interface AiScores {
  selling: AiScore;
  demand: AiScore;
  profitability: AiScore;
  deadStockRisk: AiScore;
  returnRisk: AiScore;
}

export interface AiReason {
  text: string;
  impact: ReasonImpact;
}

export interface SizeRecommendation {
  size: string;
  quantity: number;
  /** Estimated share of this product's demand, 0–1. */
  demandShare: number;
  onHand: number;
}

export interface Comparable {
  productId: string;
  name: string;
  basis: 'PHOTO' | 'SUBCATEGORY_PRICE' | 'CATEGORY_PRICE' | 'STORE';
  /** Photo similarity (0–1) or price-closeness weight. */
  weight: number;
  sellingPrice: number;
  /** Units per week while in stock (launch period for new-product analyses). */
  unitsPerWeek: number;
}

export interface AiForecast {
  horizonDays: number;
  /** Expected demand in the horizon (uncapped by stock). */
  demandMean: number;
  demandQ10: number;
  demandQ90: number;
  /** Expected units actually sold given the stock that would be on hand. */
  expectedSales: number;
  expectedSalesQ10: number;
  expectedSalesQ90: number;
  /** Probability of at least one sale in the horizon (while in stock). */
  firstSaleProbability: number;
  /** expectedSales / stock held, 0–1. */
  expectedSellThrough: number;
  /** Days to sell the stock held at the expected rate; null when demand ≈ 0. */
  clearanceDays: number | null;
  unitsPerWeek: number;
  seasonalFactor: number;
  /** The stock the forecast assumes: on hand + planned purchase. */
  stockAssumed: number;
}

export interface ProductMetrics {
  units7: number;
  units15: number;
  units30: number;
  timeToFirstSaleDays: number | null;
  sellThroughLifetime: number | null;
  avgStockAgeDays: number | null;
  /** Share of units sold at >5% below list price. */
  discountDependency: number | null;
  returnRate: number | null;
  realisedMarginPct: number | null;
  priceBand: { band: 'Budget' | 'Mid' | 'Premium'; relativeToSubcategory: number } | null;
  lifecycleStage: LifecycleStage;
  sizeDemand: Array<{ size: string; unitsPerWeek: number; onHand: number; soldLast180: number }>;
}

export interface AiRecommendation {
  decision: AiDecision;
  quantity: number;
  sizeMix: SizeRecommendation[];
  /** Days current stock lasts at the expected rate; null when demand ≈ 0. */
  coverDays: number | null;
  productAction: ProductAction;
}

export interface AiConfidence {
  value: number;
  tier: ConfidenceTier;
  dataSufficiency: DataSufficiency;
  explanation: string;
}

export interface AiAnalysis {
  modelVersion: string;
  asOf: string;
  subject: {
    productId: string | null;
    name: string;
    categoryName: string | null;
    subcategoryName: string | null;
    sellingPrice: number;
    costPrice: number;
    stockOnHand: number;
    plannedQuantity: number | null;
  };
  scores: AiScores;
  forecast: AiForecast;
  metrics: ProductMetrics | null;
  recommendation: AiRecommendation;
  confidence: AiConfidence;
  reasons: AiReason[];
  comparables: Comparable[];
  /** Naive carry-forward forecast (last 30 days' units), for measuring lift. */
  baselineUnits: number | null;
}
