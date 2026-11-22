// The edit: the one state behind the timeline and the transcript. Plain data, so it saves as JSON with the project.
//   { cuts: [{ part, s, e, by, reason? }]  (see cuts.js),  words: { [partId]: [{ w, s, e, fixed? }] }  (see fix.js),
//     notes: [{ id, part, s, e, text, color, by, done, doneAt?, about? }],  dismissed: [{ part, s, e }]  (see notes.js) }
// Pure helpers that return a new edit. Tested in test/edit.test.mjs and test/notes.test.mjs.

export const emptyEdit = () => ({ cuts: [], words: {}, notes: [], dismissed: [] });

// An edit made before notes existed (an older saved project) has neither list: read it as empty.
export const notesOf = (edit) => edit.notes ?? [];
export const dismissedOf = (edit) => edit.dismissed ?? [];

/** A part's transcript arrived (or its words were fixed). */
export const withWords = (edit, part, words) => ({ ...edit, words: { ...edit.words, [part]: words } });

/** The parts as the views and Magic see them: each transcript with the edit's words (fixes included). */
export const partsWithWords = (parts, edit) =>
  parts.map((p) => (p.transcript ? { ...p, transcript: { ...p.transcript, words: edit.words[p.id] ?? [] } } : p));

const notMine = (part) => (x) => x.part !== part;

/** The edit with one part's cuts, words and notes gone (the history keeps them for undo). */
export function withoutPart(edit, part) {
  const { [part]: _gone, ...words } = edit.words;
  return {
    ...edit,
    cuts: edit.cuts.filter(notMine(part)),
    words,
    notes: notesOf(edit).filter(notMine(part)),
    dismissed: dismissedOf(edit).filter(notMine(part)),
  };
}

const renamed = (from, to) => (x) => (x.part === from ? { ...x, part: to } : x);

/** The part got a new id (it was re-added): swap it in its cuts, words and notes. */
export function renamePart(edit, from, to) {
  const has = [edit.cuts, notesOf(edit), dismissedOf(edit)].some((list) => list.some((x) => x.part === from));
  if (!(from in edit.words) && !has) return edit;
  const { [from]: mine, ...words } = edit.words;
  return {
    ...edit,
    cuts: edit.cuts.map(renamed(from, to)),
    words: mine ? { ...words, [to]: mine } : words,
    notes: notesOf(edit).map(renamed(from, to)),
    dismissed: dismissedOf(edit).map(renamed(from, to)),
  };
}
