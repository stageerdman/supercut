// Your rules: the user's own editing rules, one plain sentence per line. Magic Cut follows them on top of its own.
// A panel under the toolbar's gear (⌘,). One text box: typing adds, edits and deletes. Saved as you type and on close.
// Storage is Rust's (src-tauri/src/rules.rs): get_rules → string[]; save_rules { rules } → the cleaned string[]. Spec: design/rules.md.

/** Pure: the box's text → the rules Magic Cut will use. Cleans like Rust's rules::clean: trimmed, no blanks, no repeats. */
export const parseRules = (text) => [...new Set(text.split('\n').map((l) => l.trim()).filter(Boolean))];
export const rulesText = (rules) => rules.join('\n');

/**
 * Load once, then save the latest text after a short pause (or at once on flush). No window needed: tested with a fake invoke.
 * A failed save keeps the text; the next edit or flush tries again.
 */
export function createRulesStore(invoke, { wait = 400, timer = setTimeout, clear = clearTimeout } = {}) {
  let saved = null; // text of the rules on disk, as last seen
  let latest = null; // text in the box, once edited
  let pause = null;
  let chain = Promise.resolve();

  function flush() {
    clear(pause);
    pause = null;
    const rules = latest == null ? null : parseRules(latest);
    // Nothing new to save: wait for any save in flight, but never re-raise an old failure (the disk may work again).
    if (!rules || rulesText(rules) === saved) return (chain = chain.catch(() => {}));
    chain = chain.catch(() => {}).then(async () => { saved = rulesText(await invoke('save_rules', { rules })); });
    return chain;
  }

  return {
    get loaded() { return saved != null; },
    async load() {
      if (saved == null) saved = rulesText(await invoke('get_rules'));
      return latest ?? saved;
    },
    edit(text) {
      latest = text;
      clear(pause);
      pause = timer(() => flush().catch(() => {}), wait); // a timed save's error is reported by the next flush
    },
    flush,
  };
}

/** The DOM: gear toggles the panel; Esc, a click outside or ⌘, closes it. Closing saves. */
export function mountRules({ gear, panel, box }, store, { onError }) {
  const isOpen = () => !panel.classList.contains('hidden');

  /** Resolves true once saved; false (after saying why) if it couldn't be. */
  const save = () => store.flush().then(() => true, (e) => (onError(String(e?.message ?? e)), false));

  async function open() {
    panel.classList.remove('hidden');
    gear.setAttribute('aria-expanded', 'true');
    gear.classList.add('text-accent');
    box.readOnly = !store.loaded;
    box.focus();
    try {
      box.value = await store.load();
      box.readOnly = false;
      box.setSelectionRange(box.value.length, box.value.length);
    } catch (e) {
      onError(String(e?.message ?? e)); // stays read-only: never overwrite a file we couldn't read
    }
  }

  function close({ refocus = false } = {}) {
    if (!isOpen()) return save();
    panel.classList.add('hidden');
    gear.setAttribute('aria-expanded', 'false');
    gear.classList.remove('text-accent');
    if (refocus) gear.focus();
    return save();
  }

  const toggle = () => (isOpen() ? close({ refocus: true }) : open());

  gear.onclick = toggle;
  box.addEventListener('input', () => store.loaded && store.edit(box.value));
  document.addEventListener('keydown', (e) => {
    if (e.metaKey && e.key === ',') { e.preventDefault(); toggle(); }
    else if (e.key === 'Escape' && isOpen()) { e.preventDefault(); close({ refocus: true }); }
  });
  document.addEventListener('mousedown', (e) => {
    if (isOpen() && !panel.contains(e.target) && !gear.contains(e.target)) close();
  });

  return { close };
}
