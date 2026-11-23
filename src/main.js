// Magic Cut's one screen: state + wiring to Rust (window.__TAURI__, see src-tauri/src/main.rs).
// Each region renders from `parts` through its own component in ./ui/.
import { $ } from './ui/dom.js';
import { VIDEO, paintDrag } from './ui/dropzone.js';
import { showBanner, hideBanner } from './ui/banner.js';
import { workText, makeEta, createStatusLine } from './ui/status.js';
import { createTimeline } from './ui/timeline.js';
import { createTranscript } from './ui/transcript.js';
import { mountSearch } from './ui/transcript-search.js';
import { mountDivider } from './ui/divider.js';
import { createRail } from './ui/rail.js';
import { toggleSelection, keptSelection, wordsIn } from './ui/selection.js';
import { removeText } from './ui/fix.js';
import { menuFor, noteMenu, popup } from './ui/context-menu.js';
import { withWords, withoutPart, partsWithWords, notesOf } from './ui/edit.js';
import { createNoteCard } from './ui/note-card.js';
import { createNoteControl } from './ui/note-control.js';
import { createHistory, changed } from './ui/history.js';
import { bit } from './ui/bit.js';
import { createMagic, claudeBanner, withMagicRun, magicNotesOpen } from './ui/magic.js';
import { paintMagic, paintReview } from './ui/magic-button.js';
import { createWindowPlay } from './ui/review-play.js';
import { createReviewSession } from './ui/review-session.js';
import { createReviewBar } from './ui/review-bar.js';
import { createReviewControl, reviewButton } from './ui/review-control.js';
import { createPlayer } from './ui/player.js';
import { createRulesStore, mountRules } from './ui/rules.js';
import { emptyTrace, newRun, withRun, renameTracePart } from './ui/trace.js';
import { learningLog, learningClips } from './ui/learning.js';
import { runner } from './ai.js';

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { getCurrentWebview } = window.__TAURI__.webview;
const { getCurrentWindow } = window.__TAURI__.window;
const { open } = window.__TAURI__.dialog;

const MAX_PARTS = 2;

/** [{ id, name, path, duration, transcript, error }] in play order. */
let parts = [];
let progress = null; // { part, stage, done, total } while working
const history = createHistory(); // history.edit: { cuts, words } (design/edit-model.md); ⌘Z / ⇧⌘Z walk it
// Magic Trace (design/magic-trace.md): every Magic run's record. Beside the history, outside undo, so an undone
// Magic step still has its trace and reads as "restored".
let trace = emptyTrace();
const secondsLeft = makeEta();
const transcribing = () => parts.some((p) => !p.transcript && !p.error);
/** Each part's length where known, so cuts stay inside it. */
const lengths = () => Object.fromEntries(parts.map((p) => [p.id, p.transcript?.seconds || p.duration || undefined]));
/** The parts as the views and Magic see them: with the edit's words (fixes included). */
const edited = () => partsWithWords(parts, history.edit);

/** Each part's waveform ({ perSecond, peaks }), by part id, once Rust has read it. */
const waveforms = new Map();
/** The cuts while an edge is being dragged or nudged (not an undo step yet); null otherwise. */
let live = null;
const cutsNow = () => live ?? history.edit.cuts;

/** Repaint everything that shows the cuts: transcript strikes, timeline, readout. */
function paintEdit() {
  transcript.paintCuts();
  timeline.paintCuts(); // with the notes lane
  notes.paint(); // the open-notes chip
  renderTime();
}

/** Record one user gesture as one undo step and repaint the cuts. */
function commit(edit, label, extra) {
  history.push(edit, label, extra);
  paintEdit();
  review.changed(); // the bar's count and reason follow; review stays on
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
  onTime: (i, t) => { renderTime(); transcript.highlight(i, t); rail.paintHead(); if (!player.playing) timeline.paintPlayhead(false); windowPlay.at(i, t); },
  onFrame: (i, t) => { timeline.paintPlayhead(true, { i, t }); windowPlay.at(i, t); }, // while playing: every display frame, smooth
  onPart: () => { timeline.render(); rail.paintTrack(); rail.paintHead(); },
  onError: (name) => showBanner(`${name} can't be played here. Its transcript still works.`),
});

