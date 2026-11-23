// Spike: how precisely does a hidden twin playing at 1e-4 land in step (seek while playing, a small nudge relative to
// where it is, or pause→seek→play), and how much does that disturb the video you see (worst frame gap, normal ≈ 33 ms)?
// Prints, per trial, the offset change beyond what was asked ("loss"): the part a learned lag must absorb.
import { open } from './serve.mjs';

const { page, close } = await open('/probe3.html');
const cases = process.env.SET === 'nudge'
  ? [0.03, 0.1, 0.2, 0.4, -0.1].map((lead) => ({ mode: 'nudge', lead }))
  : [{ mode: 'seek', lead: 0 }, { mode: 'pauseplay', lead: 0 }];
for (const c of cases) {
  const runs = await page.evaluate((x) => window.probe(x), { ...c, gap: 3, trials: 6 });
  const loss = runs.slice(1).map((r, i) => +(r.off - runs[i].off - (c.mode === 'nudge' ? c.lead : 0)).toFixed(3));
  console.log(`${c.mode} ${c.lead}`.padEnd(14), `offsets [${runs.map((r) => r.off).join(' ')}]`,
    c.mode === 'nudge' ? `loss per nudge [${loss.join(' ')}]` : '', ` worst gap on seen: ${runs.map((r) => r.worst).join(' ')} ms`);
}
await close();
