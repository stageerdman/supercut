# Update v1: Tech stack research

Goal: decide the whole SuperCut stack, with Parakeet transcription and Claude Code CLI as the core questions.

## Phases
1. Parakeet runtime research: done. Recommendation: FluidAudio + Parakeet TDT v3 (CoreML), in-process Swift.
2. Claude Code CLI headless research: done. Recommendation: `claude -p --output-format stream-json --json-schema`, subscription login, no `--bare`, no API key.
3. Rest of the stack (framework, timeline, takes, sync, export, packaging): done. See `wiki.md`.

## Open
- Pensieve has not yet confirmed its Parakeet setup (mail sent 2026-11-20). Update `wiki.md` section 3 if their answer differs.
- Spikes listed in `wiki.md` section 10 belong to the build items, not this one.
