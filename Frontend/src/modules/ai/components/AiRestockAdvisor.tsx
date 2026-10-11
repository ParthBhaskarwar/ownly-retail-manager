'use client';

/**
 * AiRestockAdvisor — the AI-assisted restocking screen (§2.13, Week 7).
 *
 *  1. Pick an existing product, or describe a new garment (optional photo,
 *     subcategory, price, cost, sizes).
 *  2. Optionally enter the quantity you were planning to buy.
 *  3. The AI returns scores, a 30-day forecast, a decision, a quantity, a
 *     size mix, confidence and reasons.
 *  4. The owner accepts, modifies (edits the size mix), ignores or rejects.
 *     Accepting or modifying for an existing product creates the stock right
 *     away — new unique barcodes, recorded as an AI-assisted restock batch.
 */

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuthContext } from '@/context/AuthContext';
import { ProductService } from '@/modules/product/services/ProductService';
import { CategoryService } from '@/modules/catalog/services/CategoryService';
import type { ProductSummary } from '@/modules/product/types';
import type { CategoryWithSubcategories } from '@/modules/catalog/types';
import { AiService } from '../services/AiService';
import { AiAnalysisView } from './AiAnalysisView';
import { OWNER_ACTION_LABEL, inr } from '../labels';
import type { AiAnalysis, OwnerAction } from '../types';

const STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Free Size'];

type Mode = 'existing' | 'new';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsDataURL(file);
  });
}

