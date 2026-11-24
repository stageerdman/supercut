// Magic Cut's one screen: state + wiring to Rust (window.__TAURI__, see src-tauri/src/main.rs).
// Each region renders from `parts` through its own component in ./ui/.
import { $ } from './ui/dom.js';
import { VIDEO, paintDrag } from './ui/dropzone.js';
import { AUDIO, dragKind, sortDrop, linedUpText, noFitText, isNoFit, audioOf } from './ui/audio.js';
import { createAudioControl } from './ui/audio-panel.js';
import { generateView, generateBlock, hintView, paintHint, regenerateIcon } from './ui/transcript-generate.js';
import { mediaOf } from './ui/media.js';
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
import { createPreview } from './ui/preview.js';
import { createRulesStore, mountRules } from './ui/rules.js';
import { emptyTrace, newRun, withRun, renameTracePart } from './ui/trace.js';
import { learningLog, learningClips } from './ui/learning.js';
import { createTranscripts, transcribing as owesWords, stale, regenerated } from './ui/transcripts.js';
import { createHomeView } from './ui/home-view.js';
import { reopenedText } from './ui/home.js';
import { toDoc, fromDoc, lengthOfEdit, coverOf } from './ui/project-doc.js';
import { runner } from './ai.js';

const { invoke, convertFileSrc } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { getCurrentWebview } = window.__TAURI__.webview;
const { getCurrentWindow } = window.__TAURI__.window;
const { open } = window.__TAURI__.dialog;

const MAX_PARTS = 2;

/** [{ id, name, path, swap, duration, transcript, heard, error, wanted }] in play order (heard/wanted: transcripts.js;
 *  swap: Rust's, plus `matched`, the offset lining up found, so the nudge shows only your change). */
let parts = [];
let progress = null; // { part, stage, done, total } while transcribing
let lining = null; // the audio file's name while it is being lined up
let hintOn = false; // the transcript panel's one-time "New audio" offer is up
const history = createHistory(); // history.edit: { cuts, words } (design/edit-model.md); ⌘Z / ⇧⌘Z walk it
// The open project in the library (design/project-store.md): null on Home. One page life opens at most one: going
// Home saves, closes it in Rust and reloads, so every editor state starts fresh.
let project = null; // { id, name }
// Every change to the edit saves itself, 1 s after the last one (Autosave, below).
for (const k of ['push', 'undo', 'redo', 'everywhere', 'rename']) {
  const step = history[k];
  history[k] = (...a) => { const r = step(...a); scheduleSave(); return r; };
}
// Magic Trace (design/magic-trace.md): every Magic run's record. Beside the history, outside undo, so an undone
// Magic step still has its trace and reads as "restored".
let trace = emptyTrace();
const secondsLeft = makeEta();
const transcribing = () => owesWords(parts);
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
  preview.changed();
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

// Transcription's progress shows in the transcript panel (design/transcript-panel.md §6); the toolbar says it only
// while Magic waits for it.
const status = createStatusLine({ box: $('work'), text: $('status'), track: $('progress-track'), bar: $('progress-bar') }, () => {
  const magicQueued = magic.state.kind === 'queued';
  return workText({
    progress: magicQueued ? progress : null,
    partNo: progress && parts.length > 1 ? parts.findIndex((p) => p.id === progress.part) + 1 : null,
    secondsLeft: secondsLeft(progress),
    waiting: magicQueued && transcribing(),
    magicQueued,
    magicStage: magic.state.kind === 'running' ? magic.state.stage : null,
    lining,
  });
});

// A rendered preview of the edit: playing it crosses every cut with no seek (src/ui/preview.js, preview-play.js).
const preview = createPreview({
  invoke,
  parts: () => parts,
  cuts: cutsNow,
  size: () => ({ width: player.element.videoWidth, height: player.element.videoHeight }),
  log: (m) => console.error(m),
});

