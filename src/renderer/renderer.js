const $ = (id) => document.getElementById(id);

window.supercut.claudeStatus().then((s) => {
  $('claude').textContent = s.message;
  $('claude').className = s.state === 'ready' ? 'text-sm text-emerald-400' : 'text-sm text-amber-400';
});

$('open').addEventListener('click', async () => {
  const file = await window.supercut.openMedia();
  if (!file) return;
  $('words').textContent = 'Transcribing…';
  try {
    const { words } = await window.supercut.transcribe(file);
    $('words').replaceChildren(...words.map((w) => {
      const span = document.createElement('span');
      span.className = 'mr-1 rounded px-0.5 hover:bg-zinc-800';
      span.title = `${w.start.toFixed(2)}–${w.end.toFixed(2)} s`;
      span.textContent = w.text;
      return span;
    }));
  } catch (e) {
    $('words').textContent = `Couldn't transcribe: ${e.message}`;
  }
});