export function AiRestockAdvisor() {
  const searchParams = useSearchParams();
  const { user } = useAuthContext();
  const [mode, setMode] = useState<Mode>('existing');

  // ── Existing product ──
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ProductSummary[]>([]);
  const [product, setProduct] = useState<{ id: string; name: string; sku: string } | null>(null);

  // ── New garment ──
  const [catalog, setCatalog] = useState<CategoryWithSubcategories[]>([]);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [sizes, setSizes] = useState<string[]>(['S', 'M', 'L', 'XL']);
  const [photo, setPhoto] = useState<string | null>(null);

  // ── Shared ──
  const [planned, setPlanned] = useState('');
  const [analysing, setAnalysing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [predictionId, setPredictionId] = useState<string | null>(null);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);

  // ── Decision ──
  const [mix, setMix] = useState<Record<string, number>>({});
  const [unitCost, setUnitCost] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState('');
  const [deciding, setDeciding] = useState(false);
  const [outcome, setOutcome] = useState<{ action: OwnerAction; units: number | null } | null>(null);

  // Preselect ?productId= (from the product page's "Plan a restock with AI").
  useEffect(() => {
    const id = searchParams.get('productId');
    if (!id) return;
    ProductService.getProductDetail(id).then((p) => {
      if (p) setProduct({ id: p.id, name: p.name, sku: p.baseSku });
    }).catch(() => undefined);
  }, [searchParams]);

  useEffect(() => {
    if (mode === 'new' && catalog.length === 0) {
      CategoryService.getCategoriesWithSubcategories().then(setCatalog).catch(() => setError('Could not load categories.'));
    }
  }, [mode, catalog.length]);

  useEffect(() => {
    if (mode !== 'existing' || query.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      ProductService.searchProducts({ storeId: user?.storeId ?? '', query: query.trim(), pageSize: 8 })
        .then((r) => setResults(r.items))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query, mode, user?.storeId]);

  const subcategories = useMemo(
    () => catalog.find((c) => c.id === categoryId)?.subcategories ?? [],
    [catalog, categoryId]
  );

  const reset = () => {
    setAnalysis(null); setPredictionId(null); setOutcome(null); setRejecting(false); setNote(''); setError(null);
  };

  const analyse = async () => {
    reset();
    const plannedQuantity = planned.trim() === '' ? null : Math.max(0, Math.round(Number(planned)));
    if (mode === 'existing' && !product) { setError('Choose a product first.'); return; }
    if (mode === 'new') {
      if (!subcategoryId) { setError('Choose a category and subcategory.'); return; }
      if (!(Number(sellingPrice) > 0)) { setError('Enter the planned selling price.'); return; }
      if (sizes.length === 0) { setError('Choose at least one size.'); return; }
    }

    setAnalysing(true);
    try {
      const res = await AiService.recommendRestock(mode === 'existing'
        ? { productId: product!.id, plannedQuantity }
        : {
            name: name.trim() || undefined,
            subcategoryId,
            sellingPrice: Number(sellingPrice),
            costPrice: costPrice ? Number(costPrice) : undefined,
            sizes,
            plannedQuantity,
            photo: photo ?? undefined,
          });
      setAnalysis(res.analysis);
      setPredictionId(res.predictionId);
      setPhotoMessage(res.photoMessage ?? null);
      setMix(Object.fromEntries(res.analysis.recommendation.sizeMix.map((s) => [s.size, s.quantity])));
      setUnitCost(String(res.analysis.subject.costPrice || ''));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAnalysing(false);
    }
  };

  const recommendedMix = useMemo(
    () => Object.fromEntries((analysis?.recommendation.sizeMix ?? []).map((s) => [s.size, s.quantity])),
    [analysis]
  );
  const mixTotal = Object.values(mix).reduce((a, b) => a + (b || 0), 0);
  const modified = analysis ? Object.keys(mix).some((k) => (mix[k] || 0) !== (recommendedMix[k] || 0)) : false;
  const isExisting = Boolean(analysis?.subject.productId);

  const decide = async (action: OwnerAction) => {
    if (!predictionId || !analysis) return;
    if (action === 'REJECTED' && !note.trim()) { setError('Please say why you are rejecting the recommendation.'); return; }
    setDeciding(true);
    setError(null);
    try {
      const buying = action === 'ACCEPTED' || action === 'MODIFIED';
      const res = await AiService.decide(predictionId, {
        action,
        sizeMix: action === 'MODIFIED' ? Object.entries(mix).map(([size, quantity]) => ({ size, quantity: quantity || 0 })) : undefined,
        note: note.trim() || undefined,
        execute: buying && isExisting,
        purchaseCostPrice: buying && isExisting && unitCost ? Number(unitCost) : undefined,
      });
      setOutcome({ action, units: res.restock?.totalUnits ?? null });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDeciding(false);
    }
  };

  const sizeMixEditor = analysis && (
    <table className="ai-size-table">
      <thead>
        <tr><th>Size</th><th className="num">Demand</th><th className="num">On hand</th><th className="num">AI</th><th className="num">Buy</th></tr>
      </thead>
      <tbody>
        {analysis.recommendation.sizeMix.map((s) => (
          <tr key={s.size}>
            <td><strong>{s.size}</strong></td>
            <td className="num">{Math.round(s.demandShare * 100)}%</td>
            <td className="num">{s.onHand}</td>
            <td className="num">{s.quantity}</td>
            <td className="num">
              <input
                type="number" min={0} max={10000} inputMode="numeric"
                aria-label={`Buy quantity for size ${s.size}`}
                value={mix[s.size] ?? 0}
                disabled={!!outcome}
                onChange={(e) => setMix({ ...mix, [s.size]: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
              />
            </td>
          </tr>
        ))}
        <tr>
          <td colSpan={3}><strong>Total</strong></td>
          <td className="num">{analysis.recommendation.quantity}</td>
          <td className="num"><strong>{mixTotal}</strong></td>
        </tr>
      </tbody>
    </table>
  );

  return (
    <div className="ai-advisor">
      {/* ── Inputs ── */}
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
        <div className="ai-mode" role="group" aria-label="What are you restocking?">
          <button type="button" aria-pressed={mode === 'existing'} onClick={() => { setMode('existing'); reset(); }}>Existing product</button>
          <button type="button" aria-pressed={mode === 'new'} onClick={() => { setMode('new'); reset(); }}>New garment</button>
        </div>

        {mode === 'existing' ? (
          <div className="form-field">
            <label className="form-label" htmlFor="ai-product-search">Product</label>
            {product ? (
              <div className="ai-photo-drop">
                <div style={{ flex: 1 }}>
                  <strong style={{ color: 'var(--color-ink)' }}>{product.name}</strong>
                  <div className="ai-meta">{product.sku}</div>
                </div>
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setProduct(null); reset(); }}>Change</button>
              </div>
            ) : (
              <>
                <input
                  id="ai-product-search" className="form-input" type="search" autoComplete="off"
                  placeholder="Search by name or SKU…" value={query} onChange={(e) => setQuery(e.target.value)}
                />
                {results.length > 0 && (
                  <ul className="ai-picklist" role="listbox">
                    {results.map((p) => (
                      <li key={p.id}>
                        <button type="button" onClick={() => { setProduct({ id: p.id, name: p.name, sku: p.baseSku }); setResults([]); setQuery(''); }}>
                          {p.name}
                          <small>{p.baseSku} · {p.totalInStock} in stock · {inr(p.baseSellingPrice)}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            <div className="form-field">
              <label className="form-label" htmlFor="ai-photo">Garment photo <span className="ai-meta">(optional — finds look-alikes)</span></label>
              <div className="ai-photo-drop">
                {photo ? <img src={photo} alt="Garment preview" /> : <span aria-hidden="true">📷</span>}
                <input
                  id="ai-photo" type="file" accept="image/*" capture="environment"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 5 * 1024 * 1024) { setError('Please use a photo under 5 MB.'); return; }
                    setPhoto(await readFileAsDataUrl(file));
                  }}
                />
                {photo && <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPhoto(null)}>Remove</button>}
              </div>
            </div>
            <div className="form-field">
              <label className="form-label" htmlFor="ai-name">Name <span className="ai-meta">(optional)</span></label>
              <input id="ai-name" className="form-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Indigo cotton kurta" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              <div className="form-field">
                <label className="form-label" htmlFor="ai-category">Category</label>
                <select id="ai-category" className="form-select" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId(''); }}>
                  <option value="">Choose…</option>
                  {catalog.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="ai-subcategory">Subcategory</label>
                <select id="ai-subcategory" className="form-select" value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)} disabled={!categoryId}>
                  <option value="">Choose…</option>
                  {subcategories.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="ai-price">Selling price (₹)</label>
                <input id="ai-price" className="form-input" type="number" min={1} inputMode="decimal" value={sellingPrice} onChange={(e) => setSellingPrice(e.target.value)} />
              </div>
              <div className="form-field">
                <label className="form-label" htmlFor="ai-cost">Supplier cost (₹)</label>
                <input id="ai-cost" className="form-input" type="number" min={0} inputMode="decimal" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
              </div>
            </div>
            <fieldset className="form-field" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="form-label">Sizes</legend>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {STANDARD_SIZES.map((s) => {
                  const on = sizes.includes(s);
                  return (
                    <button
                      key={s} type="button" aria-pressed={on}
                      className={`ai-badge ${on ? 'ai-badge--trial' : 'ai-badge--neutral'}`}
                      style={{ cursor: 'pointer', fontSize: 12, padding: '4px 10px' }}
                      onClick={() => setSizes(on ? sizes.filter((x) => x !== s) : STANDARD_SIZES.filter((x) => x === s || sizes.includes(x)))}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </>
        )}

        <div className="form-field">
          <label className="form-label" htmlFor="ai-planned">Quantity you plan to buy <span className="ai-meta">(optional)</span></label>
          <input id="ai-planned" className="form-input" type="number" min={0} inputMode="numeric" value={planned} onChange={(e) => setPlanned(e.target.value)} placeholder="Leave blank to let the AI decide" />
        </div>

        {error && <div className="ai-alert ai-alert--error" role="alert">{error}</div>}

        <button type="button" className="btn btn--primary" onClick={() => void analyse()} disabled={analysing}>
          {analysing ? 'Analysing…' : 'Get AI recommendation'}
        </button>
        <p className="ai-meta" style={{ margin: 0 }}>
          Scores come from your own sales, stock and return history, compared with similar products. Nothing leaves your store.
        </p>
      </div>

      {/* ── Result ── */}
      <div className="card">
        {!analysis ? (
          <div className="ai-empty">
            <div style={{ fontSize: 32 }} aria-hidden="true">✦</div>
            <p style={{ margin: 'var(--space-2) 0 0' }}>Choose a product or describe a new garment to get a recommendation.</p>
          </div>
        ) : (
          <div className="ai-section">
            <div className="card__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <h2 className="card__title" style={{ margin: 0 }}>{analysis.subject.name}</h2>
              <span className="ai-meta">
                {[analysis.subject.subcategoryName, inr(analysis.subject.sellingPrice)].filter(Boolean).join(' · ')}
              </span>
            </div>
            {photoMessage && <div className="ai-callout">{photoMessage}</div>}

            <AiAnalysisView analysis={analysis} sizeMixSlot={sizeMixEditor} />

            {/* ── Owner decision ── */}
            <div style={{ borderTop: '1.5px dashed var(--color-border-subtle)', paddingTop: 'var(--space-4)' }} className="ai-section">
              <h3 className="ai-subhead" style={{ margin: 0 }}>Your decision</h3>
              {outcome ? (
                <div className="ai-alert ai-alert--success" role="status">
                  <strong>{OWNER_ACTION_LABEL[outcome.action]}.</strong>{' '}
                  {outcome.units !== null
                    ? <>Created {outcome.units} new items with unique barcodes. <Link href={`/products/${analysis.subject.productId}`}>View product →</Link></>
                    : isExisting || (outcome.action !== 'ACCEPTED' && outcome.action !== 'MODIFIED')
                      ? 'Your decision was recorded; the AI will compare it with actual sales in 30 days.'
                      : <>Decision recorded. <Link href="/products/new">Add this product</Link> to create its stock and barcodes.</>}
                </div>
              ) : (
                <>
                  {isExisting && (mixTotal > 0) && (
                    <div className="form-field" style={{ maxWidth: 260 }}>
                      <label className="form-label" htmlFor="ai-unit-cost">Purchase cost per unit (₹)</label>
                      <input id="ai-unit-cost" className="form-input" type="number" min={0} inputMode="decimal" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} />
                    </div>
                  )}
                  {rejecting && (
                    <div className="form-field">
                      <label className="form-label" htmlFor="ai-reject-note">Why are you rejecting it?</label>
                      <textarea id="ai-reject-note" className="form-input ai-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Supplier is discontinuing this line" />
                    </div>
                  )}
                  <div className="ai-actions">
                    {!rejecting ? (
                      <>
                        <button
                          type="button" className="btn btn--primary"
                          disabled={deciding || modified || analysis.recommendation.quantity === 0}
                          onClick={() => void decide('ACCEPTED')}
                          title={modified ? 'You changed the quantities — use “Buy my quantities”' : undefined}
                        >
                          {isExisting ? `Accept & restock ${analysis.recommendation.quantity}` : 'Accept'}
                        </button>
                        <button
                          type="button" className="btn btn--secondary"
                          disabled={deciding || !modified}
                          onClick={() => void decide('MODIFIED')}
                        >
                          {isExisting ? `Buy my quantities (${mixTotal})` : `Save my quantities (${mixTotal})`}
                        </button>
                        <button type="button" className="btn btn--ghost" disabled={deciding} onClick={() => void decide('IGNORED')}>Ignore</button>
                        <button type="button" className="btn btn--ghost" disabled={deciding} onClick={() => setRejecting(true)} style={{ color: 'var(--color-return)' }}>Reject…</button>
                      </>
                    ) : (
                      <>
                        <button type="button" className="btn btn--primary" disabled={deciding} onClick={() => void decide('REJECTED')}>Reject recommendation</button>
                        <button type="button" className="btn btn--ghost" onClick={() => { setRejecting(false); setNote(''); }}>Cancel</button>
                      </>
                    )}
                  </div>
                  <p className="ai-meta" style={{ margin: 0 }}>
                    Edit the “Buy” column to change quantities. Every decision is stored with the prediction so the AI&apos;s accuracy can be checked later.
                  </p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
