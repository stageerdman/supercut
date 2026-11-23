// Spike: how long does the picture stand still at a cut, in real WebKit, with the real src/ui/player.js?
// node measure.mjs   (PORT from env; HEADED=1 to watch)
import { open } from './serve.mjs';

const CUTS = [[4, 6], [7.5, 8.2], [9.5, 13], [14.2, 15.1], [16, 16.5], [17.3, 18]].map(([s, e]) => ({ part: 1, s, e, by: 'you' }));
const { page, close } = await open(`/page.html?cuts=${encodeURIComponent(JSON.stringify(CUTS))}&log=${process.env.LOG ?? ''}`);
const { samples, frames } = await page.evaluate(() => window.run(2, 9));
await close();

const shown = frames.filter((f) => f.shown);
const steps = shown.slice(1).map((f, i) => f.now - shown[i].now).sort((a, b) => a - b);
const frame = steps[Math.floor(steps.length / 2)];
console.log(`frames shown: ${shown.length}, normal frame interval ${frame?.toFixed(1)} ms`);
for (const c of CUTS) {
  const before = shown.filter((f) => f.media < c.s).at(-1);
  const after = shown.find((f) => f.media >= c.e - 0.1 && f.now > (before?.now ?? 0));
  if (!before || !after) { console.log(`cut ${c.s}-${c.e}: not crossed`); continue; }
  const gap = after.now - before.now;
  console.log(`cut ${c.s}-${c.e}: last frame ${before.media.toFixed(3)} → first ${after.media.toFixed(3)}, ` +
    `picture held ${gap.toFixed(1)} ms = ${(gap - frame).toFixed(1)} ms longer than a frame`);
}
// Edited time: the source clock with the cuts taken out, so seamless is a straight line at 1 s per s.
const edited = (t) => t - CUTS.reduce((s, c) => s + Math.max(0, Math.min(c.e, t) - c.s), 0);
const live = samples.filter((s) => s.t > 2.2);
const lag = (s) => (s.now - live[0].now) / 1000 - (edited(s.t) - edited(live[0].t));
console.log(`learned lag: ${[...new Set(samples.map((s) => (s.lag * 1000).toFixed(0)))].join(' → ')} ms`);
console.log(`edited clock behind the wall clock at the end: ${(lag(live.at(-1)) * 1000).toFixed(0)} ms`);
