// The web view's lines in the app's log (Rust's `ui_log`): every uncaught error and rejection, and what main.js
// reports (window.uiLog). A classic script loaded before main.js, so even a module that fails to load is logged:
// `magic-cut ERROR ui window main.js:12 TypeError: …`.
(() => {
  const send = (error, msg) => window.__TAURI__?.core.invoke('ui_log', { error, msg: String(msg) }).catch(() => {});
  window.uiLog = (msg) => send(false, msg);
  window.addEventListener('error', (e) => {
    const tag = e.target?.tagName;
    if (tag) return (tag === 'SCRIPT' || tag === 'LINK') && send(true, `couldn't load ${e.target.src || e.target.href}`); // pictures and video have their own fallbacks
    const at = e.filename ? `${e.filename.split('/').pop()}:${e.lineno} ` : '';
    send(true, `${at}${e.error?.stack || e.message || 'a file failed to load'}`);
  }, true); // capture: a <script> or <link> that fails to load fires here too
  window.addEventListener('unhandledrejection', (e) => send(true, `unhandled: ${e.reason?.stack || e.reason}`));
})();
