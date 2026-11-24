// Magic: the AI spot. The toolbar's primary button + the AI's status and results.
// Contract for the Claude Code connection: design/ai-slot.md. Magic shows as soon as a video is loaded.
// Until a runner is connected it's a placeholder: pressing it says Magic isn't connected yet.
//
// States: off · ready · queued · running(stage) · (done → ready, summary in the status line)
// A failed run changes nothing in the project: cuts and notes are only handed on after success.
import { withMagic } from './cuts.js';
import { notesOf } from './edit.js';
import { withMagicNotes, openNotes } from './notes.js';

/**
 * Pure: a run's `{ cuts, notes }` applied to the edit, as one edit (one "Magic Cut" undo step). Your cuts and notes
 * win (`withMagic`, `withMagicNotes`). `parts` in play order, `[{ id, seconds }]`: the order and the speech cap.
 */
export function withMagicRun(edit, { cuts, notes = [], run }, parts, lengths = {}, id) {
  const order = parts.map((p) => p.id);
  const speech = parts.reduce((sum, p) => sum + (p.seconds || 0), 0);
  const told = cuts.map((c) => ({ ...c, reason: keptReason(c, run?.lines ?? []) }));
  const next = { ...edit, cuts: withMagic(edit.cuts, told, lengths) };
  return withMagicNotes(next, notes, { order, speech, ...(id && { id }) });
}

const KEPT_MAX = 70;
const shorten = (text) => (text.length <= KEPT_MAX ? text : `${text.slice(0, KEPT_MAX - 1).trimEnd()}…`);

/** Pure: a dropped take's reason, naming the take Magic kept instead: "Earlier take · kept “so today we…”". */
export function keptReason(cut, lines) {
  const kept = cut.instead != null && lines.find((l) => l.id === cut.instead);
  return kept ? `${cut.reason} · kept “${shorten(kept.text)}”` : cut.reason;
}

/** Pure: how many of Magic's notes are open, for the done line. */
export const magicNotesOpen = (edit) => openNotes(notesOf(edit)).filter((n) => n.by === 'magic').length;

/** Pure: the done line, plus "· R to review" when there are cuts to review and "· 2 notes to check · ⌥→" when
 *  Magic left notes (both before "· ⌘Z to undo"). */
export function doneLine(summary, notes, review = false) {
  const check = notes ? ` · ${notes} note${notes === 1 ? '' : 's'} to check · ⌥→` : '';
  const add = `${review ? ' · R to review' : ''}${check}`;
  return add ? summary.replace(/( · ⌘Z to undo)?$/, `${add}$1`) : summary;
}

/** Pure: how the button looks in a state. Tested in test/ui.test.mjs. */
export function magicView(state) {
  switch (state.kind) {
    case 'off': return { visible: false };
    case 'queued': return { visible: true, pill: true, label: 'Magic Cut queued', cancel: 'Cancel Magic Cut' };
    // What it's doing is said once, in the status line beside it (workText's magicStage); the pill only offers to stop.
    case 'running': return { visible: true, pill: true, label: 'Magic Cut', cancel: 'Cancel Magic Cut' };
    default: return { visible: true, pill: false, label: '✦ Magic Cut' };
  }
}

const PRIVACY_KEY = 'supercut.magic.privacyShown';
const PRIVACY = 'Only the text of your transcript is sent to Claude. Your video stays here.';
export const NOT_CONNECTED = "Magic Cut isn't connected yet. Soon it will pick your best takes; for now, cut words in the transcript.";

/**
 * The controller. Every dependency is passed in so it runs (and is tested) without a window.
 * @param {{
 *   runner: null | { run: (job: {parts: Array<{id:number,name:string,seconds:number,words:Array}>, onStage: (s:string)=>void}) => Promise<{summary:string, cuts:Array<{part:number,s:number,e:number}>, notes?:Array<{part:number,s:number,e:number,text:string}>}>, cancel: () => void },
 *   claude: () => Promise<{state:string, message:string}>,
 *   project: () => {parts: Array, transcribing: boolean},
 *   paint: (state) => void,
 *   flash: (text:string, ms:number) => void,
 *   banner: (text:string, action?: {label:string, run:()=>void}) => void,
 *   onResult: (result: {cuts:Array, notes?:Array}) => number | void,  // returns how many of Magic's notes are open
 *   transcribe?: () => void,  // ask for every part's words (transcripts.js); `project().transcribing` then says so
 *   store?: {getItem:(k:string)=>string|null, setItem:(k:string,v:string)=>void},
 * }} deps
 */
export function createMagic(deps) {
  const store = deps.store ?? globalThis.localStorage;
  let state = { kind: 'off' };
  const set = (s) => { state = s; deps.paint(state); };

  async function run() {
    const parts = deps.project().parts.filter((p) => p.transcript);
    if (!parts.length) return deps.banner('Magic Cut needs a transcript. Wait for it to finish, then try again.');
    if (!store.getItem(PRIVACY_KEY)) {
      store.setItem(PRIVACY_KEY, '1');
      deps.flash(PRIVACY, 8000);
    }
    set({ kind: 'running', stage: 'Reading your transcript' });
    try {
      const result = await deps.runner.run({
        parts: parts.map((p) => ({ id: p.id, name: p.name, seconds: p.transcript.seconds, words: p.transcript.words })),
        onStage: (stage) => state.kind === 'running' && set({ kind: 'running', stage }),
      });
      if (state.kind !== 'running') return; // cancelled meanwhile: drop the result
      const notes = deps.onResult(result) || 0;
      set({ kind: 'ready' });
      deps.flash(doneLine(result.summary, notes, !!deps.reviewable?.()), 6000);
    } catch (e) {
      if (state.kind !== 'running') return; // the cancel was the "error"
      set({ kind: 'ready' });
      deps.banner(String(e?.message ?? e), { label: 'Try again', run: press });
    }
  }

  async function press() {
    if (state.kind === 'off') return;
    if (state.kind === 'queued' || state.kind === 'running') return cancel();
    if (!deps.runner) return deps.banner(NOT_CONNECTED);
    const claude = await deps.claude();
    if (claude.state !== 'ready') return deps.banner(...claudeBanner(claude));
    deps.transcribe?.(); // transcripts start only on demand: Magic is a demand, and waits for them
    if (deps.project().transcribing) return set({ kind: 'queued' });
    return run();
  }

  function cancel() {
    if (state.kind === 'running') deps.runner.cancel();
    if (state.kind === 'queued' || state.kind === 'running') set({ kind: 'ready' });
  }

  return {
    press,
    cancel,
    get state() { return state; },
    /** Call whenever parts or transcripts change. */
    update() {
      const { parts, transcribing } = deps.project();
      const usable = parts.length > 0;
      if (!usable) return state.kind !== 'off' && (cancel(), set({ kind: 'off' }));
      if (state.kind === 'off') return set({ kind: 'ready' });
      if (state.kind === 'queued' && !transcribing) {
        if (parts.some((p) => p.transcript)) return run();
        set({ kind: 'ready' }); // every transcript failed: nothing to send
      }
    },
  };
}

/** Pure: the banner for a Claude that isn't ready. One sentence, one action. */
export function claudeBanner(status) {
  if (status.state === 'missing') return ['Magic Cut needs Claude Code. Install it and sign in, then try again.'];
  return [
    'Sign in to Claude to use Magic Cut: open Terminal and run `claude`.',
    { label: 'Copy command', run: () => navigator.clipboard?.writeText('claude') },
  ];
}
