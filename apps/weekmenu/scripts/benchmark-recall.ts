/**
 * Where does the perfect week get lost?
 *
 * The gap benchmark measures how much quality the search gives up. This one
 * measures *why*, by checking the known optimum against each stage of the
 * pipeline: did it survive the recipe pool, the beam, the pricing cut-off.
 * Those three have completely different fixes, and guessing between them is how
 * you end up widening a beam that was never the problem.
 *
 * Run with:  pnpm bench:recall            (200 scenarios)
 *            pnpm bench:recall 500
 */
import { benchmarkSeeds } from '../tests/support/benchmark';
import { RECALL_WIDTHS, WIDE_BEAM, runRecall, type LostStage } from '../tests/support/recall';

const args = process.argv.slice(2);
const count = Number(args.find((argument) => /^\d+$/.test(argument)) ?? 200);
const budget = args.includes('--budget');

const started = Date.now();
const summary = runRecall(benchmarkSeeds(count), budget ? { budgetFactor: 0.85 } : {});
const seconds = (Date.now() - started) / 1000;

const line = (label: string, value: string): void => console.log(`  ${label.padEnd(30)} ${value}`);
const pct = (part: number): string =>
  `${part} (${summary.measured > 0 ? ((part / summary.measured) * 100).toFixed(1) : '0.0'}%)`;

console.log(
  `\nRecall-analyse — ${summary.measured} scenario's in ${seconds.toFixed(1)}s` +
    `${budget ? ' (met hard budgetmaximum)' : ''}, ${summary.skipped} overgeslagen\n`,
);

console.log('  Waar verdwijnt het optimum\n');
const STAGES: { stage: LostStage; what: string }[] = [
  { stage: 'NONE', what: 'gevonden — optimizer gaf het optimum' },
  { stage: 'POOL', what: 'een gerecht haalde de pool niet' },
  { stage: 'BEAM', what: 'week viel uit de beam' },
  { stage: 'TOPK', what: 'week zat in de beam, buiten de top-K' },
  { stage: 'SELECTION', what: 'volledig geprijsd en tóch verloren (BUG)' },
];
for (const { stage, what } of STAGES) line(`${stage} — ${what}`, pct(summary.byStage.get(stage) ?? 0));

console.log('\n  Recall per beambreedte (optimum überhaupt gegenereerd)\n');
for (const width of RECALL_WIDTHS) {
  line(`beamWidth ${width}`, `${(summary.recallByWidth.get(width) ?? 0).toFixed(1)}%`);
}

console.log(`\n  Hoe diep ligt het optimum (beam ${WIDE_BEAM}, alleen niet-exacte gevallen)\n`);
if (summary.wideRanks.length === 0) {
  line('geen niet-exacte gevallen', '—');
} else {
  const ranks = summary.wideRanks;
  const at = (p: number): number => ranks[Math.min(ranks.length - 1, Math.ceil((p / 100) * ranks.length) - 1)]!;
  line('mediaan rang', String(at(50)));
  line('p90 rang', String(at(90)));
  line('slechtste rang', String(ranks.at(-1)));
  line(`onvindbaar zelfs bij ${WIDE_BEAM}`, String(summary.lostEvenWide));
}

const worst = [...summary.measurements]
  .filter((m) => m.lostAt !== 'NONE')
  .sort((a, b) => b.gapPercent - a.gapPercent)
  .slice(0, 10);

if (worst.length > 0) {
  console.log('\n  Tien grootste afwijkingen, met vindplaats\n');
  for (const m of worst) {
    console.log(
      `    seed ${String(m.seed).padStart(8)}  ${m.gapPercent.toFixed(2).padStart(6)}%  ` +
        `${m.lostAt.padEnd(10)} rang ${String(m.rank ?? '-').padStart(4)} / breed ${String(m.wideRank ?? 'weg').padStart(4)}  ` +
        `${m.candidateCount} recepten`,
    );
  }
}

console.log('');

// A SELECTION case means the optimizer priced the optimum and still preferred
// something worse. That is not a search quality question, it is a bug.
process.exit((summary.byStage.get('SELECTION') ?? 0) > 0 ? 1 : 0);
