// Spike: how long does the picture stand still at a cut, in real WebKit, with the real src/ui/player.js?
// node measure.mjs   (PORT from env; RUNS=n runs, default 5; HEADED=1 to watch; LOG=1 prints each video's events)
// A cut passes when no picture stands over one frame longer than normal from the last frame before it until AFTER_MS past
// it (a stall right after a swap counts as the cut's). Exits 1 unless every cut of every run passes.
import { open } from './serve.mjs';

const CUTS = [[4, 6], [7.5, 8.2], [9.5, 13], [14.2, 15.1], [16, 16.5], [17.3, 18]].map(([s, e]) => ({ part: 1, s, e, by: 'you' }));
const AFTER_MS = 500;
const RUNS = Number(process.env.RUNS || 5);

async function once() {
  const { page, close } = await open(`/page.html?cuts=${encodeURIComponent(JSON.stringify(CUTS))}&log=${process.env.LOG ?? ''}`);
  const run = await page.evaluate(() => window.run(2, 9));
  await close();
  return run;
}

/** Picture holds: each shown frame, when it came and how long it stood. */
const holdsOf = (shown) => shown.slice(1).map((f, i) => ({ media: shown[i].media, now: shown[i].now, gap: f.now - shown[i].now }));

/** The cut's longest hold, from the last frame before it until AFTER_MS after it was crossed; null: never crossed. */
function cutHold(c, holds) {
  const before = holds.filter((h) => h.media < c.s).at(-1);
  const crossed = holds.find((h) => h.media >= c.e - 0.1 && h.now > (before?.now ?? 0));
  if (!before || !crossed) return null;
  const inside = holds.filter((h) => h.now >= before.now && h.now <= crossed.now + AFTER_MS);
  return inside.reduce((w, h) => (h.gap > w.gap ? h : w));
}

// Edited time: the source clock with the cuts taken out, so seamless is a straight line at 1 s per s.
const edited = (t) => t - CUTS.reduce((s, c) => s + Math.max(0, Math.min(c.e, t) - c.s), 0);
function behind(samples) {
  const live = samples.filter((s) => s.t > 2.2);
  const first = live[0], last = live.at(-1);
  return (last.now - first.now) / 1000 - (edited(last.t) - edited(first.t));
}

function report({ frames, samples }) {
  const holds = holdsOf(frames.filter((f) => f.shown));
  const frame = holds.map((h) => h.gap).sort((a, b) => a - b)[Math.floor(holds.length / 2)];
  // Held over one frame longer than normal (one dropped frame passes: headless WebKit drops one now and then
  // with no cut near; the 1.2 absorbs timer jitter of a few ms).
  const over = (h) => h.gap - frame > 1.2 * frame;
  const cuts = CUTS.map((c) => ({ c, w: cutHold(c, holds) }));
  const long = holds.filter(over);
  const pass = cuts.every(({ w }) => w && !over(w)) && !long.length;
  const line = cuts.map(({ c, w }) => (w ? `${c.s}-${c.e} ${over(w) ? 'HOLD' : 'ok'} +${(w.gap - frame).toFixed(0)}ms` : `${c.s}-${c.e} not crossed`));
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${line.join(' | ')}  (behind ${(behind(samples) * 1000).toFixed(0)} ms)`);
  if (long.length) console.log(`      holds: ${long.map((h) => `${h.media.toFixed(2)}s ${h.gap.toFixed(0)}ms`).join(', ')}`);
  return pass;
}

let passed = 0;
for (let r = 0; r < RUNS; r++) if (report(await once())) passed++;
console.log(`${passed}/${RUNS} runs: every cut under one frame of extra hold, and no hold anywhere else`);
process.exitCode = passed === RUNS ? 0 : 1;
