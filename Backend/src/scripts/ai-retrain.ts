/**
 * ai-retrain — retrain the AI scoring model on one store's own history and,
 * if it is clearly better, put it live.
 *
 *   npm run ai:retrain -- --excel path/to/history.xlsx        # from a spreadsheet
 *   npm run ai:retrain -- --store <store-id>                  # from sales already in the app
 *   npm run ai:retrain -- --excel file.xlsx --dry-run         # do everything except replace the model
 *   npm run ai:retrain -- --excel small.xlsx --force          # skip the data-size gates (demo/testing)
 *   npm run ai:retrain -- --status                            # which model is live
 *   npm run ai:retrain -- --rollback                          # restore the previous model
 *   npm run ai:retrain-sample                                 # write the template + a sample workbook
 *
 * Other options: --months N (how far back to test, default 12).
 * Full instructions: docs/RETRAINING_GUIDE.md
 */

import { db } from '@/db/client';
import { ModelRegistry } from '@/services/ai/model-registry';
import { retrain } from '@/retraining/pipeline';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

async function main(): Promise<number> {
  if (flag('status')) {
    const m = ModelRegistry.readActive();
    if (!m) {
      console.log('Live model: ownly-scoring-v1 (shipped settings — no retrained model installed).');
    } else {
      console.log(`Live model: ${m.version}`);
      console.log(`  trained   ${m.trainedAt} on ${m.trainedOn.label} (${m.trainedOn.from} to ${m.trainedOn.to}, ${m.trainedOn.products} products)`);
      console.log(`  replaced  ${m.previousVersion}`);
      console.log(`  holdout   error ${((m.holdout.wape ?? 0) * 100).toFixed(1)}% (was ${((m.previousHoldout.wape ?? 0) * 100).toFixed(1)}%), coverage ${((m.holdout.intervalCoverage ?? 0) * 100).toFixed(1)}%`);
      console.log(`  settings  ${JSON.stringify(m.params)}`);
    }
    return 0;
  }

  if (flag('rollback')) {
    const { restored } = ModelRegistry.rollback();
    console.log(`Rolled back. Live model is now: ${restored}. The running API picks this up on its next analysis.`);
    return 0;
  }

  const excel = arg('excel');
  const storeId = arg('store');
  if (!excel && !storeId) {
    console.error('Pass --excel <file.xlsx> or --store <store-id>.  (See: npm run ai:retrain -- --help, or docs/RETRAINING_GUIDE.md)');
    return flag('help') ? 0 : 1;
  }

  const result = await retrain({
    excel, storeId,
    months: Number(arg('months') ?? 12),
    dryRun: flag('dry-run'),
    force: flag('force'),
    log: (line) => console.log(line),
  });

  console.log('');
  console.log(`RESULT: ${result.verdict}`);
  for (const r of result.reasons) console.log(`  - ${r}`);
  if (result.holdout) {
    const c = result.holdout.current, n = result.holdout.candidate;
    const p = (x: number | null) => (x === null ? '—' : `${(x * 100).toFixed(1)}%`);
    console.log(`  Unseen months — error ${p(c.wape)} → ${p(n.wape)}, range coverage ${p(c.intervalCoverage)} → ${p(n.intervalCoverage)}, bias ${p(c.bias)} → ${p(n.bias)}`);
  }
  console.log(`Report: ${result.runDir}`);
  return result.verdict === 'REJECTED_DATA' || result.verdict === 'NOT_ENOUGH_HISTORY' ? 2 : 0;
}

main()
  .then((code) => { process.exitCode = code; })
  .catch((err) => {
    console.error('Retraining failed:', (err as Error).message);
    process.exitCode = 1;
  })
  .finally(() => db.destroy());
