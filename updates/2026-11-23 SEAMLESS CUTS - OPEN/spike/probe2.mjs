// Spike: a twin already playing silently — which way of handing over (show it, make it heard, stop the old one)
// keeps its picture moving? Worst frame gap after the hand-over, several runs each.
import { open } from './serve.mjs';

const { page, close } = await open('/probe2.html');
const cases = process.env.SET === 'reveal' ? {
  'nothing (baseline)': { silent: 'volume0', noSound: true, noReveal: true, pauseLater: 0 },
  'opacity 0→1': { silent: 'volume0', pauseLater: 0 },
  'beneath, top fades out': { silent: 'volume0', under: true, reveal: 'topOut', pauseLater: 0 },
  'beneath, z-order swap': { silent: 'volume0', under: true, reveal: 'z', pauseLater: 0 },
  'beneath, z-order swap, old paused 300 ms later': { silent: 'volume0', under: true, reveal: 'z', pauseLater: 300 },
} : process.env.SET === 'tiny' ? {
  'twin at 1e-4 heard, old stays audible': { silent: 'tiny', noReveal: true, silenceOld: 'keep' },
  'twin at 1e-4 heard, old to 1e-4': { silent: 'tiny', noReveal: true, silenceOld: 'tiny' },
  'twin at 1e-4: shown + heard, old to 1e-4': { silent: 'tiny', silenceOld: 'tiny' },
  'twin at 1e-4: shown + heard, old to 1e-4, paused 300 ms later': { silent: 'tiny', silenceOld: 'tiny', pauseLater: 300 },
} : process.env.SET === 'old' ? {
  'old at 1e-4 seeked while playing, 300 ms later': { silent: 'tiny', silenceOld: 'tiny', seekLater: 300 },
  'old at 1e-4 paused at once, seeked, played 100 ms later': { silent: 'tiny', silenceOld: 'tiny', playLater: 100 },
} : {
  'twin heard, old stays audible': { silent: 'volume0', noReveal: true, silenceOld: 'keep' },
  'twin heard, old volume 0': { silent: 'volume0', noReveal: true, pauseLater: 0 },
  'twin heard, old volume 0.001': { silent: 'volume0', noReveal: true, silenceOld: 'tiny' },
  'twin heard, old muted': { silent: 'volume0', noReveal: true, silenceOld: 'muted' },
  'twin silent, old volume 0': { silent: 'volume0', noSound: true, noReveal: true, pauseLater: 0 },
  'shown + heard, old stays audible': { silent: 'volume0', silenceOld: 'keep' },
};
for (const [name, c] of Object.entries(cases)) {
  const runs = [];
  for (let k = 0; k < 5; k++) runs.push(await page.evaluate((x) => window.probe(x), c));
  console.log(name.padEnd(48), runs.map((r) => `${r.worstGap}@${r.at}`).join('  '));
}
await close();
