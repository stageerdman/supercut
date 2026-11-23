// Right-click: a short native menu for what's under the pointer. Each item runs the same code as its shortcut; the
// only new things it adds are Remove Text and, for notes, Add Note Here and Show Done Notes.
// Specs: design/missed-words.md ("Editing existing words"), design/notes.md.
// `menuFor` and `noteMenu` are pure (tested in test/write.test.mjs, test/note-card.test.mjs); `popup` shows them.

/**
 * The items for the selection. `words`: it highlights words; `restore`: ⌫ would restore it (all of it is cut).
 * `notes`: add Add Note (on the selection) or Add Note Here (no selection); `lane`: the click was in the notes lane,
 * so Show / Hide Done Notes too (`showDone`: they show now).
 * @param {{cut?:boolean, unheard?:boolean}|null} sel
 * @returns {Array<{id:string, text:string, accelerator?:string} | {separator:true}>}
 */
export function menuFor(sel, { words = false, restore = false, notes = false, lane = false, showDone = false } = {}) {
  const base = editItems(sel, { words, restore });
  if (!notes) return base;
  const add = { id: 'addNote', text: sel ? 'Add Note' : 'Add Note Here', accelerator: 'M' };
  const toggle = lane ? [{ id: 'showDone', text: showDone ? 'Hide Done Notes' : 'Show Done Notes' }] : [];
  return [...base, ...(base.length ? [{ separator: true }] : []), add, ...toggle];
}

/** A note's own menu (right-click on it in the lane): the card's actions, for the mouse. */
export const noteMenu = (note) => (note.done
  ? [{ id: 'reopen', text: 'Reopen' }, { id: 'deleteNote', text: 'Delete Note' }]
  : [{ id: 'done', text: 'Done', accelerator: 'CmdOrCtrl+Enter' }, { id: 'deleteNote', text: 'Delete Note' }]);

function editItems(sel, { words, restore }) {
  if (!sel) return [];
  const toggle = { id: 'toggle', text: restore ? 'Restore' : 'Cut', accelerator: 'Backspace' };
  if (sel.cut) return [{ ...toggle, text: 'Restore' }];
  if (sel.unheard) return [{ id: 'write', text: 'Write What’s Said…', accelerator: 'Enter' }, toggle];
  if (words) return [{ id: 'write', text: 'Fix Text', accelerator: 'Enter' }, toggle, { separator: true }, { id: 'removeText', text: 'Remove Text' }];
  return [{ id: 'write', text: 'Write Words Here…', accelerator: 'Enter' }, toggle];
}

/**
 * Show the items as a native menu at the pointer (or, with no point, where the system puts it).
 * @param {object} handlers  { write, toggle, removeText, addNote, showDone, done, reopen, deleteNote }: what each item runs
 * @param {{x:number,y:number}|null} at  in the window's CSS pixels
 */
export async function popup(items, handlers, at, tauri = globalThis.window?.__TAURI__) {
  const api = tauri?.menu;
  if (!api || !items.length) return;
  const menu = await api.Menu.new({
    items: items.map((i) => (i.separator
      ? { item: 'Separator' }
      : { id: i.id, text: i.text, accelerator: i.accelerator, action: () => handlers[i.id]?.() })),
  });
  const pos = at && tauri.dpi?.LogicalPosition ? new tauri.dpi.LogicalPosition(at.x, at.y) : undefined;
  await menu.popup(pos);
}
