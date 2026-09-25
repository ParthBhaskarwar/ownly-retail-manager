import { db } from '../../src/db/client';
import { ProductService } from '../../src/services/product.service';
import { AttributeService } from '../../src/services/attribute.service';
import { CLOTHING_TEMPLATE_ID } from '../../src/db/seeds/001_clothing_template';

describe('Category-Specific Attributes & Photo Intelligence Integration Tests', () => {
  let storeId: string;
  let userId: string;
  let topwearCatId: string;
  let bottomwearCatId: string;
  let neckAttrDefId: string;
  let sleeveAttrDefId: string;
  let fitAttrDefId: string;
  let riseAttrDefId: string;
  let sizeAttrDefId: string;

  beforeAll(async () => {
    // Fetch or create test user
    let testUser = await db('users').first();
    if (!testUser) {
      const u = await db('users').insert({
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Test Owner',
        email: 'testowner@ownly.local',
        phone: '9999999999',
        passwordHash: 'hash',
        role: 'OWNER',
      }).returning('*');
      testUser = u[0];
    }
    userId = testUser.id;

    // Fetch or create test store
    let testStore = await db('stores').where({ ownerId: userId }).first();
    if (!testStore) {
      testStore = await db('stores').first();
    }
    if (!testStore) {
      const s = await db('stores').insert({
        id: '22222222-2222-4222-8222-222222222222',
        ownerId: userId,
        name: 'Test Store',
        retailType: 'clothing',
      }).returning('*');
      testStore = s[0];
    }
    storeId = testStore.id;

    // Fetch categories
    const topCat = await db('categories').where({ name: 'Topwear' }).first();
    const botCat = await db('categories').where({ name: 'Bottomwear' }).first();
    topwearCatId = topCat ? topCat.id : 'cat-topwear';
    bottomwearCatId = botCat ? botCat.id : 'cat-bottomwear';

    // Fetch attribute defs
    const defs = await db('attribute_definitions').where({ retail_template_id: CLOTHING_TEMPLATE_ID });
    neckAttrDefId = defs.find((d) => d.name === 'Neck')?.id || '';
    sleeveAttrDefId = defs.find((d) => d.name === 'Sleeve')?.id || '';
    fitAttrDefId = defs.find((d) => d.name === 'Fit')?.id || '';
    riseAttrDefId = defs.find((d) => d.name === 'Rise')?.id || '';
    sizeAttrDefId = defs.find((d) => d.name === 'Size')?.id || '';
  });

  describe('Category-Specific Attribute Filtering', () => {
    it('should filter out topwear attributes when saving bottomwear product', async () => {
      if (!bottomwearCatId || !neckAttrDefId || !fitAttrDefId || !riseAttrDefId) return;

      const inputValues = [
        { attributeDefinitionId: neckAttrDefId, value: 'V-Neck' }, // Topwear only
        { attributeDefinitionId: fitAttrDefId, value: 'Slim Fit' }, // Global / Bottomwear
        { attributeDefinitionId: riseAttrDefId, value: 'High Rise' }, // Bottomwear only
      ];

      const filtered = await AttributeService.filterApplicableAttributes(bottomwearCatId, inputValues);
      const filteredDefIds = filtered.map((f) => f.attributeDefinitionId);

      expect(filteredDefIds).not.toContain(neckAttrDefId);
      expect(filteredDefIds).toContain(fitAttrDefId);
      expect(filteredDefIds).toContain(riseAttrDefId);
    });

    it('should retain neck and sleeve attributes when saving topwear product', async () => {
      if (!topwearCatId || !neckAttrDefId || !sleeveAttrDefId) return;

      const inputValues = [
        { attributeDefinitionId: neckAttrDefId, value: 'Round Neck' },
        { attributeDefinitionId: sleeveAttrDefId, value: 'Short Sleeve' },
      ];

      const filtered = await AttributeService.filterApplicableAttributes(topwearCatId, inputValues);
      expect(filtered.length).toBe(2);
    });
  });

  describe('Product Creation & Update with Photos & Attributes', () => {
    const sampleBase64Photo = 'data:image/jpeg;base64,' + Buffer.from('fake-jpeg-image-bytes-for-test-purposes-only').toString('base64');

    it('should create product with photo urls even when the photo cannot be embedded', async () => {
      const uniqueSku = `TESTSKU-${Date.now()}`;
      const product = await ProductService.createProduct({
        storeId,
        retailTemplateId: CLOTHING_TEMPLATE_ID,
        categoryId: topwearCatId,
        name: 'Test Photo T-Shirt',
        baseSku: uniqueSku,
        baseSellingPrice: 500,
        baseCostPrice: 200,
        imageUrls: [sampleBase64Photo],
        attributeValues: neckAttrDefId ? [{ attributeDefinitionId: neckAttrDefId, value: 'Round Neck' }] : [],
        variants: [
          {
            sku: `${uniqueSku}-M`,
            displayName: 'Test Photo T-Shirt — M',
            attributeValues: sizeAttrDefId ? [{ attributeDefinitionId: sizeAttrDefId, value: 'M' }] : [],
          },
        ],
        createdBy: userId,
      });

      expect(product.id).toBeDefined();
      expect(product.imageUrls).toContain(sampleBase64Photo);

      // The sample bytes are not a real image, so photo AI must simply skip it:
      // saving a product never depends on (or fails because of) embeddings.
      const dbRow = await db('products').where({ id: product.id }).first();
      expect(dbRow.imageUrls).toContain(sampleBase64Photo);
    });

    it('should update product attributes and photos properly', async () => {
      const uniqueSku = `TESTUP-${Date.now()}`;
      const product = await ProductService.createProduct({
        storeId,
        retailTemplateId: CLOTHING_TEMPLATE_ID,
        categoryId: topwearCatId,
        name: 'Test Update Product',
        baseSku: uniqueSku,
        baseSellingPrice: 1000,
        baseCostPrice: 400,
        imageUrls: [],
        attributeValues: [],
        variants: [
          {
            sku: `${uniqueSku}-L`,
            displayName: 'Test Update Product — L',
            attributeValues: sizeAttrDefId ? [{ attributeDefinitionId: sizeAttrDefId, value: 'L' }] : [],
          },
        ],
        createdBy: userId,
      });

      // Update product with new category-specific attribute and photo
      const updated = await ProductService.updateProduct(storeId, product.id, {
        name: 'Updated Product Name',
        imageUrls: [sampleBase64Photo],
        attributeValues: neckAttrDefId ? [{ attributeDefinitionId: neckAttrDefId, value: 'V-Neck' }] : [],
        updatedBy: userId,
      });

      expect(updated.name).toBe('Updated Product Name');

      const detail = await ProductService.getProductDetail(storeId, product.id);
      expect(detail).not.toBeNull();
      expect(detail!.imageUrls).toContain(sampleBase64Photo);
      if (neckAttrDefId) {
        const neckAttr = detail!.attributes.find((a) => a.definition.id === neckAttrDefId);
        expect(neckAttr).toBeDefined();
        expect(neckAttr!.value).toBe('V-Neck');
      }
    });
  });
});