const player = createPlayer($('player'), {
  parts: () => parts,
  cuts: cutsNow,
  preview: () => preview.current(),
  onTime: (i, t) => { renderTime(); transcript.highlight(i, t); rail.paintHead(); if (!player.playing) timeline.paintPlayhead(false); windowPlay.at(i, t); },
  onFrame: (i, t) => { timeline.paintPlayhead(true, { i, t }); windowPlay.at(i, t); }, // while playing: every display frame, smooth
  onPart: () => { timeline.render(); rail.paintTrack(); rail.paintHead(); preview.changed(); }, // a part's length may be known now
  onError: (name) => showBanner(`${name} can't be played here. Its transcript still works.`),
});

let approvedCuts = () => []; // the review session's Looks goods (set once it exists, below): a green ✓ on each
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
  approved: () => approvedCuts(),
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
  pending: (p, i, count) => { // no words yet: Generate, its progress, or Try again (transcript-generate.js)
    const v = generateView(p, progress, secondsLeft(progress));
    return v && generateBlock(v, { id: p.id, single: count === 1, onPress: () => (v.kind === 'failed' ? retry(p.id) : transcribeParts()) });
  },
});

/** The panel's header row and hint after new audio: ↻ by search, "New audio…" / "Regenerating… 42 %". */
function paintWords() {
  const v = hintView(parts, { on: hintOn, progress, secondsLeft: secondsLeft(progress) });
  paintHint($('transcript-hint'), v, { onRegenerate: regenerate, onDismiss: () => { hintOn = false; paintWords(); } });
  const icon = regenerateIcon(parts);
  $('regenerate').classList.toggle('hidden', !icon.visible);
  $('regenerate').classList.toggle('flex', icon.visible);
  $('regenerate').disabled = icon.disabled;
  $('transcript-search-box').classList.toggle('invisible', !parts.some((p) => p.transcript));
}
$('regenerate').onclick = () => regenerate();

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
    scheduleSave(); // the card's length and picture can be known now
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
  transcribe: () => { transcribeParts(); },
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

// Closing the window (or going Home) is the user's final answer on the newest run (older ones were written when
// replaced); the project is saved first.
async function leaveProject() {
  await flushSave();
  const last = trace.runs.at(-1);
  if (last) await saveLearningLog(last);
}
getCurrentWindow().onCloseRequested(leaveProject);

// Your rules (gear, ⌘,). Pressing Magic Cut closes the panel and saves first, so a rule typed a second ago is used.
const rules = mountRules({ gear: $('rules-gear'), panel: $('rules-panel'), box: $('rules-box') }, createRulesStore(invoke), { onError: showBanner });
const pressMagic = () => rules.close().then((saved) => saved && magic.press());
$('magic').onclick = pressMagic;

