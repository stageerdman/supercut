// Magic Cut's one screen: state + wiring to Rust (window.__TAURI__, see src-tauri/src/main.rs).
// Each region renders from `parts` through its own component in ./ui/.
import { $ } from './ui/dom.js';
import { VIDEO, paintDrag } from './ui/dropzone.js';
import { showBanner, hideBanner } from './ui/banner.js';
import { workText, makeEta, createStatusLine } from './ui/status.js';
import { createTimeline } from './ui/timeline.js';
import { renderTranscript, paintCuts as paintStruck, selectedWords, highlightWord } from './ui/transcript.js';
import { toggleWords, toggleRange, withMagic } from './ui/cuts.js';
import { withWords, withoutPart } from './ui/edit.js';
import { createHistory, changed } from './ui/history.js';
import { bit } from './ui/bit.js';
import { createMagic, claudeBanner } from './ui/magic.js';
import { paintMagic } from './ui/magic-button.js';
import { createPlayer } from './ui/player.js';
import { createRulesStore, mountRules } from './ui/rules.js';
import { runner } from './ai.js';

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { getCurrentWebview } = window.__TAURI__.webview;
const { open } = window.__TAURI__.dialog;

const MAX_PARTS = 2;

/** [{ id, name, path, duration, transcript, error }] in play order. */
let parts = [];
let progress = null; // { part, stage, done, total } while working
const history = createHistory(); // history.edit: { cuts, words } (design/edit-model.md); ⌘Z / ⇧⌘Z walk it
const secondsLeft = makeEta();
const transcribing = () => parts.some((p) => !p.transcript && !p.error);
/** Each part's length where known, so cuts stay inside it. */
const lengths = () => Object.fromEntries(parts.map((p) => [p.id, p.transcript?.seconds || p.duration || undefined]));
/** The parts as the views and Magic see them: with the edit's words (fixes included). */
const edited = () => parts.map((p) => (p.transcript ? { ...p, transcript: { ...p.transcript, words: history.edit.words[p.id] ?? [] } } : p));

/** Each part's waveform ({ perSecond, peaks }), by part id, once Rust has read it. */
const waveforms = new Map();
/** The cuts while an edge is being dragged or nudged (not an undo step yet); null otherwise. */
let live = null;
const cutsNow = () => live ?? history.edit.cuts;

/** Repaint everything that shows the cuts: transcript strikes, timeline, readout. */
function paintEdit() {
  paintStruck(cutsNow());
  timeline.paintCuts();
  renderTime();
}

/** Record one user gesture as one undo step and repaint the cuts. */
function commit(edit, label, extra) {
  history.push(edit, label, extra);
  paintEdit();
}

// ---------- Claude: checked once when the first video loads, so there's time to fix it ----------

let claudeCheck = null;
const claude = () => (claudeCheck ??= invoke('claude_status').catch(() => ({ state: 'missing' })));

// ---------- Components ----------

const status = createStatusLine({ box: $('work'), text: $('status'), track: $('progress-track'), bar: $('progress-bar') }, () =>
  workText({
    progress,
    partNo: progress && parts.length > 1 ? parts.findIndex((p) => p.id === progress.part) + 1 : null,
    secondsLeft: secondsLeft(progress),
    waiting: transcribing(),
    magicQueued: magic.state.kind === 'queued',
    magicStage: magic.state.kind === 'running' ? magic.state.stage : null,
  }),
);

const player = createPlayer($('player'), {
  parts: () => parts,
  cuts: cutsNow,
  onTime: (i, t) => { renderTime(); highlightWord(i, t); timeline.paintPlayhead(player.playing); },
  onPart: () => timeline.render(),
  onError: (name) => showBanner(`${name} can't be played here. Its transcript still works.`),
});

const timeline = createTimeline($('timeline'), {
  parts: () => parts,
  cuts: cutsNow,
  words: (id) => history.edit.words[id] ?? [],
  waveform: (id) => waveforms.get(id),
  lengths,
  playhead: () => ({ i: player.current, t: player.time }),
  current: () => player.current,
  max: MAX_PARTS,
  onSeek: (i, t) => player.show(i, t, player.playing), // keeps play/pause
  onLive: (c) => { live = c; paintEdit(); },
  onCommit: (c, label) => { live = null; commit({ ...history.edit, cuts: c }, label); },
  onToggle: () => cutSelection(),
  onRemove: removePart,
  onDragStart: () => player.pause(),
  onZoom: (z) => ($('zoom').value = Math.round(z * 100)),
});
$('zoom').oninput = (e) => timeline.zoomTo(e.target.value / 100);
$('zoom-out').onclick = () => timeline.zoomBy(-0.1);
$('zoom-in').onclick = () => timeline.zoomBy(0.1);

