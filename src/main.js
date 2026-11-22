// Magic Cut's one screen: state + wiring to Rust (window.__TAURI__, see src-tauri/src/main.rs).
// Each region renders from `parts` through its own component in ./ui/.
import { $ } from './ui/dom.js';
import { VIDEO, paintDrag } from './ui/dropzone.js';
import { showBanner, hideBanner } from './ui/banner.js';
import { workText, makeEta, createStatusLine } from './ui/status.js';
import { renderTimeline } from './ui/timeline.js';
import { renderTranscript, paintCuts, selectedWords, highlightWord } from './ui/transcript.js';
import { toggleWords, withMagic } from './ui/cuts.js';
import { withWords, withoutPart } from './ui/edit.js';
import { createHistory } from './ui/history.js';
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

/** Record one user gesture as one undo step and repaint the cuts. */
function commit(edit, label, extra) {
  if (history.push(edit, label, extra)) paintCuts(history.edit.cuts);
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
  onTime: (i, t) => { renderTime(); highlightWord(i, t); },
  onPart: () => paintTimeline(),
  onError: (name) => showBanner(`${name} can't be played here. Its transcript still works.`),
});

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
  const before = history.edit;
  const step = redo ? history.redo() : history.undo();
  if (!step) return;
  if (step.removed) {
    await (redo ? takeOutAgain(step.removed) : putBack(step.removed));
    render();
  } else if (before.words !== history.edit.words) paintTranscript();
  else paintCuts(history.edit.cuts);
}

/** Undo of a removal: same file, new id (renamed through the history), same place. No re-transcribing. */
async function putBack({ part, index }) {
  try {
    const { id } = await invoke('add_video', { path: part.path });
    history.rename(part.id, id);
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
  if (e.metaKey || e.ctrlKey || e.altKey || !parts.length) return;
  if (e.key === ' ' && !e.target.closest('button, [role=button]')) { e.preventDefault(); player.toggle(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); player.step(-bit()); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); player.step(bit()); }
  else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); cutSelection(); }
});
$('play').onclick = () => player.toggle();

/** Backspace: cut the selected words, or bring them back if they're all cut already. */
function cutSelection() {
  const [picked] = selectedWords(); // a selection stays in the part it began in (design/edit-model.md)
  if (!picked) return;
  const { edit } = history;
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
  paintTimeline();
  paintTranscript();
  renderTime();
  magic.update();
  status.render();
}

function renderTime() {
  const { at, total } = player.times();
  $('time').textContent = `${at} / ${total}`;
}

function paintTimeline() {
  renderTimeline($('timeline'), {
    parts,
    current: player.current,
    max: MAX_PARTS,
    onPick: (i) => player.show(i),
    onRemove: removePart,
  });
}

function paintTranscript() {
  renderTranscript({ parts: edited(), cuts: history.edit.cuts, onSeek: (i, t) => player.show(i, t, true) });
}

render();
