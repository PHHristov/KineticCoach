/**
 * Tests the squat analyzer against simulated squats (no camera needed).
 * Run: npm run test:pose
 */
import { simulatePose as pose, squatAt, type SimOptions as Opts } from '../src/lib/pose/simulate';
import { SquatAnalyzer, type AnalyzerEvent, type RepResult } from '../src/lib/pose/squatAnalyzer';

function run(o: Opts) {
  const fps = o.fps ?? 30;
  const a = new SquatAnalyzer();
  const events: { t: number; e: AnalyzerEvent }[] = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const total = 1.5 + o.reps * (1.2 + o.eccSec + 0.25 + o.conSec) + 1;
  let issueOnset: number | undefined;
  for (let i = 0; i * (1 / fps) < total; i++) {
    const t = i / fps;
    const { k, depth } = squatAt(t, o);
    const { image, world } = pose(k, o, depth, rand);
    if (o.hiddenFrom !== undefined && t >= o.hiddenFrom) image.forEach((p) => (p.visibility = 0.1));
    // Note when a fault first becomes clearly present (half way into the movement).
    if (issueOnset === undefined && o.fault && depth > 0.5) issueOnset = t;
    const out = a.update({ t: t * 1000, image, world, aspect: 1 });
    out.events.forEach((e) => events.push({ t, e }));
  }
  return { a, events, issueOnset, last: a.reps };
}

let failed = 0;
function check(name: string, cond: boolean, info: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failed++;
    console.log(`  ✗ ${name}`, JSON.stringify(info));
  }
}
const reps = (r: RepResult[]) => r.map((x) => ({ d: x.depth, min: x.minKneeAngle, ecc: x.eccentricSec, con: x.concentricSec, i: x.issues, s: x.score, v: x.view }));

console.log('Side view, good squats (2.4 s down, 0.8 s up, deep)');
{
  const { last, events } = run({ view: 'side', reps: 3, eccSec: 2.4, conSec: 0.8, minAngle: 75, noise: 0.002 });
  check('counts 3 reps', last.length === 3, reps(last));
  check('all deep', last.every((r) => r.depth === 'deep'), reps(last));
  check('descent controlled, ascent explosive', last.every((r) => r.descent === 'controlled' && r.ascent === 'explosive'), reps(last));
  check('tempo measured within 0.4 s', last.every((r) => Math.abs(r.eccentricSec - 2.4) < 0.4 && Math.abs(r.concentricSec - 0.8) < 0.4), reps(last));
  check('no issues, score 100', last.every((r) => r.issues.length === 0 && r.score === 100), reps(last));
  check('detected side view', last.every((r) => r.view === 'side'), reps(last));
  check('no spoken cues', !events.some((e) => e.e.type === 'cue'), events);
}

console.log('Dropping fast (0.6 s down)');
{
  const { last, events } = run({ view: 'side', reps: 2, eccSec: 0.6, conSec: 0.8, minAngle: 80 });
  check('flags fast descent', last.every((r) => r.issues.includes('fast-descent') && r.descent === 'fast'), reps(last));
  const cue = events.find((e) => e.e.type === 'cue' && e.e.issue === 'fast-descent');
  const firstRep = events.find((e) => e.e.type === 'rep');
  check('live "slow down" before the rep ends', !!cue && !!firstRep && cue.t < firstRep.t, events.slice(0, 4));
}

console.log('Slow on the way up (2.2 s up)');
{
  const { last } = run({ view: 'side', reps: 2, eccSec: 2.2, conSec: 2.2, minAngle: 80 });
  check('flags slow ascent', last.every((r) => r.issues.includes('slow-ascent') && r.ascent === 'slow'), reps(last));
}

console.log('Half squats (knee angle 118°)');
{
  const { last } = run({ view: 'side', reps: 2, eccSec: 2, conSec: 0.8, minAngle: 118 });
  check('depth = half, flagged shallow', last.length === 2 && last.every((r) => r.depth === 'half' && r.issues.includes('shallow')), reps(last));
}

console.log('Tiny dips (knee angle 150°) are not reps');
{
  const { last, events } = run({ view: 'side', reps: 2, eccSec: 1.5, conSec: 1, minAngle: 150 });
  check('0 reps counted', last.length === 0, reps(last));
  check('partial events emitted', events.filter((e) => e.e.type === 'partial').length === 2, events);
}

console.log('Leaning far forward (side view)');
{
  const { last, events, issueOnset } = run({ view: 'side', reps: 2, eccSec: 2, conSec: 0.8, minAngle: 80, fault: { lean: 0.8 } });
  check('flags chest forward', last.every((r) => r.issues.includes('chest-forward')), reps(last));
  const cue = events.find((e) => e.e.type === 'cue' && e.e.issue === 'chest-forward');
  check('live cue within 0.6 s of the fault', !!cue && issueOnset !== undefined && cue.t - issueOnset < 0.6, { cue: cue?.t, issueOnset });
}

console.log('Heels lifting (side view)');
{
  const { last } = run({ view: 'side', reps: 2, eccSec: 2, conSec: 0.8, minAngle: 80, fault: { heelLift: 0.05 } });
  check('flags heels up', last.every((r) => r.issues.includes('heels-up')), reps(last));
}

console.log('Front view, good squats');
{
  const { last } = run({ view: 'front', reps: 2, eccSec: 2.2, conSec: 0.9, minAngle: 85, noise: 0.002 });
  check('counts 2 reps, front view', last.length === 2 && last.every((r) => r.view === 'front'), reps(last));
  check('no issues', last.every((r) => r.issues.length === 0), reps(last));
}

console.log('Front view, knees caving in');
{
  const { last, events, issueOnset } = run({ view: 'front', reps: 2, eccSec: 2.2, conSec: 0.9, minAngle: 85, fault: { valgus: 0.035 } });
  check('flags knees in', last.every((r) => r.issues.includes('knees-in')), reps(last));
  const cue = events.find((e) => e.e.type === 'cue' && e.e.issue === 'knees-in');
  const firstRep = events.find((e) => e.e.type === 'rep');
  check('"knees out" spoken during the rep', !!cue && !!firstRep && cue.t < firstRep.t, { cue: cue?.t, rep: firstRep?.t, issueOnset });
}

console.log('Front view, shifting to one side');
{
  const { last } = run({ view: 'front', reps: 2, eccSec: 2.2, conSec: 0.9, minAngle: 85, fault: { shift: 0.05 } });
  check('flags shift', last.every((r) => r.issues.includes('shift')), reps(last));
}

console.log('Different frame rates give the same result');
for (const fps of [15, 60]) {
  const { last } = run({ view: 'side', reps: 2, eccSec: 2.4, conSec: 0.8, minAngle: 75, fps });
  check(`${fps} fps: 2 clean reps, tempo within 0.4 s`, last.length === 2 && last.every((r) => r.issues.length === 0 && Math.abs(r.eccentricSec - 2.4) < 0.4), reps(last));
}

console.log('Walking out of view');
{
  const { a } = run({ view: 'side', reps: 1, eccSec: 2, conSec: 1, minAngle: 80, hiddenFrom: 3 });
  const st = a.update({ t: 99999, image: [], world: [], aspect: 1 });
  check('reports not visible', st.state.phase === 'not-visible', st.state);
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
