// Skeleton UI: Claude check + drop a file -> transcript. Talks to Rust via window.__TAURI__.
const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { getCurrentWebview } = window.__TAURI__.webview;

const $ = (id) => document.getElementById(id);

invoke('claude_status').then((s) => ($('claude').textContent = s.message));

listen('transcribe-progress', ({ payload: [done, total] }) => {
  $('status').textContent = `Transcribing… ${Math.round((100 * done) / total)} %`;
});

getCurrentWebview().onDragDropEvent(async ({ payload }) => {
  if (payload.type !== 'drop' || !payload.paths.length) return;
  const file = payload.paths[0];
  $('status').textContent = 'Reading the sound…';
  try {
    const t = await invoke('transcribe', { path: file });
    $('status').textContent = `${t.words.length} words, ${Math.round(t.seconds)} s`;
    $('transcript').textContent = t.text;
    $('transcript').classList.remove('hidden');
  } catch (e) {
    $('status').textContent = String(e);
  }
});
