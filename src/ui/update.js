// The "Update available" pill in the toolbar (design/update-prompt.md). Hidden unless there is a new version; one
// click downloads it in the background, the next saves and restarts. Never a dialog, never in the way.
// Talks to Rust's updater (update_check / update_install + update://progress / update_restart).
// Tested in test/update.test.mjs.

const KEY = 'update.installing'; // a download this app run started (survives the page reload on going Home)

/** Pure: what the pill shows for a state. null = hidden.
 * @param {{phase: 'none'|'available'|'downloading'|'ready'|'restarting', update?: {version:string, notes:string},
 *          downloaded?: number, total?: number|null}} s
 * @returns {null | {glyph: string, label: string, notes: string, pct: number|null, busy: boolean, title: string}} */
export function updateView(s) {
  const u = s.update;
  if (!u || s.phase === 'none') return null;
  const notes = (u.notes || '').trim().split('\n')[0];
  switch (s.phase) {
    case 'available':
      return { glyph: '↓', label: `Update to ${u.version}`, notes, pct: null, busy: false,
        title: notes ? `Magic Cut ${u.version}: ${u.notes.trim()}` : `Download Magic Cut ${u.version}` };
    case 'downloading': {
      const pct = s.total ? Math.min(1, (s.downloaded || 0) / s.total) : null;
      const amount = pct != null ? `${Math.round(pct * 100)} %` : s.downloaded ? `${Math.round(s.downloaded / 1e6)} MB` : '';
      return { glyph: '', label: `Updating…${amount ? ` ${amount}` : ''}`, notes: '', pct, busy: true,
        title: `Downloading Magic Cut ${u.version}. Keep working.` };
    }
    case 'ready':
      return { glyph: '↻', label: 'Restart to update', notes: '', pct: null, busy: false,
        title: `Saves your project and opens Magic Cut ${u.version}` };
    case 'restarting':
      return { glyph: '', label: 'Restarting…', notes: '', pct: null, busy: true, title: '' };
  }
  return null;
}

/**
 * The live pill.
 * @param {{button: HTMLElement, glyph: HTMLElement, label: HTMLElement, notes: HTMLElement, track: HTMLElement, bar: HTMLElement}} els
 * @param {{invoke: Function, listen: Function, storage?: Storage, beforeRestart?: () => Promise<any>,
 *          onError?: (message: string, retry: () => void) => void}} o
 */
export function createUpdatePill(els, { invoke, listen, storage, beforeRestart = async () => {}, onError = () => {} }) {
  let s = { phase: 'none', update: null, downloaded: 0, total: null };
  const set = (next) => { s = { ...s, ...next }; paint(); };

  function paint() {
    const v = updateView(s);
    els.button.classList.toggle('hidden', !v);
    els.button.classList.toggle('flex', !!v);
    if (!v) return;
    els.glyph.textContent = v.glyph;
    els.glyph.classList.toggle('hidden', !v.glyph);
    els.label.textContent = v.label;
    els.notes.textContent = v.notes;
    els.notes.classList.toggle('hidden', !v.notes);
    els.track.classList.toggle('hidden', v.pct == null);
    els.bar.style.width = `${(v.pct ?? 0) * 100}%`;
    els.track.setAttribute('aria-valuenow', String(Math.round((v.pct ?? 0) * 100)));
    els.button.title = v.title;
    els.button.setAttribute('aria-disabled', String(v.busy));
  }

  const remember = (on) => {
    try { on ? storage?.setItem(KEY, s.update.version) : storage?.removeItem(KEY); } catch {}
  };

  async function install() {
    if (s.phase !== 'available') return; // one download at a time (a second click while it runs does nothing)
    set({ phase: 'downloading', downloaded: 0, total: null });
    remember(true);
    try {
      await invoke('update_install');
      set({ phase: 'ready' });
    } catch (e) {
      remember(false);
      set({ phase: 'available' });
      onError(String(e), install);
    }
  }

  async function restart() {
    set({ phase: 'restarting' });
    remember(false);
    try {
      await beforeRestart();
      await invoke('update_restart');
    } catch (e) {
      set({ phase: 'ready' });
      onError(String(e), restart);
    }
  }

  els.button.onclick = () => {
    if (s.phase === 'available') install();
    else if (s.phase === 'ready') restart();
  };

  listen('update://progress', ({ payload }) => {
    if (s.phase !== 'downloading') return;
    set({ downloaded: payload?.downloaded ?? 0, total: payload?.total ?? null });
  });

  return {
    /** Ask Rust once; show the pill only if there is something new. A download started before a reload is joined. */
    async check() {
      const update = await invoke('update_check').catch(() => null);
      if (!update?.version) return remember(false), set({ phase: 'none', update: null });
      set({ phase: 'available', update });
      let started = null;
      try { started = storage?.getItem(KEY); } catch {}
      if (started === update.version) install();
    },
    get state() { return s; },
  };
}
