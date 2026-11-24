// The saved project's `ui` blob (design/project-store.md): what the editor needs to come back as you left it.
// Rust keeps it as opaque JSON; the parts (paths, swaps) are Rust's. Pure, no DOM. Tested in test/project-doc.test.mjs.
//   { v: 1, edit, parts: { [id]: { transcript (minus words), heard, duration, matched? } }, trace }
// Undo history is not saved: a reopened project starts with an empty history.
import { emptyEdit } from './edit.js';
import { emptyTrace } from './trace.js';
import { keptSpans, editedLength } from './playback.js';

/** Each part's length where known (the player's or the transcript's). */
const withLength = (parts) => parts.map((p) => ({ ...p, duration: p.duration || p.transcript?.seconds || 0 }));

/** The blob for `save_project` from the editor's state. Words live in the edit only (fixes included). */
export function toDoc({ parts, edit, trace }) {
  const byId = Object.fromEntries(parts.map((p) => {
    const { words: _words, ...transcript } = p.transcript ?? {};
    const record = { transcript: p.transcript ? transcript : null, heard: p.heard ?? null, duration: p.duration || 0 };
    return [p.id, p.swap?.matched != null ? { ...record, matched: p.swap.matched } : record];
  }));
  return { v: 1, edit, parts: byId, trace };
}

/**
 * The editor's state from a saved blob and Rust's parts ([{ id, path, name, swap }]). A part with no saved record
 * (or `doc` null: a new project) starts with no words, as a freshly added video. An older edit without notes still
 * opens (edit.js reads missing lists as empty).
 */
export function fromDoc(doc, rustParts) {
  const edit = { ...emptyEdit(), ...doc?.edit };
  const parts = rustParts.map((p) => {
    const saved = doc?.parts?.[p.id];
    const transcript = saved?.transcript ? { ...saved.transcript, words: edit.words[p.id] ?? [] } : null;
    // A swap's `matched`: the offset lining up found, so the nudge shows only your change (audio-panel.js).
    const swap = p.swap && { ...p.swap, matched: saved?.matched ?? p.swap.offset };
    return { ...p, swap, duration: saved?.duration || 0, transcript, heard: saved?.heard ?? undefined, error: null };
  });
  return { parts, edit, trace: doc?.trace ?? emptyTrace() };
}

/** The edited length in seconds, for the card's chip. */
export const lengthOfEdit = (parts, cuts) => editedLength(withLength(parts), cuts);

/** Where the card's picture comes from: the first kept moment ({ part, t }), or null with nothing kept yet. */
export function coverOf(parts, cuts) {
  const first = keptSpans(withLength(parts), cuts)[0];
  if (!first) return parts.length ? { part: parts[0].id, t: 0 } : null;
  return { part: first.part, t: Math.round(Math.min(first.s + 0.5, (first.s + first.e) / 2) * 10) / 10 };
}
