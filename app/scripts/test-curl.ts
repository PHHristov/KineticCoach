/**
 * Tests the bicep curl analyzer against simulated curls (no camera needed).
 * Run: npm run test:pose
 */
import type { AnalyzerEvent } from '../src/lib/pose/analyzer';
import { CurlAnalyzer, type CurlRep } from '../src/lib/pose/curlAnalyzer';
import { curlAt, simulateCurlPose, type CurlSimOptions } from '../src/lib/pose/simulate';

function run(o: CurlSimOptions) {
  const fps = o.fps ?? 30;
  const a = new CurlAnalyzer();
  const events: { t: number; e: AnalyzerEvent<CurlRep> }[] = [];
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const len = 1.0 + o.conSec + 0.3 + o.eccSec;
  const total = 1.5 + o.reps * len * (o.arms === 'alternate' ? 2 : 1) + 1.5;
  let faultOnset: number | undefined;
  let count = 0;
  for (let i = 0; i * (1 / fps) < total; i++) {
    const t = i / fps;
    const left = curlAt(t, o, o.arms === 'alternate' ? 'even' : 'all');
    const right = o.arms === 'left' ? { e: o.startAngle ?? 170, prog: 0 } : curlAt(t, o, o.arms === 'alternate' ? 'odd' : 'all');
    if (faultOnset === undefined && o.fault && Math.max(left.prog, right.prog) > 0.6) faultOnset = t;
    const { image, world } = simulateCurlPose({ left, right }, o, rand);
    const out = a.update({ t: t * 1000, image, world, aspect: 1 });
    out.events.forEach((e) => events.push({ t, e }));
    count = out.state.reps;
  }
  return { a, events, reps: a.reps, faultOnset, count };
}

let failed = 0;
function check(name: string, cond: boolean, info: unknown) {
  if (cond) console.log(`  ✓ ${name}`);
  else {
    failed++;
    console.log(`  ✗ ${name}`, JSON.stringify(info));
  }
}
const show = (r: CurlRep[]) => r.map((x) => ({ side: x.side, top: x.topAngle, bot: x.bottomAngle, con: x.concentricSec, ecc: x.eccentricSec, i: x.issues, s: x.score, v: x.view, range: x.range.label }));
const cueBeforeRep = (events: { t: number; e: AnalyzerEvent<CurlRep> }[], issue: string) => {
  const cue = events.find((e) => e.e.type === 'cue' && e.e.issue === issue);
  const rep = events.find((e) => e.e.type === 'rep');
  return !!cue && !!rep && cue.t < rep.t;
};

console.log('Side view, good curls (1 s up, 2.5 s down, full range)');
{
  const { reps, events } = run({ view: 'side', reps: 3, conSec: 1, eccSec: 2.5, topAngle: 40, noise: 0.002 });
  check('counts 3 reps', reps.length === 3, show(reps));
  check('full range, side view', reps.every((r) => r.range.good && r.view === 'side'), show(reps));
  check('lowering controlled, tempo within 0.4 s', reps.every((r) => r.eccentric === 'controlled' && Math.abs(r.eccentricSec - 2.5) < 0.4 && Math.abs(r.concentricSec - 1) < 0.4), show(reps));
  check('no issues, score 100', reps.every((r) => r.issues.length === 0 && r.score === 100), show(reps));
  check('no spoken cues', !events.some((e) => e.e.type === 'cue'), events.slice(0, 3));
}

console.log('Dropping the weight (0.5 s down)');
{
  const { reps, events } = run({ view: 'side', reps: 2, conSec: 1, eccSec: 0.5, topAngle: 40 });
  check('flags fast lowering', reps.length === 2 && reps.every((r) => r.issues.includes('fast-lower') && r.eccentric === 'fast'), show(reps));
  check('live "lower slowly" before the rep ends', cueBeforeRep(events, 'fast-lower'), events.slice(0, 4));
}

console.log('Not curling high enough (top at 88°)');
{
  const { reps } = run({ view: 'side', reps: 2, conSec: 1, eccSec: 2, topAngle: 88 });
  check('flags partial top, partial range', reps.length === 2 && reps.every((r) => r.issues.includes('partial-top') && !r.range.good), show(reps));
}

console.log('Not straightening the arm (bottom at 145°)');
{
  const { reps } = run({ view: 'side', reps: 2, conSec: 1, eccSec: 2, topAngle: 40, startAngle: 145 });
  check('flags no extension', reps.length === 2 && reps.every((r) => r.issues.includes('no-extension')), show(reps));
}

console.log('Small bends (45°, top at 125°) are ignored silently');
{
  const { reps, events } = run({ view: 'side', reps: 2, conSec: 1, eccSec: 1.5, topAngle: 125 });
  check('0 reps counted', reps.length === 0, show(reps));
  check('no "curl higher" cue', !events.some((e) => e.e.type === 'partial' || e.e.type === 'cue'), events);
}

console.log('Quick fidgets (30° bend, e.g. adjusting the grip) are ignored silently');
{
  const { reps, events } = run({ view: 'side', reps: 3, conSec: 0.4, eccSec: 0.4, topAngle: 140, noise: 0.004 });
  check('0 reps, no cues', reps.length === 0 && !events.some((e) => e.e.type !== 'ready'), events);
}

console.log('Standing still with heavy tracking jitter');
for (const view of ['side', 'front'] as const) {
  const { reps, events } = run({ view, reps: 3, conSec: 1, eccSec: 2, topAngle: 170, noise: 0.012 });
  check(`${view}: 0 reps, no cues`, reps.length === 0 && !events.some((e) => e.e.type !== 'ready'), events);
}

