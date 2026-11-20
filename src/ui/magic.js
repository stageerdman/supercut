// Magic: the AI spot. The toolbar's primary button + the AI's status and results.
// Contract for the Claude Code connection: design/ai-slot.md. Magic shows as soon as a video is loaded.
// Until a runner is connected it's a placeholder: pressing it says Magic isn't connected yet.
//
// States: off · ready · queued · running(stage) · (done → ready, summary in the status line)
// A failed run changes nothing in the project: cuts are only handed on after success.

/** Pure: how the button looks in a state. Tested in test/ui.test.mjs. */
export function magicView(state) {
  switch (state.kind) {
    case 'off': return { visible: false };
    case 'queued': return { visible: true, pill: true, label: 'Magic queued', cancel: 'Cancel Magic' };
    case 'running': return { visible: true, pill: true, label: `${state.stage || 'Working'}…`, cancel: 'Cancel Magic' };
    default: return { visible: true, pill: false, label: '✦ Magic' };
  }
}

const PRIVACY_KEY = 'supercut.magic.privacyShown';
const PRIVACY = 'Only the text of your transcript is sent to Claude. Your video stays here.';
export const NOT_CONNECTED = "Magic isn't connected yet. Soon it will pick your best takes; for now, cut words in the transcript.";

/**
 * The controller. Every dependency is passed in so it runs (and is tested) without a window.
 * @param {{
 *   runner: null | { run: (job: {parts: Array<{id:number,name:string,seconds:number,words:Array}>, onStage: (s:string)=>void}) => Promise<{summary:string, cuts:Array<{part:number,s:number,e:number}>}>, cancel: () => void },
 *   claude: () => Promise<{state:string, message:string}>,
 *   project: () => {parts: Array, transcribing: boolean},
 *   paint: (state) => void,
 *   flash: (text:string, ms:number) => void,
 *   banner: (text:string, action?: {label:string, run:()=>void}) => void,
 *   onResult: (cuts:Array) => void,
 *   store?: {getItem:(k:string)=>string|null, setItem:(k:string,v:string)=>void},
 * }} deps
 */
export function createMagic(deps) {
  const store = deps.store ?? globalThis.localStorage;
  let state = { kind: 'off' };
  const set = (s) => { state = s; deps.paint(state); };

  async function run() {
    const parts = deps.project().parts.filter((p) => p.transcript);
    if (!parts.length) return deps.banner('Magic needs a transcript. Wait for it to finish, then try again.');
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
      deps.onResult(result.cuts);
      set({ kind: 'ready' });
      deps.flash(result.summary, 6000); // "· ⌘Z to undo" joins once undo exists
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
  if (status.state === 'missing') return ['Magic needs Claude Code. Install it and sign in, then try again.'];
  return [
    'Sign in to Claude to use Magic: open Terminal and run `claude`.',
    { label: 'Copy command', run: () => navigator.clipboard?.writeText('claude') },
  ];
}
