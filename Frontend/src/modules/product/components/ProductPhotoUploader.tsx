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
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        id="product-photo-dropzone"
        className={`pe-dropzone ${dragOver ? 'pe-dropzone--active' : ''}`}
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
        <span className="pe-dropzone__icon" aria-hidden="true">📷</span>
        <span className="pe-dropzone__label">Drop product photos here, or click to browse</span>
        <span className="pe-dropzone__hint">Supports JPG, PNG, WEBP · Max 5 MB each · Offline photo AI (optional)</span>

        {isAnalyzing && !isProcessing && (
          <div className="mt-2 text-violet-400 text-xs font-semibold flex items-center justify-center gap-2">
            <span className="btn-spinner" /> Analysing photo… (the first run can take a moment while the model loads)
          </div>
        )}

        {isProcessing && (
          <div className="mt-2 text-violet-400 text-xs font-semibold flex items-center justify-center gap-2">
            <span className="btn-spinner" /> Processing photo intelligence...
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-950/60 border border-red-500/30 text-red-400 text-sm rounded-lg" role="alert">
          {errorMsg}
        </div>
      )}

      {analysisError && (
        <div className="p-3 bg-amber-950/60 border border-amber-500/30 text-amber-300 text-sm rounded-lg flex items-center justify-between gap-3" role="alert">
          <span>Photo AI could not analyse this picture: {analysisError}</span>
          {lastAnalyzed && (
            <button
              type="button"
              className="px-2.5 py-1 bg-amber-600/20 hover:bg-amber-600/40 border border-amber-500/30 rounded text-xs"
              onClick={() => void runAnalysis(lastAnalyzed)}
              disabled={isAnalyzing}
            >
              Try again
            </button>
          )}
        </div>
      )}

      {/* Duplicate warning banner */}
      {possibleDuplicate && (
        <div className="p-3 bg-amber-950/70 border border-amber-500/40 text-amber-300 text-sm rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">⚠</span>
            <div>
              <strong>Possible Duplicate Photo Detected:</strong> Similar to product <em>&quot;{possibleDuplicate.name}&quot;</em> (SKU: {possibleDuplicate.baseSku}, Match: {Math.round(possibleDuplicate.similarity * 100)}%)
            </div>
          </div>
        </div>
      )}

      {/* Uploaded Images Gallery */}
      {images.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            Uploaded Photos ({images.length})
          </h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {images.map((img, idx) => (
              <div
                key={idx}
                className={`relative group rounded-xl overflow-hidden border bg-slate-950 ${
                  idx === 0 ? 'border-violet-500 ring-2 ring-violet-500/30' : 'border-slate-800'
                }`}
              >
                <img
                  src={img}
                  alt={`Product photo ${idx + 1}`}
                  className="w-full h-36 object-cover"
                />

                {/* Primary Badge */}
                {idx === 0 && (
                  <span className="absolute top-2 left-2 px-2 py-0.5 bg-violet-600 text-white text-[10px] font-bold rounded-full shadow">
                    Primary
                  </span>
                )}

                {/* Actions overlay */}
                <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  {idx !== 0 && (
                    <button
                      type="button"
                      className="px-2 py-1 bg-slate-800 hover:bg-violet-600 text-white text-xs rounded transition-colors"
                      onClick={() => setPrimaryImage(idx)}
                      title="Set as Primary Image"
                    >
                      ★ Set Primary
                    </button>
                  )}
                  <button
                    type="button"
                    className="p-1 bg-red-600/80 hover:bg-red-600 text-white rounded transition-colors"
                    onClick={() => removeImage(idx)}
                    title="Remove Image"
                  >
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Week 6 AI Photo Intelligence Panel */}
      {quality && (
        <div className="p-4 bg-slate-900/80 border border-slate-800 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-violet-400 flex items-center gap-2">
              ⚡ Photo Intelligence
            </span>
            <span className="text-xs text-slate-400">
              Quality Score: <strong className={quality.score > 0.7 ? 'text-emerald-400' : 'text-amber-400'}>{Math.round(quality.score * 100)}%</strong>
            </span>
          </div>

          {quality.issues.length > 0 && (
            <ul className="text-xs text-amber-400 space-y-1 list-disc list-inside">
              {quality.issues.map((issue: string, i: number) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          )}

          {aiNote && (
            <p className="text-xs text-slate-400">{aiNote}</p>
          )}


          {aiSuggestions && (
            <div className="pt-2 border-t border-slate-800 space-y-2 text-xs">
              <div className="text-slate-300">
                <strong>AI Suggestions</strong>
                {onAISuggestions ? ' — click a suggestion to use it, or apply all:' : ':'}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(aiSuggestions.colours ?? []).map((c) => (
                  <button
                    key={c}
                    type="button"
                    disabled={!onAISuggestions}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-violet-600/40 text-slate-200 border border-slate-700 rounded-full transition-colors"
                    onClick={() => applySuggestions({ colours: [c, ...(aiSuggestions.colours ?? []).filter((x) => x !== c)] })}
                    title="Use this colour"
                  >
                    Colour: {c}
                  </button>
                ))}
                {aiSuggestions.pattern && (
                  <button
                    type="button"
                    disabled={!onAISuggestions}
                    className="px-2.5 py-1 bg-slate-800 hover:bg-violet-600/40 text-slate-200 border border-slate-700 rounded-full transition-colors"
                    onClick={() => applySuggestions({ pattern: aiSuggestions.pattern })}
                    title="Use this pattern"
                  >
                    Pattern: {aiSuggestions.pattern}
                  </button>
                )}
                {onAISuggestions && (
                  <button
                    type="button"
                    className="ml-auto px-2.5 py-1 bg-violet-600/20 hover:bg-violet-600/40 text-violet-300 border border-violet-500/30 rounded text-xs transition-colors"
                    onClick={() => applySuggestions()}
                  >
                    Apply all
                  </button>
                )}
              </div>
              {appliedNote && <p className="text-emerald-400">{appliedNote}</p>}
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