console.log('Half-hearted attempt (60° bend, top at 110°) says "curl higher"');
{
  const { reps, events } = run({ view: 'side', reps: 2, conSec: 1, eccSec: 1.5, topAngle: 115 });
  check('0 reps counted', reps.length === 0, show(reps));
  check('a "curl higher" for each attempt', events.filter((e) => e.e.type === 'partial').length === 2, events);
}

console.log('Elbows drifting forward (side view)');
{
  const { reps, events } = run({ view: 'side', reps: 2, conSec: 1, eccSec: 2.2, topAngle: 45, fault: { elbowDrift: 40 } });
  check('flags elbow drift', reps.every((r) => r.issues.includes('elbow-drift')), show(reps));
  check('cue during the rep', cueBeforeRep(events, 'elbow-drift'), events.slice(0, 4));
}

console.log('Swinging the body (side view)');
{
  const { reps, events } = run({ view: 'side', reps: 2, conSec: 0.9, eccSec: 2.2, topAngle: 45, fault: { swing: 20 } });
  check('flags swing', reps.every((r) => r.issues.includes('swing')), show(reps));
  check('cue during the rep', cueBeforeRep(events, 'swing'), events.slice(0, 4));
}

console.log('Front view, both arms together');
{
  const { reps, count } = run({ view: 'front', reps: 3, conSec: 1, eccSec: 2.4, topAngle: 42, noise: 0.002 });
  check('3 reps (not 6), each "both"', reps.length === 3 && reps.every((r) => r.side === 'both'), show(reps));
  check('counter shows 3', count === 3, count);
  check('front view, no issues', reps.every((r) => r.view === 'front' && r.issues.length === 0), show(reps));
}

console.log('Front view, alternating arms');
{
  const { reps, count, events } = run({ view: 'front', reps: 3, conSec: 1, eccSec: 2.2, topAngle: 42, arms: 'alternate' });
  check('6 arm reps, alternating left/right', reps.length === 6 && reps.every((r, i) => r.side === (i % 2 ? 'right' : 'left')), show(reps));
  check('counter shows 3 (left + right = one rep)', count === 3, count);
  check('each arm numbered 1, 1, 2, 2, 3, 3', reps.map((r) => r.n).join() === '1,1,2,2,3,3', reps.map((r) => r.n));
  const flags = events.filter((e) => e.e.type === 'rep').map((e) => (e.e.type === 'rep' ? e.e.newCount : null));
  check('count goes up on the left arm only', flags.join() === 'true,false,true,false,true,false', flags);
}

console.log('Front view, one arm only');
{
  const { reps, count } = run({ view: 'front', reps: 3, conSec: 1, eccSec: 2.2, topAngle: 42, arms: 'left' });
  check('counter shows 3', count === 3 && reps.length === 3 && reps.every((r) => r.side === 'left'), { count, reps: show(reps) });
}

console.log('Front view, elbows flaring out');
{
  const { reps } = run({ view: 'front', reps: 2, conSec: 1, eccSec: 2.2, topAngle: 45, fault: { flare: 0.07 } });
  check('flags elbow flare', reps.length === 2 && reps.every((r) => r.issues.includes('elbow-flare')), show(reps));
}

console.log('Front view, shrugging');
{
  const { reps } = run({ view: 'front', reps: 2, conSec: 1, eccSec: 2.2, topAngle: 45, fault: { shrug: 0.035 } });
  check('flags shrug', reps.length === 2 && reps.every((r) => r.issues.includes('shrug')), show(reps));
}

console.log('Side-on reps count once, without an arm label; turning to the front continues the count');
{
  const side = run({ view: 'side', reps: 3, conSec: 1, eccSec: 2.2, topAngle: 42 });
  check('side-on: 3 reps, counter 3, no arm label', side.count === 3 && side.reps.every((r) => r.side === undefined), { count: side.count, reps: show(side.reps) });
  // Continue the same analyzer facing the camera, alternating arms.
  const a = side.a;
  const o = { view: 'front' as const, reps: 2, conSec: 1, eccSec: 2.2, topAngle: 42, arms: 'alternate' as const };
  let seed = 3;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const t0 = 60;
  let st = a.update({ t: t0 * 1000, image: [], world: [], aspect: 1 }).state;
  for (let i = 0; i < 30 * 22; i++) {
    const t = i / 30;
    const { image, world } = simulateCurlPose({ left: curlAt(t, o, 'even'), right: curlAt(t, o, 'odd') }, o, rand);
    st = a.update({ t: (t0 + t) * 1000, image, world, aspect: 1 }).state;
  }
  check('after 2 alternating rounds: counter 5, L 5 · R 5', st.reps === 5 && st.perSide?.left === 5 && st.perSide?.right === 5, { reps: st.reps, perSide: st.perSide });
}

console.log('Different frame rates give the same result');
for (const fps of [15, 60]) {
  const { reps } = run({ view: 'side', reps: 2, conSec: 1, eccSec: 2.5, topAngle: 40, fps });
  check(`${fps} fps: 2 clean reps`, reps.length === 2 && reps.every((r) => r.issues.length === 0 && Math.abs(r.eccentricSec - 2.5) < 0.4), show(reps));
}

console.log('Walking out of view');
{
  const { a } = run({ view: 'side', reps: 1, conSec: 1, eccSec: 2, topAngle: 45 });
  let st = a.update({ t: 999999, image: [], world: [], aspect: 1 });
  st = a.update({ t: 1001600, image: [], world: [], aspect: 1 });
  check('reports not visible', st.state.phase === 'not-visible', st.state.phase);
}

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