/** The waveform comes right after the part is added, beside transcription. A failure leaves the flat line. */
function loadWaveform(id) {
  invoke('waveform', { id }).then((w) => {
    waveforms.set(id, w);
    const p = parts.find((x) => x.id === id);
    if (p && !p.duration) p.duration = w.seconds;
    timeline.render();
    renderTime();
  }, () => {});
}

const magic = createMagic({
  runner,
  claude: () => { claudeCheck = null; return claude(); }, // re-check on press: they may have signed in since
  project: () => ({ parts: edited(), transcribing: transcribing() }),
  paint: (s) => { paintMagic(s); status.render(); },
  flash: (text, ms) => status.flash(text, ms),
  banner: showBanner,
  onResult: (c) => commit({ ...history.edit, cuts: withMagic(history.edit.cuts, c, lengths()) }, 'Magic Cut'), // one ⌘Z undoes the whole run
});
// Your rules (gear, ⌘,). Pressing Magic Cut closes the panel and saves first, so a rule typed a second ago is used.
const rules = mountRules({ gear: $('rules-gear'), panel: $('rules-panel'), box: $('rules-box') }, createRulesStore(invoke), { onError: showBanner });
const pressMagic = () => rules.close().then((saved) => saved && magic.press());
$('magic').onclick = pressMagic;

// ---------- Drop + choose ----------

const dragFeedback = (paths) => paintDrag(paths, parts.length + 1);

getCurrentWebview().onDragDropEvent(({ payload }) => {
  if (payload.type === 'enter') dragFeedback(payload.paths);
  else if (payload.type === 'leave') dragFeedback(null);
  else if (payload.type === 'drop') {
    dragFeedback(null);
    addVideos(payload.paths);
  }
});

async function choose() {
  if (parts.length >= MAX_PARTS) return showBanner('Two parts at most. Remove one to add another.');
  const picked = await open({ multiple: parts.length === 0, filters: [{ name: 'Video', extensions: VIDEO }] });
  if (picked) addVideos([].concat(picked));
}
document.addEventListener('click', (e) => e.target.closest('[data-choose]') && choose());

// ---------- Project: add, remove, transcribe one at a time ----------

let queue = Promise.resolve();

async function addVideos(paths) {
  for (const path of paths) {
    try {
      const part = await invoke('add_video', { path });
      parts.push({ ...part, duration: 0, transcript: null, error: null });
      if (parts.length === 1) {
        player.show(0);
        $('player').focus(); // Space plays at once
        if (runner) claude().then((s) => s.state !== 'ready' && showBanner(...claudeBanner(s)));
      }
      render();
      loadWaveform(part.id);
      queue = queue.then(() => transcribe(part.id));
    } catch (e) {
      showBanner(String(e));
    }
  }
}

/** The ✕ on a part: one undo step ("Removed part 2") that keeps the part's record, so ⌘Z can put it back. */
async function removePart(id) {
  await invoke('remove_part', { id }).catch((e) => showBanner(String(e)));
  const i = parts.findIndex((p) => p.id === id);
  const [part] = parts.splice(i, 1);
  commit(withoutPart(history.edit, id), `Removed part ${i + 1}`, { removed: { part, index: i } });
  player.removed(i);
  render();
}

/** ⌘Z / ⇧⌘Z. A "Removed part" step also puts the file back (undo) or takes it out again (redo). */
async function undoRedo(redo) {
  if (live) return; // mid-drag: the drag ends first
  const before = history.edit;
  const step = redo ? history.redo() : history.undo();
  if (!step) return;
  timeline.clearSelection();
  if (step.removed) {
    await (redo ? takeOutAgain(step.removed) : putBack(step.removed));
    return render();
  }
  if (before.words !== history.edit.words) paintTranscript();
  paintEdit();
  const what = changed(before, history.edit); // bring the change into view
  const i = parts.findIndex((p) => p.id === what?.part);
  if (i >= 0) timeline.reveal(i, what.s);
}

/** Undo of a removal: same file, new id (renamed through the history), same place. No re-transcribing. */
async function putBack({ part, index }) {
  try {
    const { id } = await invoke('add_video', { path: part.path });
    history.rename(part.id, id);
    if (waveforms.has(part.id)) waveforms.set(id, waveforms.get(part.id));
    else loadWaveform(id);
    parts.splice(index, 0, { ...part, id });
    player.added(index);
    if (!part.transcript && !part.error) queue = queue.then(() => transcribe(id));
  } catch (e) {
    history.redo(); // the file is gone: the history stays as it was
    showBanner(String(e));
  }
}

