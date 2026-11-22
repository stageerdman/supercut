// Right-click: a short native menu for what's under the pointer. Each item runs the same code as its shortcut; the
// only new thing it adds is Remove Text. Spec: design/missed-words.md ("Editing existing words").
// `menuFor` is pure (tested in test/write.test.mjs); `popup` shows it with Tauri's menu API.

/**
 * The items for the selection. `words`: it highlights words; `restore`: ⌫ would restore it (all of it is cut).
 * @param {{cut?:boolean, unheard?:boolean}|null} sel
 * @returns {Array<{id:'write'|'toggle'|'removeText', text:string, accelerator?:string} | {separator:true}>}
 */
export function menuFor(sel, { words = false, restore = false } = {}) {
  if (!sel) return [];
  const toggle = { id: 'toggle', text: restore ? 'Restore' : 'Cut', accelerator: 'Backspace' };
  if (sel.cut) return [{ ...toggle, text: 'Restore' }];
  if (sel.unheard) return [{ id: 'write', text: 'Write What’s Said…', accelerator: 'Enter' }, toggle];
  if (words) return [{ id: 'write', text: 'Fix Text', accelerator: 'Enter' }, toggle, { separator: true }, { id: 'removeText', text: 'Remove Text' }];
  return [{ id: 'write', text: 'Write Words Here…', accelerator: 'Enter' }, toggle];
}

/**
 * Show the items as a native menu at the pointer (or, with no point, where the system puts it).
 * @param {object} handlers  { write, toggle, removeText }: what each item runs
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