const timeline = createTimeline($('timeline'), {
  parts: () => parts,
  cuts: cutsNow,
  words: (id) => history.edit.words[id] ?? [],
  speech: (id) => parts.find((p) => p.id === id)?.transcript?.speech, // the audio's talking: pauses come from it
  waveform: (id) => waveforms.get(id),
  lengths,
  playhead: () => ({ i: player.current, t: player.time }),
  current: () => player.current,
  max: MAX_PARTS,
  onSeek: (i, t) => seekTo(i, t), // a click or a scrub
  onLive: (c) => { live = c; paintEdit(); },
  onCommit: (c, label) => { live = null; commit({ ...history.edit, cuts: c }, label); },
  onToggle: () => cutSelection(),
  onRemove: removePart,
  onDragStart: () => player.pause(),
  onZoom: (z) => ($('zoom').value = Math.round(z * 100)),
  onSelect: (sel) => { transcript.paintSelection(); review.selected(sel); }, // one selection, shown in both views
  onMenu: (at, where) => openMenu(at, where),
  notes: () => notesOf(history.edit),
  showDone: () => notes.showDone,
  onNote: (id, o) => notes.open(id, o),
  onNoteMenu: (id, at) => openNoteMenu(id, at),
});

const transcript = createTranscript($('transcript'), $('transcript-panel'), {
  parts: edited,
  cuts: cutsNow,
  selection: () => timeline.selection,
  onSelect: (sel) => timeline.select(sel),
  onSeek: (i, t) => { player.show(i, t, player.playing); timeline.reveal(i, t); }, // keeps play/pause
  onFix: (id, words, label) => {
    timeline.clearSelection();
    commit(withWords(history.edit, id, words), label); // one undo step; Magic reads these words next run
    transcript.render();
  },
  playhead: () => ({ i: player.current, t: player.time }),
  onView: (from, to) => rail.paintView(from, to),
  onMenu: (at) => openMenu(at),
  notes: () => notesOf(history.edit),
  onNote: (id, o) => notes.open(id, o),
});

// Notes (design/notes.md): the card over the player's bottom, and the gestures that make and change notes.
const card = createNoteCard($('player-box'), {
  onSave: (id, text) => notes.save(id, text),
  onColor: (id, c) => notes.color(id, c),
  onDone: (id) => notes.done(id),
  onReopen: (id) => notes.reopen(id),
  onDelete: (id) => notes.remove(id),
  onPlay: () => player.play(), // M, Space: the note stays empty and it plays on
  // Fixing the note's problem (timeline, words), or making the next note, leaves the card open.
  keepOpen: (t) => ['timeline', 'transcript', 'add-note', 'notes-chip'].some((id) => $(id).contains(t)),
});
const notes = createNoteControl({
  history, commit, timeline, card, player, status, cuts: cutsNow, lengths,
  parts: () => parts,
  seek: (i, t) => seekTo(i, t),
  chip: $('notes-chip'),
});
$('add-note').onclick = () => notes.add();
$('notes-chip').onclick = () => notes.go(1);
// The buttons don't take focus, so Space and the arrows keep working after a click.
for (const id of ['add-note', 'notes-chip']) $(id).addEventListener('mousedown', (e) => e.preventDefault());

// The panel around the words: its width, the rail, the search field (design/transcript-panel.md).
mountDivider($('transcript-divider'), $('transcript-panel'));
const rail = createRail($('transcript-rail'), {
  lengths: () => parts.map((p) => p.duration || p.transcript?.seconds || 0),
  playhead: () => ({ i: player.current, t: player.time }),
  onSeek: (i, t) => { seekTo(i, t); timeline.reveal(i, t); },
});
const search = mountSearch(
  { input: $('transcript-search'), count: $('search-count'), prev: $('search-prev'), next: $('search-next'), tools: $('search-tools') },
  transcript,
);

/** A seek you make (timeline, rail): the video goes there, play/pause kept, and the transcript follows. */
function seekTo(i, t) {
  player.show(i, t, player.playing);
  transcript.goTo(i, t);
  rail.paintHead();
}
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
    rail.paintTrack();
    rail.paintHead();
    renderTime();
  }, () => {});
}

