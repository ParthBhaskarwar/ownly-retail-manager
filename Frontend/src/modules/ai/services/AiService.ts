/**
 * AiService — Week 7 AI endpoints (/api/ai). All scoring runs on the server;
 * this module only calls it.
 */

import { apiClient } from '@/lib/apiClient';
import type {
  AiAnalysis, AiOverview, DecisionRequest, EvaluationSummary, Prediction,
  PredictionSource, RestockRecommendRequest,
} from '../types';

export const AiService = {
  getOverview(): Promise<AiOverview> {
    return apiClient.get<AiOverview>('/api/ai/overview');
  },

  analyseProduct(productId: string): Promise<{ analysis: AiAnalysis; predictionId: string }> {
    return apiClient.get(`/api/ai/products/${productId}/analysis`);
  },

  recommendRestock(body: RestockRecommendRequest): Promise<{
    analysis: AiAnalysis; predictionId: string; photoMessage?: string; photoMatches: number;
  }> {
    return apiClient.post('/api/ai/restock/recommend', body);
  },

  decide(predictionId: string, body: DecisionRequest): Promise<{
    prediction: Prediction; restock: { batchId: string; totalUnits: number } | null;
  }> {
    return apiClient.post(`/api/ai/predictions/${predictionId}/decision`, body);
  },

  listPredictions(filters: {
    source?: PredictionSource; analysisType?: 'PRODUCT_ANALYSIS' | 'RESTOCK';
    evaluated?: boolean; limit?: number; offset?: number;
  } = {}): Promise<{ items: Prediction[]; total: number }> {
    return apiClient.get('/api/ai/predictions', {
      query: {
        source: filters.source,
        analysisType: filters.analysisType,
        evaluated: filters.evaluated === undefined ? undefined : String(filters.evaluated),
        limit: filters.limit,
        offset: filters.offset,
      },
    });
  },

  getEvaluation(source: PredictionSource): Promise<EvaluationSummary> {
    return apiClient.get('/api/ai/evaluation', { query: { source } });
  },
};
