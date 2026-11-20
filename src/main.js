// SuperCut's one screen. Talks to Rust via window.__TAURI__ (see src-tauri/src/main.rs).
// State lives in `parts`; each component below renders one region from it.
const { invoke, convertFileSrc } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { getCurrentWebview } = window.__TAURI__.webview;
const { open } = window.__TAURI__.dialog;

const $ = (id) => document.getElementById(id);
const VIDEO = ['mp4', 'mov', 'm4v'];
const MAX_PARTS = 2;

/** [{ id, name, path, duration, transcript, error }] in play order. */
let parts = [];
let current = 0; // index of the part in the player
let progress = null; // { part, stage, done, total } while working

// ---------- helpers ----------

const ext = (p) => (p.split('.').pop() || '').toLowerCase();
const clock = (s) => {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
};
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

// ---------- Banner: one pattern for every error ----------

function banner(text, action) {
  $('banner-text').textContent = text;
  const btn = $('banner-action');
  btn.classList.toggle('hidden', !action);
  if (action) {
    btn.textContent = action.label;
    btn.onclick = action.run;
  }
  $('banner').classList.replace('hidden', 'flex');
}
const hideBanner = () => $('banner').classList.replace('flex', 'hidden');
$('banner-close').onclick = hideBanner;

// ---------- DropZone + drag-over feedback ----------

function dragFeedback(paths) {
  const zone = $('dropzone');
  const valid = paths && paths.length && paths.every((p) => VIDEO.includes(ext(p)));
  zone.classList.toggle('border-solid', !!paths);
  zone.classList.toggle('border-accent', !!valid);
  zone.classList.toggle('bg-accent/8', !!valid);
  zone.classList.toggle('border-dashed', !paths);
  $('drop-headline').textContent = !paths ? 'Drop a video here' : valid ? 'Drop to open' : 'SuperCut opens video files';
  const slot = $('add-slot');
  if (slot) slot.classList.toggle('border-accent', !!valid);
}

getCurrentWebview().onDragDropEvent(({ payload }) => {
  if (payload.type === 'enter') dragFeedback(payload.paths);
  else if (payload.type === 'leave') dragFeedback(null);
  else if (payload.type === 'drop') {
    dragFeedback(null);
    addVideos(payload.paths);
  }
});

async function choose() {
  const picked = await open({ multiple: true, filters: [{ name: 'Video', extensions: VIDEO }] });
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
      if (parts.length === 1) show(0);
      render();
      queue = queue.then(() => transcribe(part.id));
    } catch (e) {
      banner(String(e));
    }
  }
}

async function removePart(id) {
  await invoke('remove_part', { id }).catch((e) => banner(String(e)));
  const i = parts.findIndex((p) => p.id === id);
  parts = parts.filter((p) => p.id !== id);
  if (!parts.length) $('player').removeAttribute('src');
  else if (i === current) show(0);
  else if (i < current) current--;
  render();
}

async function transcribe(id) {
  if (!parts.some((p) => p.id === id)) return; // removed while waiting
  try {
    const t = await invoke('transcribe_part', { id });
    const part = parts.find((p) => p.id === id);
    if (part) part.transcript = t;
    flash('Transcript ready');
  } catch (e) {
    const part = parts.find((p) => p.id === id);
    if (part) part.error = String(e);
    banner(String(e), { label: 'Try again', run: () => { hideBanner(); retry(id); } });
  }
  progress = null;
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
  renderStatus();
});

// ---------- Player + transport ----------

const player = $('player');

function show(i, at = 0, play = false) {
  current = i;
  const src = convertFileSrc(parts[i].path);
  if (player.dataset.path !== parts[i].path) {
    player.src = src;
    player.dataset.path = parts[i].path;
  }
  const go = () => {
    player.currentTime = at;
    if (play) player.play();
  };
  player.readyState >= 1 ? go() : player.addEventListener('loadedmetadata', go, { once: true });
  renderTimeline();
}

player.addEventListener('loadedmetadata', () => {
  const p = parts[current];
  if (p) p.duration = player.duration;
  renderTime();
  renderTimeline();
});
player.addEventListener('timeupdate', () => {
  renderTime();
  highlightWord();
});
player.addEventListener('play', () => ($('play').textContent = '❚❚'));
player.addEventListener('pause', () => ($('play').textContent = '▶'));
// Parts play back to back: part 1 runs into part 2.
player.addEventListener('ended', () => current + 1 < parts.length && show(current + 1, 0, true));
player.addEventListener('error', () => {
  if (parts[current]) banner(`${parts[current].name} can't be played here. Its transcript still works.`);
});

const toggle = () => (player.paused ? player.play() : player.pause());
$('play').onclick = toggle;

document.addEventListener('keydown', (e) => {
  if (e.metaKey && e.key === 'o') {
    e.preventDefault();
    if (parts.length < MAX_PARTS) choose();
    else banner('SuperCut works with two parts. Remove one to add another.');
  } else if (e.key === ' ' && parts.length && !e.target.closest('button')) {
    e.preventDefault();
    toggle();
  }
});

// ---------- Render ----------

