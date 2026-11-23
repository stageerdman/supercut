// Spike: play() on a paused, pre-seeked <video> — how long until its picture and clock move?
import { open } from './serve.mjs';

const { page, close } = await open('/probe.html');
const cases = [
  { hidden: true, muted: false, at: 6, mainPlaying: true },
  { hidden: true, muted: true, at: 6, mainPlaying: true },
  { hidden: false, muted: false, at: 6, mainPlaying: true },
  { hidden: false, muted: false, at: 6, mainPlaying: false },
  { hidden: true, muted: false, at: 8, mainPlaying: true }, // on a keyframe
];
for (const c of cases) for (let k = 0; k < 3; k++) console.log(JSON.stringify(c), '→', JSON.stringify(await page.evaluate((x) => window.probe(x), c)));
await close();
