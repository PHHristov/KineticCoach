/**
 * The technique guide must show reps the form checker considers perfect.
 * Run: npm run test:pose
 */
import { CurlAnalyzer } from '../src/lib/pose/curlAnalyzer';
import { CURL_GUIDE, cycleLength, phaseAt, SQUAT_GUIDE, type Guide, type GuideView } from '../src/lib/pose/guide';
import type { PoseAnalyzer, RepBase } from '../src/lib/pose/analyzer';
import { SquatAnalyzer } from '../src/lib/pose/squatAnalyzer';

let failed = 0;
function check(name: string, cond: boolean, info: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failed++;
    console.log(`  ✗ ${name}`, JSON.stringify(info));
  }
}

function play(g: Guide, a: PoseAnalyzer<RepBase>, view: GuideView, cycles: number) {
  const fps = 30;
  const events: string[] = [];
  const total = cycleLength(g) * cycles;
  for (let i = 0; i * (1 / fps) < total; i++) {
    const t = i / fps;
    const { image, world } = g.frame(t, view);
    const out = a.update({ t: t * 1000, image, world, aspect: 1 });
    out.events.forEach((e) => events.push(e.type === 'cue' ? `cue:${e.issue}` : e.type));
  }
  return { reps: a.reps, events };
}

for (const [name, g, make] of [
  ['Squat', SQUAT_GUIDE, () => new SquatAnalyzer()],
  ['Bicep curl', CURL_GUIDE, () => new CurlAnalyzer()],
] as const) {
  console.log(`${name} guide`);
  for (const view of ['side', 'front'] as const) {
    const { reps, events } = play(g, make(), view, 4);
    const info = { reps: reps.map((r) => ({ s: r.score, i: r.issues, ecc: r.eccentricSec, con: r.concentricSec, range: r.range.label })), events };
    check(`${view}: at least 3 reps counted`, reps.length >= 3, info);
    check(`${view}: every rep scores 100 with no issues`, reps.every((r) => r.score === 100 && r.issues.length === 0), info);
    check(`${view}: no cues or "go further" prompts`, !events.some((e) => e.startsWith('cue') || e === 'partial'), info);
  }
  const phases = new Set<number>();
  for (let t = 0; t < cycleLength(g); t += 0.05) phases.add(phaseAt(g, t).index);
  check('phase timeline visits rest and every phase', phases.size === g.phases.length + 1, [...phases]);
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
