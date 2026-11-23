// Notes in the app: M / ⚑ adds, the card changes, ⌥→ / ⌥← and the chip go to the next open note, Done and Delete.
// The one place that turns note gestures into undo steps and status lines. No Tauri, so it runs in tests.
// Spec: design/notes.md. Tested in test/note-card.test.mjs.
import { addNote, editNote, setDone, deleteNote, nextOpen, preRoll, openNotes } from './notes.js';
import { notesOf } from './edit.js';

const SEEN = 'magiccut.notes.seen'; // the first note ever gets the longer line, once
const SHOW_DONE = 'magiccut.notes.showDone';

/** "3 notes" / "1 note" for the chip; '' at none (the chip hides). */
export const chipText = (n) => (n ? `${n} note${n === 1 ? '' : 's'}` : '');

/**
 * @param {{history: object, commit: (edit:object, label:string)=>void, timeline: object, card: object, player: object,
 *   status: {flash:(t:string, ms?:number)=>void}, parts: ()=>Array<{id:string}>, cuts: ()=>Array, lengths: ()=>object,
 *   seek: (i:number, t:number)=>void, chip?: HTMLElement, storage?: Storage}} o
 *   seek: the playhead goes there, play/pause kept, the views follow
 */
export function createNoteControl(o) {
  const store = o.storage ?? globalThis.localStorage;
  const get = (k) => { try { return store?.getItem(k); } catch { return null; } };
  const set = (k, v) => { try { store?.setItem(k, v); } catch { /* private mode: fine */ } };
  let showDone = get(SHOW_DONE) === '1';

  const notes = () => notesOf(o.history.edit);
  const byId = (id) => notes().find((n) => n.id === id);
  const order = () => o.parts().map((p) => p.id);
  const openCount = () => openNotes(notes()).filter((n) => order().includes(n.part)).length;

  function paint() {
    o.timeline.paintNotes?.();
    if (!o.chip) return;
    const text = chipText(openCount());
    o.chip.textContent = text;
    o.chip.classList.toggle('hidden', !text);
  }

  function change(r) {
    if (r.label) o.commit(r.edit, r.label);
    paint();
  }

  /** Show the note: ring, in view, card. `seek`: the playhead goes to its pre-roll (play/pause kept). */
  function open(id, { focus = false, seek = true } = {}) {
    const note = byId(id);
    const i = order().indexOf(note?.part);
    if (!note || i < 0) return;
    if (seek) o.seek(i, preRoll(note, o.cuts(), o.lengths()[note.part]));
    o.timeline.reveal?.(i, note.s);
    o.timeline.setNote?.(id);
    o.card.open(note, { x: o.timeline.noteX?.(id) ?? null, focus });
  }

  /** M, ⚑, Add Note Here (`at` = { part, t } for a spot other than the playhead). */
  function add(at = null) {
    const parts = o.parts();
    if (!parts.length) return;
    const sel = at ? null : o.timeline.selection;
    const here = at ?? { part: parts[o.player.current]?.id ?? parts[0].id, t: o.player.time };
    const r = addNote(o.history.edit, sel, here);
    const playing = o.player.playing;
    if (!r.label) { // a twin: that note again
      if (playing) o.timeline.pop?.(r.note.id);
      else open(r.note.id, { focus: true, seek: false });
      return r.note;
    }
    o.commit(r.edit, r.label);
    if (sel) o.timeline.clearSelection?.();
    paint();
    const first = !get(SEEN);
    set(SEEN, '1');
    if (first) o.status.flash('Note added. Notes are only for you, never in your video.', 6000);
    else if (playing) o.status.flash('Note added · ⌘Z undoes', 2000);
    if (playing) o.timeline.pop?.(r.note.id);
    else open(r.note.id, { focus: true, seek: false });
    return r.note;
  }

  /** ⌥→ (1) / ⌥← (-1), the chip: the next open note, card unfocused so Space and the arrows still work. */
  function go(dir = 1) {
    const cur = byId(o.card.id ?? o.timeline.currentNote);
    const parts = o.parts();
    const at = { part: parts[o.player.current]?.id, t: o.player.time };
    // From the current note while the playhead hasn't passed it; else from the playhead.
    const from = cur && !cur.done && cur.part === at.part && at.t <= cur.e + 1 ? { id: cur.id } : at;
    const next = nextOpen(notes(), order(), from, dir);
    if (!next) return o.status.flash('No open notes', 2000);
    open(next.id, { focus: false });
  }

  function done(id) {
    if (o.card.id === id) o.card.close();
    change(setDone(o.history.edit, id, true));
    const left = openCount();
    o.status.flash(left ? `Done · ${chipText(left)} left · ⌘Z undoes` : 'All notes done', 3000);
  }

  function reopen(id) { change(setDone(o.history.edit, id, false)); }

  function remove(id) {
    if (o.card.id === id) o.card.close({ save: false });
    if (!byId(id)) return;
    change(deleteNote(o.history.edit, id));
    o.status.flash('Note deleted · ⌘Z undoes', 3000);
  }

  const save = (id, text) => byId(id) && change(editNote(o.history.edit, id, { text }));
  const color = (id, c) => byId(id) && change(editNote(o.history.edit, id, { color: c }));

  function toggleShowDone() {
    showDone = !showDone;
    set(SHOW_DONE, showDone ? '1' : '0');
    o.timeline.render?.();
    paint();
  }

  /** ⌘Z / ⇧⌘Z moved the notes: the open card shows the note as it is now, or closes if it's gone or done. */
  function afterUndo() {
    const id = o.card.id;
    if (id) {
      const n = byId(id);
      if (n && (!n.done || showDone)) o.card.sync(n);
      else o.card.close({ save: false });
    }
    paint();
  }

  return {
    add, open, go, done, reopen, remove, save, color, toggleShowDone, afterUndo, paint,
    get showDone() { return showDone; },
    get cardOpen() { return o.card.isOpen; },
  };
}