// Cut review (design/cut-review.md): a mode of this screen. The window plays on the normal player; the bar docks
// under the player, never over the video; the session decides what Y, ⌫, ‹ › (← → ↑ ↓), ⌘Z and ▶ Play do. Only
// Stop review leaves.
const reviewParts = () => parts.map((p) => ({ id: p.id, duration: p.duration || p.transcript?.seconds || 0 }));
const windowPlay = createWindowPlay(player, { parts: reviewParts, cuts: cutsNow });
const SHORT = new Set(['Put back', 'First cut']); // verdicts and edges: 2 s
const session = createReviewSession({
  edit: () => history.edit,
  commit: (edit, label) => { history.push(edit, label); paintEdit(); }, // review's own steps: no review.changed()
  undo: () => { history.undo(); paintEdit(); notes.afterUndo(); },
  trace: () => trace,
  setTrace: (t) => { trace = t; scheduleSave(); }, // Magic's verdicts are kept with the project
  parts: reviewParts,
  play: windowPlay,
  say: (text) => status.flash(text, SHORT.has(text) ? 2000 : 3000),
});
approvedCuts = () => session.approved();
const review = createReviewControl({
  session,
  bar: createReviewBar($('player-column'), {
    onYes: () => review.yes(),
    onPlay: () => review.play(),
    onPrev: () => review.prev(),
    onNext: () => review.next(),
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

// Replace audio (design/audio-swap.md): the toolbar button and, once a part has mic audio, its panel.
const audio = createAudioControl(
  { button: $('audio-button'), panel: $('audio-panel'), rows: $('audio-rows'), replace: $('audio-replace'), camera: $('audio-camera') },
  { parts: () => parts, onPick: pickAudio, onCamera: useCameraAudio, onNudge: nudge, onClose: endNudge },
);

/** The toolbar's two actions. Reviewing: ✦ Magic is gone and the button reads Stop review. */
function paintToolbar() {
  const v = reviewButton(session.progress(), { on: review.on, busy: magicBusy(), end: !!session.view()?.end });
  paintReview(v);
  paintMagic(magic.state, { plain: v.primary, hidden: review.on, gap: v.visible });
  audio.paint({ hidden: review.on, busy: !!lining }); // not a review action
}

// ---------- Drop + choose ----------

function dragFeedback(paths) {
  const kind = dragKind(paths, parts.length > 0);
  paintDrag(kind, parts.length + 1);
  if (!project) home.drag(kind);
}

getCurrentWebview().onDragDropEvent(({ payload }) => {
  if (payload.type === 'enter') dragFeedback(payload.paths);
  else if (payload.type === 'leave') dragFeedback(null);
  else if (payload.type === 'drop') {
    dragFeedback(null);
    dropped(payload.paths);
  }
});

/** A drop: videos open as parts (anything else is refused by Rust, with its banner); then audio lines up. Audio
 *  with no video open does nothing (the drop zone said "Add the video first"). */
async function dropped(paths) {
  const { videos, audio: sounds, other } = sortDrop(paths);
  if (!project) { // Home: videos start a project (or open the one made from the same video)
    if (videos.length || other.length) await newProject([...videos, ...other]);
    return;
  }
  if (videos.length || other.length) await addVideos([...videos, ...other]);
  if (sounds.length && parts.length && !review.on) replaceAudio(sounds);
}

async function choose() {
  if (parts.length >= MAX_PARTS) return showBanner('Two parts at most. Remove one to add another.');
  const picked = await open({ multiple: parts.length === 0, filters: [{ name: 'Video', extensions: VIDEO }] });
  if (!picked) return;
  if (project) addVideos([].concat(picked));
  else newProject([].concat(picked));
}
document.addEventListener('click', (e) => e.target.closest('[data-choose]') && choose());

// ---------- Home and the library (design/home-screen.md, design/project-store.md) ----------

const home = createHomeView({ strip: $('home-strip'), heading: $('home-heading'), grid: $('home-grid') }, {
  open: (id) => openProject(id),
  setLocked: (id, locked) => invoke('set_locked', { id, locked }),
  remove: (id) => invoke('delete_project', { id }),
  // Cancel is the alert's default, so Return and Esc keep the project (src-tauri/src/confirm.rs).
  confirm: ({ title, message }) => invoke('confirm_delete', { title, message }).catch(() => false),
  popup,
  failed: showBanner,
  changed: () => render(),
  src: (path) => convertFileSrc(path),
});

/** Launch (and every return Home): nothing open, the 30-day sweep, then the list, the newest card focused. */
async function showHome() {
  await invoke('close_project').catch(() => {}); // a reload mid-project leaves Rust holding it
  const swept = await invoke('sweep_projects').catch((e) => { console.error('sweep', e); return 0; });
  const list = await invoke('list_projects').catch((e) => { console.error('list', e); return []; });
  home.show(list, swept);
  render();
  home.focusFirst();
}

/** Drop / Choose Video… on Home: a new project, or the one already made from this video. */
async function newProject(paths) {
  try {
    const o = await invoke('new_project', { paths });
    const before = home.summary(o.summary.id)?.usedAt ?? null; // the list still has it as it was
    load(o);
    if (o.existing) status.flash(reopenedText(before, Date.now()), 4000);
  } catch (e) {
    showBanner(String(e));
  }
}

async function openProject(id) {
  try {
    load(await invoke('open_project', { id }));
  } catch (e) {
    showBanner(String(e));
  }
}

/** A project from the library becomes the editor's state: parts (and their swaps), words, cuts, notes, Magic's
 *  record. Runs once per page life, on fresh state; the undo history starts empty. */
function load(o) {
  hideBanner();
  project = { id: o.summary.id, name: o.summary.name };
  const s = fromDoc(o.ui, o.parts);
  parts = s.parts;
  trace = s.trace;
  history.everywhere(() => s.edit);
  if (parts.length) {
    player.show(0);
    $('player').focus(); // Space plays at once
    if (runner) claude().then((c) => c.state !== 'ready' && showBanner(...claudeBanner(c)));
  }
  render();
  parts.forEach((p) => loadWaveform(p.id));
  if (!o.ui) scheduleSave(); // a new project's first save makes its card's picture
}

/** ‹ All projects: save, stop this project's work, back to Home on a fresh page. */
async function goHome() {
  if (!project) return;
  await leaveProject();
  await invoke('close_project').catch((e) => console.error('close', e));
  location.reload();
}
$('home-button').onclick = goHome;

// ---------- Autosave: 1 s after the last change; flushed before Home and on quit ----------

let saveTimer = null;
let saving = Promise.resolve();
let lastSaved = '';

function scheduleSave() {
  if (!project) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 1000);
}

/** Writes the project now if anything changed since the last write. Resolves when it is on disk (or failed). */
function flushSave() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!project) return saving;
  const { cuts } = history.edit;
  const args = { id: project.id, name: project.name, length: lengthOfEdit(parts, cuts), cover: coverOf(parts, cuts), ui: toDoc({ parts, edit: history.edit, trace }) };
  const key = JSON.stringify(args);
  if (key === lastSaved) return saving;
  lastSaved = key;
  saving = saving.then(() => invoke('save_project', args)).catch((e) => {
    lastSaved = ''; // try again with the next change
    console.error('save', e);
  });
  return saving;
}

// ---------- Project: add, remove, swap the sound, transcribe on demand ----------

const transcripts = createTranscripts({ parts: () => parts, run: transcribe });

/** Ask for words: these parts (all when no ids), one at a time. Nothing asks on load. */
function transcribeParts(ids) {
  const done = transcripts.request(ids);
  render();
  return done;
}

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
  if (step.audio) { // Replaced / Nudged audio, Back to camera audio: the sound goes back; words stay
    status.flash(`${redo ? 'Redo' : 'Undo'}: ${step.label}`);
    return setAudio(redo ? step.audio.after : step.audio.before);
  }
  if (before.words !== history.edit.words) transcript.render();
  paintEdit();
  notes.afterUndo(); // an open card shows its note as it is now, or closes
  const what = changed(before, history.edit); // bring the change into view, in both views
  const i = parts.findIndex((p) => p.id === what?.part);
  if (i >= 0) { timeline.reveal(i, what.s); transcript.reveal(what.part, what.s); }
  review.changed(); // the review count follows (review stays on)
}

