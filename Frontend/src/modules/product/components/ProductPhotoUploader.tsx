'use client';

import React, { useState } from 'react';
import { ProductService } from '@/modules/product/services/ProductService';
import type { AttributeSuggestions, PhotoQualityResult, SimilarProduct } from '@/modules/product/types';

interface ProductPhotoUploaderProps {
  productId?: string;
  images: string[];
  onChange: (images: string[]) => void;
  onAISuggestions?: (suggestions: AttributeSuggestions) => void;
  onQualityCheck?: (quality: PhotoQualityResult) => void;
}

export function ProductPhotoUploader({
  productId,
  images,
  onChange,
  onAISuggestions,
  onQualityCheck,
}: ProductPhotoUploaderProps) {
  const [dragOver, setDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Week 6 Photo Intelligence state
  const [quality, setQuality] = useState<PhotoQualityResult | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<AttributeSuggestions | null>(null);
  const [similarProducts, setSimilarProducts] = useState<SimilarProduct[]>([]);
  const [possibleDuplicate, setPossibleDuplicate] = useState<SimilarProduct | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [lastAnalyzed, setLastAnalyzed] = useState<string | null>(null);
  const [appliedNote, setAppliedNote] = useState<string | null>(null);

  /**
   * Photo intelligence: quality, colour/pattern suggestions, duplicate check.
   * Optional — a failure never blocks the upload, but it is now reported (with a
   * retry) instead of silently leaving the AI panel empty.
   */
  const runAnalysis = async (base64: string) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAppliedNote(null);
    setLastAnalyzed(base64);
    try {
      const result = await ProductService.analyzePhoto(base64, productId);
      const q: PhotoQualityResult = { score: result.qualityScore, issues: result.qualityIssues };
      setQuality(q);
      if (onQualityCheck) onQualityCheck(q);
      setAiSuggestions(result.attributeSuggestions);
      setSimilarProducts(result.similar);
      setPossibleDuplicate(result.similar.find((s) => s.isPossibleDuplicate) ?? null);
      setAiNote(result.aiAvailable ? null : result.message ?? 'Photo AI is not available right now.');
    } catch (err) {
      setAnalysisError(
        err instanceof Error ? err.message : 'Photo analysis failed. The photo was still added.'
      );
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFiles = async (fileList: FileList | File[]) => {
    setErrorMsg(null);
    const files = Array.from(fileList);
    if (files.length === 0) return;

    setIsProcessing(true);
    const newImages: string[] = [];

    for (const file of files) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
        setErrorMsg('Only JPG, PNG, and WEBP images are supported.');
        setIsProcessing(false);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setErrorMsg('Image size must be less than 5 MB.');
        setIsProcessing(false);
        return;
      }

      try {
        const base64 = await readFileAsBase64(file);
        newImages.push(base64);

        // Photo intelligence on the first (primary) photo: quality, suggestions,
        // duplicate check. Optional — any failure here never blocks the upload.
        if (images.length === 0 && newImages.length === 1) {
          void runAnalysis(base64);
        }
      } catch (e) {
        setErrorMsg('Failed to process image.');
      }
    }

    onChange([...images, ...newImages]);
    setIsProcessing(false);
  };

  const removeImage = (index: number) => {
    const updated = images.filter((_, i) => i !== index);
    onChange(updated);
    if (updated.length === 0) {
      setQuality(null);
      setAiSuggestions(null);
      setSimilarProducts([]);
      setPossibleDuplicate(null);
      setAiNote(null);
      setAnalysisError(null);
      setLastAnalyzed(null);
      setAppliedNote(null);
    }
  };

  const setPrimaryImage = (index: number) => {
    if (index === 0) return;
    const selected = images[index];
    const remaining = images.filter((_, i) => i !== index);
    onChange([selected, ...remaining]);
  };

  const applySuggestions = (picked?: Partial<AttributeSuggestions>) => {
    if (!aiSuggestions || !onAISuggestions) return;
    const merged: AttributeSuggestions = { ...aiSuggestions, ...picked } as AttributeSuggestions;
    onAISuggestions(merged);
    const parts: string[] = [];
    if (merged.colours?.[0]) parts.push(`colour ${merged.colours[0]}`);
    if (merged.pattern) parts.push(`pattern ${merged.pattern}`);
    setAppliedNote(`Applied to the product form: ${parts.join(', ')}.`);
  };

  return (
    <div className="photo-uploader">
      {/* Dropzone */}
      <div
        id="product-photo-dropzone"
        className={`photo-dropzone ${dragOver ? 'photo-dropzone--active' : ''}`}
        role="button"
        tabIndex={0}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.multiple = true;
          input.accept = 'image/jpeg,image/png,image/webp';
          input.onchange = (e) => handleFiles((e.target as HTMLInputElement).files || []);
          input.click();
        }}
      >
        <span className="material-symbols-outlined photo-dropzone__icon" aria-hidden="true">add_a_photo</span>
        <span className="photo-dropzone__label">Drop product photos here, or click to browse</span>
        <span className="photo-dropzone__hint">JPG, PNG or WEBP · max 5 MB each · offline photo AI (optional)</span>

        {isAnalyzing && !isProcessing && (
          <span className="photo-dropzone__status">
            <span className="btn-spinner" /> Analysing photo… (the first run can take a moment while the model loads)
          </span>
        )}
        {isProcessing && (
          <span className="photo-dropzone__status">
            <span className="btn-spinner" /> Processing photo…
          </span>
        )}
      </div>

      {errorMsg && <div className="photo-alert photo-alert--error" role="alert">{errorMsg}</div>}

      {analysisError && (
        <div className="photo-alert photo-alert--warn" role="alert">
          <span>Photo AI could not analyse this picture: {analysisError}</span>
          {lastAnalyzed && (
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => void runAnalysis(lastAnalyzed)} disabled={isAnalyzing}>
              Try again
            </button>
          )}
        </div>
      )}

      {possibleDuplicate && (
        <div className="photo-alert photo-alert--warn">
          <span className="material-symbols-outlined" aria-hidden="true">warning</span>
          <span>
            <strong>Possible duplicate photo:</strong> similar to <em>&quot;{possibleDuplicate.name}&quot;</em> (SKU {possibleDuplicate.baseSku}, {Math.round(possibleDuplicate.similarity * 100)}% match)
          </span>
        </div>
      )}

      {images.length > 0 && (
        <div>
          <h4 className="photo-section-title">Uploaded photos ({images.length})</h4>
          <div className="photo-grid">
            {images.map((img, idx) => (
              <div key={idx} className={`photo-tile ${idx === 0 ? 'photo-tile--primary' : ''}`}>
                <img src={img} alt={`Product photo ${idx + 1}`} />
                {idx === 0 && <span className="photo-tile__badge">Primary</span>}
                <div className="photo-tile__actions">
                  {idx !== 0 && (
                    <button type="button" className="photo-tile__btn" onClick={() => setPrimaryImage(idx)} title="Set as primary image">
                      <span className="material-symbols-outlined">star</span> Primary
                    </button>
                  )}
                  <button type="button" className="photo-tile__btn photo-tile__btn--danger" onClick={() => removeImage(idx)} title="Remove image">
                    <span className="material-symbols-outlined">delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {quality && (
        <div className="photo-ai">
          <div className="photo-ai__head">
            <span className="photo-ai__title">
              <span className="material-symbols-outlined" aria-hidden="true">auto_awesome</span> Photo Intelligence
            </span>
            <span className="photo-ai__score">
              Quality score{' '}
              <strong className={quality.score > 0.7 ? 'is-good' : 'is-warn'}>{Math.round(quality.score * 100)}%</strong>
            </span>
          </div>

          {quality.issues.length > 0 && (
            <ul className="photo-ai__issues">
              {quality.issues.map((issue: string, i: number) => <li key={i}>{issue}</li>)}
            </ul>
          )}

          {aiNote && <p className="photo-ai__note">{aiNote}</p>}

          {aiSuggestions && (
            <div className="photo-ai__suggest">
              <div className="photo-ai__suggest-label">
                AI suggestions{onAISuggestions ? ' — click one to use it, or apply all' : ''}
              </div>
              <div className="photo-ai__chips">
                {(aiSuggestions.colours ?? []).map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="photo-chip"
                    disabled={!onAISuggestions}
                    onClick={() => applySuggestions({ colours: [c, ...(aiSuggestions.colours ?? []).filter((x) => x !== c)] })}
                    title="Use this colour"
                  >
                    Colour: {c}
                  </button>
                ))}
                {aiSuggestions.pattern && (
                  <button
                    type="button"
                    className="photo-chip"
                    disabled={!onAISuggestions}
                    onClick={() => applySuggestions({ pattern: aiSuggestions.pattern })}
                    title="Use this pattern"
                  >
                    Pattern: {aiSuggestions.pattern}
                  </button>
                )}
                {onAISuggestions && (
                  <button type="button" className="btn btn-primary btn-sm photo-ai__apply" onClick={() => applySuggestions()}>
                    Apply all
                  </button>
                )}
              </div>
              {appliedNote && <p className="photo-ai__applied">{appliedNote}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