const magic = createMagic({
  runner,
  claude: () => { claudeCheck = null; return claude(); }, // re-check on press: they may have signed in since
  project: () => ({ parts: edited(), transcribing: transcribing() }),
  paint: () => { paintToolbar(); status.render(); },
  flash: (text, ms) => status.flash(text, ms),
  banner: showBanner,
  reviewable: () => session.progress().stops > 0,
  onResult: (r) => { // one ⌘Z undoes the whole run, cuts and notes
    if (r.run) traceRun(r);
    const seconds = edited().map((p) => ({ id: p.id, seconds: p.transcript?.seconds }));
    commit(withMagicRun(history.edit, r, seconds, lengths()), 'Magic Cut');
    notes.refresh(); // a replaced Magic note's open card closes
    return magicNotesOpen(history.edit);
  },
});

/** A Magic result joins the trace, before it's applied: the run it replaces is judged by the cuts it left. */
function traceRun(result) {
  const cuts = history.edit.cuts;
  const at = Date.now();
  const run = newRun(result, { id: `run-${at}`, at, before: cuts.filter((c) => c.by === 'you') });
  trace = withRun(trace, run, cuts, partIds());
  const replaced = trace.runs.at(-2);
  if (replaced) saveLearningLog(replaced);
}

const partIds = () => parts.map((p) => p.id);

/** Writes a run's learning log if the user disagreed with it (else there's nothing to learn), and a clip of
 *  what was heard before each review "No". */
function saveLearningLog(run) {
  const log = learningLog(run, history.edit.cuts, partIds(), notesOf(history.edit));
  if (!log) return Promise.resolve();
  const saved = invoke('save_learning_log', { id: run.id, log }).catch((e) => console.error('learning', run.id, e));
  return Promise.all([saved, ...learningClips(run.id, log).map(saveLearningClip)]);
}

const clipsSaved = new Set(); // the same window heard again needs no new encode
function saveLearningClip({ id, heard }) {
  const key = `${id}:${JSON.stringify(heard)}`;
  if (clipsSaved.has(key)) return Promise.resolve();
  clipsSaved.add(key);
  return invoke('save_learning_clip', { id, spans: heard }).catch((e) => {
    clipsSaved.delete(key);
    console.error('learning clip', id, heard, e);
  });
}

// Closing the window is the user's final answer on the newest run (older ones were written when replaced).
getCurrentWindow().onCloseRequested(async () => {
  const last = trace.runs.at(-1);
  if (last) await saveLearningLog(last);
});

// Your rules (gear, ⌘,). Pressing Magic Cut closes the panel and saves first, so a rule typed a second ago is used.
const rules = mountRules({ gear: $('rules-gear'), panel: $('rules-panel'), box: $('rules-box') }, createRulesStore(invoke), { onError: showBanner });
const pressMagic = () => rules.close().then((saved) => saved && magic.press());
$('magic').onclick = pressMagic;

// Cut review (design/cut-review.md): a mode of this screen. The window plays on the normal player; the bar floats
// over the player's bottom; the session decides what Y, N, ⌫, ↑/↓, ⌘Z and ▶ Play do. Only Stop review leaves.
const reviewParts = () => parts.map((p) => ({ id: p.id, duration: p.duration || p.transcript?.seconds || 0 }));
const windowPlay = createWindowPlay(player, { parts: reviewParts, cuts: cutsNow });
const SHORT = new Set(['Noted, fix later', 'Put back', 'Last cut', 'First cut']); // verdicts and edges: 2 s
const session = createReviewSession({
  edit: () => history.edit,
  commit: (edit, label) => { history.push(edit, label); paintEdit(); }, // review's own steps: no review.changed()
  undo: () => { history.undo(); paintEdit(); notes.afterUndo(); },
  trace: () => trace,
  setTrace: (t) => { trace = t; },
  parts: reviewParts,
  play: windowPlay,
  say: (text) => status.flash(text, SHORT.has(text) ? 2000 : 3000),
});
const review = createReviewControl({
  session,
  bar: createReviewBar($('player-box'), {
    onYes: () => review.yes(),
    onNo: () => review.no(),
    onPlay: () => review.play(),
    onChoose: (only) => review.choose(only),
  }),
  timeline,
  transcript,
  cuts: cutsNow,
  parts: () => parts,
  closeCard: () => card.close(),
  undo: () => undoRedo(false),
  flash: (text, ms) => status.flash(text, ms),
  paint: () => paintToolbar(),
});
const magicBusy = () => magic.state.kind === 'queued' || magic.state.kind === 'running';
// Review cuts ↔ Stop review: one button, one place; the only way out of review.
$('review').onclick = () => (review.on ? review.leave() : !magicBusy() && review.start());
$('review').addEventListener('mousedown', (e) => e.preventDefault()); // Space and the keys stay review's