function render() {
  const has = parts.length > 0;
  $('empty').classList.toggle('hidden', has);
  $('editor').classList.toggle('hidden', !has);
  $('editor').classList.toggle('flex', has);
  $('title').textContent = has ? parts[0].name.replace(/\.[^.]+$/, '') : '';
  renderTimeline();
  renderTranscript();
  renderStatus();
  renderTime();
}

function renderTime() {
  const before = parts.slice(0, current).reduce((s, p) => s + (p.duration || 0), 0);
  const total = parts.reduce((s, p) => s + (p.duration || 0), 0);
  $('time').textContent = `${clock(before + (player.currentTime || 0))} / ${clock(total)}`;
}

let flashTimer;
function flash(text) {
  clearTimeout(flashTimer);
  $('status').textContent = text;
  flashTimer = setTimeout(() => { flashTimer = null; renderStatus(); }, 3000);
}

function renderStatus() {
  let text = '', pct = 0;
  if (progress) {
    clearTimeout(flashTimer);
    flashTimer = null;
    pct = progress.total ? progress.done / progress.total : 0;
    const label = parts.length > 1 ? ` part ${parts.findIndex((p) => p.id === progress.part) + 1}` : '';
    text = progress.stage === 'download'
      ? `Downloading speech model · ${Math.round(progress.total / 1e6)} MB · ${Math.round(pct * 100)} %`
      : `Transcribing${label}… ${Math.round(pct * 100)} %`;
  } else if (parts.some((p) => !p.transcript && !p.error)) {
    text = 'Transcribing…';
  } else if (flashTimer) {
    $('progress-bar').style.width = '0';
    return; // keep the "Transcript ready" flash
  }
  $('status').textContent = text;
  $('progress-bar').style.width = progress ? `${pct * 100}%` : '0';
}

function renderTimeline() {
  const tl = $('timeline');
  tl.replaceChildren();
  parts.forEach((p, i) => {
    const tile = el('div', `group relative flex min-w-0 flex-1 cursor-pointer flex-col justify-end rounded-lg border bg-raised p-2 ${i === current ? 'border-accent' : 'border-hairline'}`);
    tile.setAttribute('role', 'button');
    tile.tabIndex = 0;
    tile.setAttribute('aria-label', `Part ${i + 1}, ${p.name}${p.duration ? `, ${clock(p.duration)}` : ''}`);
    tile.title = p.name;
    tile.onclick = () => show(i);
    tile.onkeydown = (e) => e.key === 'Enter' && show(i);
    tile.append(el('span', 'absolute top-2 left-2 rounded bg-surface px-1.5 text-[11px]', String(i + 1)));
    const x = el('button', 'absolute top-1 right-1 hidden rounded px-1.5 text-text-secondary group-hover:block hover:bg-surface hover:text-text', '✕');
    x.setAttribute('aria-label', `Remove part ${i + 1} from project`);
    x.onclick = (e) => { e.stopPropagation(); removePart(p.id); };
    tile.append(x);
    tile.append(el('span', 'truncate text-text-secondary', `${p.name}${p.duration ? ` · ${clock(p.duration)}` : ''}`));
    tl.append(tile);
  });
  if (parts.length && parts.length < MAX_PARTS) {
    const slot = el('button', 'w-[120px] shrink-0 rounded-lg border-[1.5px] border-dashed border-hairline text-text-secondary hover:text-text', `+ Add part ${parts.length + 1}`);
    slot.id = 'add-slot';
    slot.dataset.choose = '';
    tl.append(slot);
  }
}

// Transcript: every word is a button-like span that seeks the player to its start.
function renderTranscript() {
  const done = parts.filter((p) => p.transcript);
  $('transcript-panel').classList.toggle('hidden', !done.length); // no empty panels, ever
  $('transcript-panel').classList.toggle('flex', !!done.length);
  const box = $('transcript');
  box.replaceChildren();
  parts.forEach((p, i) => {
    if (!p.transcript) return;
    if (parts.length > 1) box.append(el('h3', 'mt-3 mb-1 text-[11px] text-text-secondary', `Part ${i + 1}`));
    const para = el('p');
    if (!p.transcript.words.length) para.append(el('span', 'text-text-secondary', 'No speech found.'));
    for (const w of p.transcript.words) {
      const span = el('span', 'cursor-pointer rounded hover:bg-raised', w.w);
      span.dataset.part = i;
      span.dataset.s = w.s;
      span.dataset.e = w.e;
      span.title = `${clock(w.s)} (${w.s.toFixed(2)}–${w.e.toFixed(2)} s)`;
      span.onclick = () => show(i, w.s, true);
      para.append(span, ' ');
    }
    box.append(para);
  });
}

let lit;
function highlightWord() {
  const t = player.currentTime;
  const spans = $('transcript').querySelectorAll(`span[data-part="${current}"]`);
  let hit = null;
  for (const s of spans) if (+s.dataset.s <= t && t < +s.dataset.e + 0.05) { hit = s; break; }
  if (hit === lit) return;
  lit?.classList.remove('text-accent');
  hit?.classList.add('text-accent');
  lit = hit;
}

// ---------- Claude check: show the sign-in banner early, while there's time to fix it ----------

invoke('claude_status').then((s) => {
  if (s.state !== 'ready') banner(`Magic needs Claude Code. ${s.message}`);
});

render();
