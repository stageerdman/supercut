// The edit: the one state behind the timeline and the transcript. Plain data, so it can be saved as JSON later.
//   { cuts: [{ part, s, e, by, reason? }]  (see cuts.js),  words: { [partId]: [{ w, s, e, fixed? }] }  (see fix.js) }
// Pure helpers that return a new edit. Tested in test/edit.test.mjs.

export const emptyEdit = () => ({ cuts: [], words: {} });

/** A part's transcript arrived (or its words were fixed). */
export const withWords = (edit, part, words) => ({ ...edit, words: { ...edit.words, [part]: words } });

/** The parts as the views and Magic see them: each transcript with the edit's words (fixes included). */
export const partsWithWords = (parts, edit) =>
  parts.map((p) => (p.transcript ? { ...p, transcript: { ...p.transcript, words: edit.words[p.id] ?? [] } } : p));

/** The edit with one part's cuts and words gone. */
export function withoutPart(edit, part) {
  const { [part]: _gone, ...words } = edit.words;
  return { cuts: edit.cuts.filter((c) => c.part !== part), words };
}

/** The part got a new id (it was re-added): swap it in its cuts and words. */
export function renamePart(edit, from, to) {
  if (!(from in edit.words) && !edit.cuts.some((c) => c.part === from)) return edit;
  const { [from]: mine, ...words } = edit.words;
  return {
    cuts: edit.cuts.map((c) => (c.part === from ? { ...c, part: to } : c)),
    words: mine ? { ...words, [to]: mine } : words,
  };
}