/** The toolbar's two actions. Reviewing: ✦ Magic is gone and the button reads Stop review. */
function paintToolbar() {
  const v = reviewButton(session.progress(), { on: review.on, busy: magicBusy(), end: !!session.view()?.end });
  paintReview(v);
  paintMagic(magic.state, { plain: v.primary, hidden: review.on, gap: v.visible });
}

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
  if (step.removed) timeline.clearSelection();
  else selectionAfterUndo();
  if (step.removed) {
    await (redo ? takeOutAgain(step.removed) : putBack(step.removed));
    return render();
  }
  if (before.words !== history.edit.words) transcript.render();
  paintEdit();
  notes.afterUndo(); // an open card shows its note as it is now, or closes
  const what = changed(before, history.edit); // bring the change into view, in both views
  const i = parts.findIndex((p) => p.id === what?.part);
  if (i >= 0) { timeline.reveal(i, what.s); transcript.reveal(what.part, what.s); }
  review.changed(); // the review count follows (review stays on)
}

/** Undo of a removal: same file, new id (renamed through the history), same place. No re-transcribing. */
async function putBack({ part, index }) {
  try {
    const { id } = await invoke('add_video', { path: part.path });
    history.rename(part.id, id);
    trace = renameTracePart(trace, part.id, id);
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
  if (e.metaKey && e.key === 'Enter') { // a note's card is open (even unfocused): ⌘Return finishes it, not Magic
    e.preventDefault();
    if (card.isOpen) notes.done(card.id);
    else if (!review.on) pressMagic(); // never a Magic run mid-review
    return;
  }
  if (e.metaKey && e.key === 'f' && parts.some((p) => p.transcript)) { e.preventDefault(); search.focus(); return; }
  if (typing) return;
  if (review.key(e)) { e.preventDefault(); return; } // review keys win, even with words selected
  if (e.metaKey && e.key.toLowerCase() === 'z') { e.preventDefault(); undoRedo(e.shiftKey); return; }
  if (e.metaKey && (e.key === '=' || e.key === '+')) { e.preventDefault(); timeline.zoomBy(0.1); return; }
  if (e.metaKey && e.key === '-') { e.preventDefault(); timeline.zoomBy(-0.1); return; }
  if (e.metaKey && e.key === '0') { e.preventDefault(); timeline.zoomTo(0); return; }
  if (e.altKey && !e.metaKey && !e.ctrlKey && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && parts.length) {
    e.preventDefault(); // ⌥→ / ⌥←: the next / previous open note
    notes.go(e.key === 'ArrowRight' ? 1 : -1);
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey || !parts.length) return;
  const sel = timeline.selection;
  if (e.key === 'F10' && e.shiftKey) { e.preventDefault(); openMenu(null); return; }
  // R: start reviewing. Not with words selected, where letters fix words.
  if ((e.key === 'r' || e.key === 'R') && !(sel && !sel.cut) && !magicBusy()) { e.preventDefault(); review.start(); return; }
  // M: a note at the playhead (or over the selection). Before writeKey, so it never opens the fix field.
  if (e.key === 'm' || e.key === 'M') { e.preventDefault(); notes.add(); return; }
  if (sel && !sel.cut && writeKey(e)) { e.preventDefault(); transcript.write(e.key === 'Enter' ? null : e.key); return; }
  if (e.key === ' ' && !e.target.closest('button, [role=button]')) { e.preventDefault(); player.toggle(); }
  else if (e.key === 'ArrowLeft' && e.shiftKey) { e.preventDefault(); timeline.grow(-1); }
  else if (e.key === 'ArrowRight' && e.shiftKey) { e.preventDefault(); timeline.grow(1); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); stepPlayhead(-bit()); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); stepPlayhead(bit()); }
  else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); cutSelection(); }
  else if (e.key === 'Escape') { if (card.isOpen) card.close(); else timeline.clearSelection(); }
});
// Space in review is pause / play, even on a focused button: its click comes on keyup, so stop that too.
document.addEventListener('keyup', (e) => {
  if (review.on && e.key === ' ' && !e.target.closest('input, textarea, [contenteditable]')) e.preventDefault();
});
$('play').onclick = () => player.toggle();

/** ← →: one bit, and the transcript follows like any other seek. */
function stepPlayhead(d) {
  player.step(d);
  transcript.goTo(player.current, player.time);
}

