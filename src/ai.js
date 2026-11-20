// The Claude Code connection plugs in here — the only file it needs to touch on the UI side.
// Contract: design/ai-slot.md. While `runner` is null the Magic button stays hidden.
//
// export const runner = {
//   run: ({ parts, onStage }) => invoke('run_magic', { parts }) ...,  // → { summary, cuts: [{ part, s, e }] }
//   cancel: () => invoke('cancel_magic'),
// };
export const runner = null;
