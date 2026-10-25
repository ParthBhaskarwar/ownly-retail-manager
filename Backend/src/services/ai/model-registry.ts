/**
 * Model registry — which scoring settings are live, and how a retrained model
 * replaces them.
 *
 * The scoring model has no weights file. What retraining produces is a small
 * set of tuned settings (ModelParams in ai-scoring.ts) plus the evidence that
 * they beat the previous ones. That fits in one JSON file:
 *
 *   model/active-model.json     the model in force (absent → the shipped one)
 *   model/archive/<version>.json  every model it replaced, for rollback
 *
 * The running API picks a new file up on its next analysis (it compares the
 * file's modified time), so replacing a model needs no restart and no deploy.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  activateModel, resetModel, BASE_MODEL_VERSION, DEFAULT_PARAMS,
  type ModelParams,
} from './ai-scoring';

export interface ModelMetrics {
  predictions: number;
  wape: number | null;
  baselineWape: number | null;
  liftOverBaseline: number | null;
  bias: number | null;
  intervalCoverage: number | null;
  brier: number | null;
}

export interface ActiveModel {
  schema: 1;
  version: string;
  baseVersion: string;
  params: ModelParams;
  trainedAt: string;
  trainedOn: {
    source: 'excel' | 'store';
    label: string;
    from: string | null;
    to: string | null;
    products: number;
    saleLines: number;
  };
  /** Scored on months the tuning never saw. */
  holdout: ModelMetrics;
  /** The previous model's score on the same holdout, for a like-for-like comparison. */
  previousHoldout: ModelMetrics;
  previousVersion: string;
}

export function modelDir(): string {
  return process.env.MODEL_DIR
    ? path.resolve(process.env.MODEL_DIR)
    : path.resolve(__dirname, '../../../model');
}

const activeFile = () => path.join(modelDir(), 'active-model.json');
const archiveDir = () => path.join(modelDir(), 'archive');

/** Bounds a hand-edited or corrupted file cannot step outside of. */
const BOUNDS: Record<string, [number, number]> = {
  overdispersion: [0.5, 20],
  olderWindowWeight: [0, 1.5],
  'priorStrength.minRate': [0.5, 50],
  'priorStrength.maxRate': [1, 100],
  sizePriorUnits: [0, 100],
  returnPriorUnits: [0, 200],
  maxPeers: [3, 50],
  minPeersForPrior: [1, 30],
  peerPriceFactor: [1.05, 5],
  minPeerDays: [1, 90],
};

/** Returns a list of problems; empty means the parameters are safe to run. */
export function validateParams(p: ModelParams): string[] {
  const flat: Record<string, unknown> = {
    ...p, 'priorStrength.minRate': p.priorStrength?.minRate, 'priorStrength.maxRate': p.priorStrength?.maxRate,
  };
  const problems: string[] = [];
  for (const [key, [lo, hi]] of Object.entries(BOUNDS)) {
    const v = flat[key];
    if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) {
      problems.push(`${key} = ${String(v)} is outside ${lo}–${hi}`);
    }
  }
  if (p.priorStrength && p.priorStrength.minRate > p.priorStrength.maxRate) {
    problems.push('priorStrength.minRate must not exceed maxRate');
  }
  return problems;
}

export function readActive(): ActiveModel | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(activeFile(), 'utf8')) as ActiveModel;
    if (parsed.schema !== 1 || !parsed.version || !parsed.params) return null;
    return parsed;
  } catch {
    return null;
  }
}

let appliedMtime: number | null | undefined; // undefined = never checked

/**
 * Makes the live scoring match the file on disk. Cheap (one stat) so it can run
 * before every analysis. A missing or invalid file means the shipped model.
 */
export function applyActive(): string {
  let mtime: number | null = null;
  try { mtime = fs.statSync(activeFile()).mtimeMs; } catch { mtime = null; }
  if (mtime === appliedMtime && appliedMtime !== undefined) return currentVersion();
  appliedMtime = mtime;

  const model = mtime === null ? null : readActive();
  if (model && validateParams(model.params).length === 0) {
    activateModel(model.version, model.params);
  } else {
    if (model) console.warn('[model] active-model.json has invalid parameters — using the shipped model.');
    resetModel();
  }
  return currentVersion();
}

function currentVersion(): string {
  return readActive()?.version ?? BASE_MODEL_VERSION;
}

/** Writes a new active model, archiving the one it replaces. Atomic on the same disk. */
export function install(model: ActiveModel): void {
  const problems = validateParams(model.params);
  if (problems.length) throw new Error(`Refusing to install: ${problems.join('; ')}`);

  fs.mkdirSync(archiveDir(), { recursive: true });
  const current = readActive();
  if (current) fs.copyFileSync(activeFile(), path.join(archiveDir(), `${current.version}.json`));

  const tmp = `${activeFile()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(model, null, 2));
  fs.renameSync(tmp, activeFile());
  appliedMtime = undefined;
}

/** Restores the most recently archived model; with none, returns to the shipped model. */
export function rollback(): { restored: string } {
  fs.mkdirSync(archiveDir(), { recursive: true });
  const archived = fs.readdirSync(archiveDir()).filter((f) => f.endsWith('.json'))
    .map((f) => ({ f, t: fs.statSync(path.join(archiveDir(), f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);

  if (archived.length === 0) {
    if (fs.existsSync(activeFile())) fs.unlinkSync(activeFile());
    appliedMtime = undefined;
    return { restored: BASE_MODEL_VERSION };
  }
  const latest = archived[0].f;
  const restored = JSON.parse(fs.readFileSync(path.join(archiveDir(), latest), 'utf8')) as ActiveModel;
  fs.copyFileSync(path.join(archiveDir(), latest), activeFile());
  fs.unlinkSync(path.join(archiveDir(), latest));
  appliedMtime = undefined;
  return { restored: restored.version };
}

export const ModelRegistry = {
  readActive, applyActive, install, rollback, validateParams, modelDir,
  defaults: DEFAULT_PARAMS,
};
