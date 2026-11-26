// Claude setup, from Magic (design/claude-setup.md): one banner, one button that opens Terminal on Rust's setup
// script (claude_setup), and a quiet wait that notices sign-in by itself (every 3 s and when the window comes back).
//
// Phases: first (the offer) · opened (Terminal is running the script) · installed (was missing, now signed out).

/** Pure: the banner for a Claude that isn't ready, in a phase. `magic`: Magic was pressed and starts by itself. */
export function setupBanner(status, phase = 'first', { magic = true } = {}) {
  const missing = status?.state === 'missing';
  if (phase === 'first') {
    return missing
      ? { text: "Magic Cut uses Claude to pick your best takes. It isn't on this Mac yet.", label: 'Install Claude' }
      : { text: 'Sign in to Claude to use Magic Cut.', label: 'Sign in' };
  }
  if (phase === 'installed') return { text: 'Claude is installed. Sign in in your browser.', label: 'Open again' };
  if (missing) return { text: 'Installing Claude in Terminal…', label: 'Open again' };
  return { text: magic ? "Sign in in your browser. Magic starts when you're done." : 'Sign in in your browser.', label: 'Open again' };
}

export const POLL_MS = 3000;
export const GIVE_UP_MS = 15 * 60 * 1000;

/**
 * The wait: asks `check()` every 3 s (and at once on `poke()`), until it says ready or 15 min pass.
 * onChange(status) when the state moves (missing → signed-out), onReady(), onGiveUp(). One check at a time.
 */
export function createClaudeWait({ check, onReady, onChange = () => {}, onGiveUp = () => {}, now = Date.now, timer = setTimeout, clear = clearTimeout, every = POLL_MS, limit = GIVE_UP_MS }) {
  let started = null;
  let last = null;
  let pending = null;
  let busy = false;

  const schedule = () => { clear(pending); pending = timer(tick, every); };

  async function tick() {
    if (started == null || busy) return;
    if (now() - started >= limit) { stop(); return onGiveUp(); }
    busy = true;
    let status;
    try { status = await check(); } catch { status = null; }
    busy = false;
    if (started == null) return; // stopped meanwhile
    if (status?.state === 'ready') { stop(); return onReady(status); }
    if (status && status.state !== last) { last = status.state; onChange(status); }
    schedule();
  }

  function stop() { clear(pending); pending = null; started = null; }

  return {
    start(status) {
      last = status?.state ?? null;
      if (started == null) { started = now(); schedule(); }
    },
    stop,
    poke() { if (started != null) { clear(pending); tick(); } },
    get waiting() { return started != null; },
  };
}

/**
 * The banner + Terminal + wait, together. Deps: invoke, banner(text, action), hideBanner(), focusAction(),
 * onReady() (Claude ready and Magic was waiting), onGiveUp() (Magic was waiting and gave up).
 */
export function createClaudeSetup({ invoke, banner, hideBanner, focusAction = () => {}, onReady = () => {}, onGiveUp = () => {}, ...clock }) {
  let status = null; // the latest not-ready status
  let phase = 'first';
  let magic = false; // Magic is waiting for it

  const show = () => {
    const { text, label } = setupBanner(status, phase, { magic });
    banner(text, { label, run: open });
  };

  const wait = createClaudeWait({
    ...clock,
    check: () => invoke('claude_status'),
    onReady: () => {
      hideBanner();
      phase = 'first';
      if (magic) { magic = false; onReady(); }
    },
    onChange: (s) => {
      if (phase !== 'first' && status?.state === 'missing' && s.state === 'signed-out') phase = 'installed';
      status = s;
      if (phase !== 'first') show();
    },
    onGiveUp: () => (magic ? onGiveUp() : stop()),
  });

  async function open() {
    try {
      await invoke('claude_setup');
    } catch (e) {
      const { label } = setupBanner(status, 'first');
      return banner(String(e?.message ?? e), { label, run: open });
    }
    if (phase === 'first') phase = 'opened';
    show();
    wait.start(status);
  }

  /** Stop waiting; the banner goes back to its first state. Does nothing if not waiting. */
  function stop() {
    if (!wait.waiting && !magic) return;
    wait.stop();
    magic = false;
    phase = 'first';
    show();
  }

  return {
    /** Offer setup. `forMagic`: Magic was pressed: wait at once, focus the button, start Magic when ready. */
    offer(s, { forMagic = false } = {}) {
      if (wait.waiting && phase !== 'first') { // Terminal is already open (from the load-time banner): keep its words
        magic ||= forMagic;
        if (forMagic) { show(); focusAction(); }
        return;
      }
      status = s;
      phase = 'first';
      magic = forMagic;
      show();
      if (forMagic) { focusAction(); wait.start(s); }
    },
    open,
    stop,
    poke: () => wait.poke(),
    get waiting() { return wait.waiting; },
  };
}