/**
 * Backspace, the one toggle rule, on the one selection (words, a time range or a cut, from either view).
 * All of it cut already → restore it, else cut it. A cut or a time range stays selected (`keptSelection`), so ⌫
 * again toggles the same spot back; ⌘Z keeps it too (`spot`).
 */
let spot = null; // the range the last ⌫ toggled, while it is still the selection
function cutSelection() {
  const sel = timeline.selection;
  if (live || !sel) return;
  const { edit } = history;
  const { cuts, label } = toggleSelection(edit.cuts, sel, edit.words[sel.part] ?? [], lengths());
  if (!label) return;
  const next = keptSelection(sel, cuts);
  spot = next;
  commit({ ...edit, cuts }, label);
  timeline.select(next); // after the commit: the cuts it reads are the new ones
}

/**
 * A key that types on the selection from anywhere but a text field: a letter (the field opens holding it), or
 * Return (not on a real button, which Return presses). Spec: design/missed-words.md ("Where you type").
 */
const writeKey = (e) => (e.key.length === 1 && e.key !== ' ') || (e.key === 'Enter' && !e.target.closest('button'));

/**
 * Right-click (or ⇧F10): the native menu (context-menu.js) for the selection, plus Add Note (Here). Items run their
 * shortcut's code. `where` = { part, t, lane } from the timeline: the spot Add Note Here uses with nothing selected.
 */
function openMenu(at, where = null) {
  const sel = timeline.selection;
  if (live || !parts.length) return;
  const words = sel ? history.edit.words[sel.part] ?? [] : [];
  const restore = !!sel && (!!sel.cut || toggleSelection(history.edit.cuts, sel, words, lengths()).label.startsWith('Restored'));
  const items = menuFor(sel, { words: !!sel && !!wordsIn(sel, words), restore, notes: true, lane: !!where?.lane, showDone: notes.showDone });
  popup(items, {
    write: () => transcript.write(null),
    toggle: cutSelection,
    removeText: removeSelectedText,
    addNote: () => notes.add(sel || !where ? null : { part: where.part, t: where.t }),
    showDone: () => notes.toggleShowDone(),
  }, at).catch((e) => console.error('menu', e));
}

/** Right-click on a note in the lane: Done (or Reopen) and Delete, the card's buttons for the mouse. */
function openNoteMenu(id, at) {
  const note = notesOf(history.edit).find((n) => n.id === id);
  if (!note || live) return;
  popup(noteMenu(note), {
    done: () => notes.done(id),
    reopen: () => notes.reopen(id),
    deleteNote: () => notes.remove(id),
  }, at).catch((e) => console.error('menu', e));
}

/** Remove Text: the highlighted words leave the transcript, the video stays. One undo step. */
function removeSelectedText() {
  const sel = timeline.selection;
  const words = sel ? history.edit.words[sel.part] ?? [] : [];
  const hit = sel && wordsIn(sel, words);
  if (!hit) return;
  const r = removeText(words, hit.from, hit.to);
  timeline.clearSelection();
  commit(withWords(history.edit, sel.part, r.words), r.label);
  transcript.render();
}

/** After ⌘Z / ⇧⌘Z: the spot ⌫ toggled stays selected (as a cut or a range, whichever it is now); else nothing. */
function selectionAfterUndo() {
  const sel = timeline.selection;
  const keep = spot && sel && !sel.words && !sel.pause && sel.part === spot.part
    && Math.abs(sel.s - spot.s) < 1e-6 && Math.abs(sel.e - spot.e) < 1e-6;
  timeline.select(keep ? keptSelection(sel, history.edit.cuts) : null);
}

// ---------- Render ----------

function render() {
  const has = parts.length > 0;
  $('empty').classList.toggle('hidden', has);
  $('editor').classList.toggle('hidden', !has);
  $('editor').classList.toggle('flex', has);
  $('title').textContent = has ? parts[0].name.replace(/\.[^.]+$/, '') : '';
  timeline.render();
  transcript.render();
  rail.paintTrack();
  rail.paintHead();
  renderTime();
  notes.refresh(); // a part's notes come and go with it
  magic.update();
  paintToolbar();
  status.render();
}

/** Edited time: what the finished video will be ("01:12 / 23:40"); hover shows the original length. */
function renderTime() {
  const { at, total, original } = player.times();
  $('time').textContent = `${at} / ${total}`;
  $('time').title = `Original ${original}`;
}

render();
