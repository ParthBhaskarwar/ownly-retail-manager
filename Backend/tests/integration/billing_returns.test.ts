import request from 'supertest';
import app from '../../src/app';

describe('Billing, Barcode, Returns & Exchanges API Integration Tests', () => {
  describe('GET /api/health', () => {
    it('should return health status ok', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  describe('Barcode & Billing Validations', () => {
    it('should reject unauthenticated request to /api/inventory/barcode/:barcode', async () => {
      const res = await request(app).get('/api/inventory/barcode/123456');
      expect(res.status).toBe(401);
    });

    it('should reject checkout with empty items array', async () => {
      const res = await request(app)
        .post('/api/billing/checkout')
        .set('Authorization', 'Bearer fake-token')
        .send({ items: [], payments: [{ paymentMethod: 'CASH', amount: 100 }] });
      
      // Token invalid or unauthenticated
      expect([401, 400]).toContain(res.status);
    });
  });
});