async function takeOutAgain({ part }) {
  await invoke('remove_part', { id: part.id }).catch((e) => showBanner(String(e)));
  const i = parts.findIndex((p) => p.id === part.id);
  if (i < 0) return;
  parts.splice(i, 1);
  player.removed(i);
}

async function transcribe(id) {
  if (!parts.some((p) => p.id === id)) return; // removed while waiting
  try {
    const t = await invoke('transcribe_part', { id });
    const part = parts.find((p) => p.id === id);
    if (part) {
      part.transcript = t;
      history.everywhere((e) => withWords(e, id, t.words)); // the words arrive; not an undo step
    }
    progress = null;
    if (!transcribing()) status.flash('Transcript ready');
  } catch (e) {
    const part = parts.find((p) => p.id === id);
    if (part) part.error = String(e);
    progress = null;
    showBanner(String(e), { label: 'Try again', run: () => { hideBanner(); retry(id); } });
  }
  render();
}

function retry(id) {
  const part = parts.find((p) => p.id === id);
  if (!part) return;
  part.error = null;
  queue = queue.then(() => transcribe(id));
  render();
}

listen('progress', ({ payload }) => {
  progress = payload;
  status.render();
});

// ---------- Keyboard (works from the first second) ----------

document.addEventListener('keydown', (e) => {
  const typing = e.target.closest('input, textarea, [contenteditable]');
  if (e.metaKey && e.key === 'o') { e.preventDefault(); choose(); return; }
  if (e.metaKey && e.key === 'Enter') { e.preventDefault(); pressMagic(); return; }
  if (typing) return;
  if (e.metaKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undoRedo(e.shiftKey); return; }
  if (e.metaKey && (e.key === '=' || e.key === '+')) { e.preventDefault(); timeline.zoomBy(0.1); return; }
  if (e.metaKey && e.key === '-') { e.preventDefault(); timeline.zoomBy(-0.1); return; }
  if (e.metaKey && e.key === '0') { e.preventDefault(); timeline.zoomTo(0); return; }
  if (e.metaKey || e.ctrlKey || e.altKey || !parts.length) return;
  if (e.key === ' ' && !e.target.closest('button, [role=button]')) { e.preventDefault(); player.toggle(); }
  else if (e.key === 'ArrowLeft' && e.shiftKey) { e.preventDefault(); timeline.grow(-1); }
  else if (e.key === 'ArrowRight' && e.shiftKey) { e.preventDefault(); timeline.grow(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); player.step(-bit()); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); player.step(bit()); }
  else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); cutSelection(); }
  else if (e.key === 'Escape') timeline.clearSelection();
});
$('play').onclick = () => player.toggle();

/**
 * Backspace, the one toggle rule: the timeline's range (or selected cut), else the selected words.
 * All of it cut already → restore it, else cut it.
 */
function cutSelection() {
  if (live) return;
  const { edit } = history;
  const range = timeline.selection;
  if (range) {
    const { cuts, label } = toggleRange(edit.cuts, range, lengths());
    timeline.clearSelection();
    return commit({ ...edit, cuts }, label);
  }
  const [picked] = selectedWords(); // a selection stays in the part it began in (design/edit-model.md)
  if (!picked) return;
  const { cuts, label } = toggleWords(edit.cuts, picked.part, picked.words, edit.words[picked.part] ?? [], lengths());
  commit({ ...edit, cuts }, label);
}

// ---------- Render ----------

function render() {
  const has = parts.length > 0;
  $('empty').classList.toggle('hidden', has);
  $('editor').classList.toggle('hidden', !has);
  $('editor').classList.toggle('flex', has);
  $('title').textContent = has ? parts[0].name.replace(/\.[^.]+$/, '') : '';
  timeline.render();
  paintTranscript();
  renderTime();
  magic.update();
  status.render();
}

/** Edited time: what the finished video will be ("01:12 / 23:40"); hover shows the original length. */
function renderTime() {
  const { at, total, original } = player.times();
  $('time').textContent = `${at} / ${total}`;
  $('time').title = `Original ${original}`;
}

function paintTranscript() {
  renderTranscript({
    parts: edited(),
    cuts: cutsNow(),
    onSeek: (i, t) => { timeline.clearSelection(); player.show(i, t, player.playing); timeline.reveal(i, t); },
  });
}

render();