/** Undo of a removal: same file and sound (the swap is made again at its offset, no new search), new id (renamed
 *  through the history), same place. No re-transcribing; words still owed are asked for again. */
async function putBack({ part, index }) {
  try {
    const { id } = await invoke('add_video', { path: part.path });
    const swap = part.swap && (await invoke('swap_audio', { id, recording: part.swap.recording, offset: part.swap.offset })
      .then((p) => ({ ...p.swap, matched: part.swap.matched, synced: part.swap.synced }), (e) => { showBanner(`${part.name} is back with its own sound: ${e}`); return null; }));
    history.rename(part.id, id);
    trace = renameTracePart(trace, part.id, id);
    if (waveforms.has(part.id)) waveforms.set(id, waveforms.get(part.id));
    else loadWaveform(id);
    parts.splice(index, 0, { ...part, id, swap });
    player.added(index);
    if (part.wanted) transcripts.request([id]);
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

/**
 * One part's words. A first transcript arrives in every state (not an undo step); a regenerated one is one undo
 * step that keeps the words you fixed. `heard` is the file it listened to, read before it starts: audio changed
 * meanwhile leaves these words stale.
 */
async function transcribe(id) {
  const start = parts.find((p) => p.id === id);
  if (!start) return; // removed while waiting
  const heard = mediaOf(start);
  const again = !!start.transcript;
  try {
    const t = await invoke('transcribe_part', { id });
    const part = parts.find((p) => p.id === id);
    progress = null;
    if (part) {
      part.transcript = t;
      part.heard = heard;
      part.wanted = false;
      if (again) {
        commit(withWords(history.edit, id, regenerated(history.edit.words[id] ?? [], t.words)), 'Regenerated transcript');
        hintOn = false;
        status.flash('Transcript regenerated · ⌘Z to undo');
      } else {
        history.everywhere((e) => withWords(e, id, t.words));
        if (!transcribing()) status.flash('Transcript ready');
      }
    }
  } catch (e) {
    const part = parts.find((p) => p.id === id);
    progress = null;
    if (part) { part.error = String(e); part.wanted = false; } // the panel says it, with Try again
    console.error('transcribe', id, e);
  }
  render();
}

/** Regenerate (the hint row, the ↻): new words for every part whose words are from other audio. */
function regenerate() {
  transcripts.regenerate();
  render();
}

function retry(id) {
  const part = parts.find((p) => p.id === id);
  if (!part) return;
  part.error = null;
  transcribeParts([id]);
}

// ---------- Replace audio (design/audio-swap.md) ----------

async function pickAudio() {
  if (!parts.length || lining) return;
  const picked = await open({ multiple: true, filters: [{ name: 'Audio', extensions: AUDIO }] });
  if (picked) replaceAudio([].concat(picked));
}

/** A part plays `swap` now (null: its camera audio): the player, waveform and preview follow. Words don't change. */
function applySwap(part, swap) {
  part.swap = swap;
  const i = parts.indexOf(part);
  if (i >= 0) player.reload(i);
  waveforms.delete(part.id);
  loadWaveform(part.id);
  preview.changed();
}

/**
 * Each file lines up with the parts it fits (one file per part; the first that fits wins). A file that fits nowhere
 * changes nothing and says so once. The whole drop is one undo step. Words stay; Regenerate is offered.
 */
async function replaceAudio(files) {
  if (lining || !parts.length) return;
  const before = audioOf(parts);
  const fitted = new Set();
  for (const file of files) {
    lining = file.split('/').pop();
    paintToolbar();
    status.render();
    let fits = false, broken = false;
    for (const part of parts.filter((p) => !fitted.has(p.id))) {
      try {
        const { swap } = await invoke('swap_audio', { id: part.id, recording: file });
        if (!parts.includes(part)) continue; // removed meanwhile
        applySwap(part, { ...swap, matched: swap.offset });
        fitted.add(part.id);
        fits = true;
        break;
      } catch (e) {
        if (isNoFit(e)) continue;
        showBanner(String(e));
        broken = true;
        break;
      }
    }
    if (!fits && !broken) showBanner(noFitText(file), { label: 'Choose another…', run: () => { hideBanner(); pickAudio(); } });
  }
  lining = null;
  if (fitted.size) {
    history.push({ ...history.edit }, 'Replaced audio', { audio: { before, after: audioOf(parts) } });
    hintOn = parts.some((p) => fitted.has(p.id) && stale(p));
    const nos = parts.flatMap((p, i) => (fitted.has(p.id) ? [i + 1] : []));
    status.flash(linedUpText(nos, parts.length));
  }
  render();
}

let audioWork = Promise.resolve(); // Rust's remuxes, one after another

/**
 * Make the parts' sound `list` ([{ id, swap }], from audioOf): undo/redo and the nudge. A part already playing it
 * is left alone unless `force` (the nudge changed the offset in place). Mic audio is made again at its offset (no new
 * search); its match and sync are kept.
 */
function setAudio(list, force = false) {
  audioWork = audioWork.then(async () => {
    for (const { id, swap } of list) {
      const part = parts.find((p) => p.id === id);
      if (!part || (!force && part.swap?.media === swap?.media && part.swap?.offset === swap?.offset)) continue;
      try {
        if (!swap) {
          await invoke('use_camera_audio', { id });
          applySwap(part, null);
        } else {
          const made = await invoke('swap_audio', { id, recording: swap.recording, offset: swap.offset });
          applySwap(part, { ...made.swap, matched: swap.matched, synced: swap.synced });
        }
      } catch (e) {
        showBanner(String(e));
      }
    }
    render();
  });
  return audioWork;
}

/** The panel's Use camera audio: every part plays its own sound again. One undo step. */
function useCameraAudio() {
  const before = audioOf(parts);
  if (!before.some((a) => a.swap)) return;
  const after = before.map((a) => ({ id: a.id, swap: null }));
  history.push({ ...history.edit }, 'Back to camera audio', { audio: { before, after } });
  setAudio(after).then(() => status.flash('Camera audio'));
}

/** The nudge: the offset moves at once in the panel; the sound is made again once you stop for 300 ms. One undo
 *  step per panel visit ("Nudged audio"). */
let nudgeStart = null, nudgeTimer = null, nudged = new Set();
function nudge(id, offset) {
  const part = parts.find((p) => p.id === id);
  if (!part?.swap) return;
  nudgeStart ??= audioOf(parts);
  part.swap = { ...part.swap, offset };
  nudged.add(id);
  audio.repaint();
  clearTimeout(nudgeTimer);
  nudgeTimer = setTimeout(flushNudge, 300);
}

function flushNudge() {
  clearTimeout(nudgeTimer);
  nudgeTimer = null;
  const list = audioOf(parts).filter((a) => nudged.has(a.id));
  nudged = new Set();
  return list.length ? setAudio(list, true) : audioWork;
}

function endNudge() {
  if (!nudgeStart) return;
  const before = nudgeStart;
  nudgeStart = null;
  flushNudge();
  const after = audioOf(parts);
  if (after.some((a, i) => a.swap?.offset !== before[i]?.swap?.offset)) {
    history.push({ ...history.edit }, 'Nudged audio', { audio: { before, after } });
  }
}

listen('progress', ({ payload }) => {
  progress = payload;
  status.render();
  transcript.paintPending();
  paintWords();
});

// ---------- Keyboard (works from the first second) ----------

document.addEventListener('keydown', (e) => {
  const typing = e.target.closest('input, textarea, [contenteditable]');
  if (e.metaKey && e.key === 'o') { e.preventDefault(); choose(); return; }
  if (!project) return; // Home: its cards take their own keys (home-view.js)
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
  const cards = !project && home.count > 0; // Home with projects; else the big drop zone when there's no video
  $('home').classList.toggle('hidden', !cards);
  $('empty').classList.toggle('hidden', has || cards);
  $('editor').classList.toggle('hidden', !has);
  $('editor').classList.toggle('flex', has);
  $('home-button').classList.toggle('hidden', !project);
  $('home-button').classList.toggle('flex', !!project);
  $('title').textContent = project?.name ?? '';
  scheduleSave();
  timeline.render();
  transcript.render();
  paintWords();
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

showHome();
