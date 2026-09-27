/**
 * Week 7 AI types — mirrors Backend/src/services/ai/ai.types.ts and the
 * ai_predictions row shape. Keep the two in sync.
 */

export type AiDecision = 'STRONG_BUY' | 'CONTROLLED_BUY' | 'TRIAL' | 'HOLD' | 'AVOID';
export type ProductAction =
  | 'RESTOCK' | 'HOLD' | 'CONTROLLED_BUY' | 'TRIAL' | 'DISCOUNT' | 'CLEARANCE' | 'AVOID';
export type LifecycleStage = 'NEW' | 'GROWING' | 'MATURE' | 'DECLINING' | 'DEAD';
export type ConfidenceTier = 'HIGH' | 'MEDIUM' | 'LOW';
export type DataSufficiency = 'SUFFICIENT' | 'LIMITED' | 'INSUFFICIENT';
export type OwnerAction = 'ACCEPTED' | 'MODIFIED' | 'IGNORED' | 'REJECTED';
export type PredictionSource = 'LIVE' | 'BACKTEST';

export interface AiScore {
  value: number;
  label: 'High' | 'Medium' | 'Low';
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
  impact: 'positive' | 'negative' | 'neutral';
}

export interface SizeRecommendation {
  size: string;
  quantity: number;
  demandShare: number;
  onHand: number;
}

export interface Comparable {
  productId: string;
  name: string;
  basis: 'PHOTO' | 'SUBCATEGORY_PRICE' | 'CATEGORY_PRICE' | 'STORE';
  weight: number;
  sellingPrice: number;
  unitsPerWeek: number;
}

export interface AiForecast {
  horizonDays: number;
  demandMean: number;
  demandQ10: number;
  demandQ90: number;
  expectedSales: number;
  expectedSalesQ10: number;
  expectedSalesQ90: number;
  firstSaleProbability: number;
  expectedSellThrough: number;
  clearanceDays: number | null;
  unitsPerWeek: number;
  seasonalFactor: number;
  stockAssumed: number;
}

export interface ProductMetrics {
  units7: number;
  units15: number;
  units30: number;
  timeToFirstSaleDays: number | null;
  sellThroughLifetime: number | null;
  avgStockAgeDays: number | null;
  discountDependency: number | null;
  returnRate: number | null;
  realisedMarginPct: number | null;
  priceBand: { band: 'Budget' | 'Mid' | 'Premium'; relativeToSubcategory: number } | null;
  lifecycleStage: LifecycleStage;
  sizeDemand: Array<{ size: string; unitsPerWeek: number; onHand: number; soldLast180: number }>;
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
  recommendation: {
    decision: AiDecision;
    quantity: number;
    sizeMix: SizeRecommendation[];
    coverDays: number | null;
    productAction: ProductAction;
  };
  confidence: {
    value: number;
    tier: ConfidenceTier;
    dataSufficiency: DataSufficiency;
    explanation: string;
  };
  reasons: AiReason[];
  comparables: Comparable[];
  baselineUnits: number | null;
}

export interface Prediction {
  id: string;
  productId: string | null;
  productName: string | null;
  analysisType: 'PRODUCT_ANALYSIS' | 'RESTOCK';
  source: PredictionSource;
  modelVersion: string;
  asOf: string;
  horizonDays: number;
  inputs: Record<string, unknown>;
  predictedUnits: number;
  predictedUnitsQ10: number;
  predictedUnitsQ90: number;
  firstSaleProbability: number | null;
  expectedSellThrough: number | null;
  stockAtAsOf: number;
  recommendedQuantity: number;
  recommendedSizeMix: SizeRecommendation[];
  decision: AiDecision;
  confidence: number;
  confidenceTier: ConfidenceTier;
  dataSufficiency: DataSufficiency;
  reasons: AiReason[];
  ownerAction: OwnerAction | null;
  ownerQuantity: number | null;
  ownerNote: string | null;
  decidedAt: string | null;
  restockBatchId: string | null;
  actualUnits: number | null;
  actualSellThrough: number | null;
  evaluatedAt: string | null;
  createdAt: string;
}

export interface EvaluationSummary {
  source: PredictionSource;
  count: number;
  modelVersions: string[];
  forecast: {
    totalPredicted: number;
    totalActual: number;
    mae: number | null;
    wape: number | null;
    bias: number | null;
    baselineWape: number | null;
    liftOverBaseline: number | null;
    intervalCoverage: number | null;
  };
  firstSale: {
    brier: number | null;
    buckets: Array<{ range: string; count: number; predicted: number; actual: number }>;
  };
  byTier: Array<{ tier: ConfidenceTier; count: number; wape: number | null; coverage: number | null }>;
  byDecision: Array<{
    decision: AiDecision; count: number; predictedSellThrough: number | null;
    actualSellThrough: number | null; avgActualUnits: number;
  }>;
  series: Array<{ period: string; predicted: number; actual: number; baseline: number }>;
  ownerDecisions: Record<OwnerAction | 'PENDING', number>;
}

export interface AiOverview {
  modelVersion: string;
  asOf: string;
  productsScored: number;
  decisions: Record<AiDecision, number>;
  actions: Record<string, number>;
  expectedUnits30: number;
  expectedRevenue30: number;
  stockValueAtRisk: number;
  restockCandidates: Array<{
    productId: string; name: string; decision: AiDecision; quantity: number;
    demandScore: number; confidenceTier: ConfidenceTier; stockOnHand: number; unitsPerWeek: number;
  }>;
  deadStock: Array<{
    productId: string; name: string; action: string; deadStockRisk: number;
    stockOnHand: number; stockValue: number; avgStockAgeDays: number | null;
  }>;
  hasHistory: boolean;
}

export interface RestockRecommendRequest {
  productId?: string;
  name?: string;
  subcategoryId?: string;
  sellingPrice?: number;
  costPrice?: number;
  sizes?: string[];
  plannedQuantity?: number | null;
  photo?: string;
}

export interface DecisionRequest {
  action: OwnerAction;
  quantity?: number;
  sizeMix?: Array<{ size: string; quantity: number }>;
  note?: string;
  execute?: boolean;
  purchaseCostPrice?: number;
}
