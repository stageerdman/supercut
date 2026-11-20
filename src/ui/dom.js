// Tiny DOM + format helpers shared by every component. No Tauri here.

export const $ = (id) => document.getElementById(id);

export function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

/** 75 → "01:15", 3725 → "1:02:05". */
export function clock(s) {
  s = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(2, '0'), ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Seconds left → "about 3 min" / "less than a minute"; '' when unknown. */
export function eta(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return 'less than a minute';
  return `about ${Math.round(seconds / 60)} min`;
}

export const ext = (p) => (p.split('.').pop() || '').toLowerCase();
