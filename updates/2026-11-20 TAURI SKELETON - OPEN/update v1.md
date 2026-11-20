# Tauri skeleton — v1

Goal: replace the Electron spike with the user's lighter stack (Tauri 2 + Tailwind, unsigned), pick a Parakeet runtime that needs no Python, and prove it with a real build and test run. Uncle Bob builds the app on top of this.

## Phases
1. **Does Tauri build here?** `npx tauri info` → Rust 1.97.1, cargo, Xcode 27.2 all present. The CLI and npm scripts run cargo for us. **Done.**
2. **Pick the Parakeet runtime.** parakeet-rs 0.4.4 (ONNX Runtime, statically linked) with the int8 v3 model. No Python. **Done** (reasons in the tech stack wiki, section 3).
3. **Smallest app:** `src/` (HTML + Tailwind v4 tokens, drop a file → transcript, Claude status line), `src-tauri/` (audio, transcribe, words, claude, keep_awake). ffmpeg bundled as a sidecar. Electron, sherpa-onnx-node and the JS engine are deleted. **Done.**
4. **Prove it:** `npm test` 12/12 (including live Parakeet on an .mp4 and 3.9 min across 3 chunks), `npm run build` (ad-hoc signed .app, 79 MB), `npm run smoke` (the built app transcribes on its own, codesign verify ok), `npm run dev` starts the window. **Done.** Output: `test-run.log`.

## Decisions
- Stack v2: Tauri 2 + Tailwind v4, no bundler (`withGlobalTauri`).
- Parakeet: parakeet-rs in-process, not parakeet-mlx in a subprocess. It's 15–25× real time vs Pensieve's ~17×, and there's no Python to install.
- Audio: bundled ffmpeg → raw f32le on stdout. No temp WAV.
- One model folder for dev, tests and the app: `~/Library/Application Support/xyz.supercut.editor/models/parakeet-tdt-0.6b-v3-int8/`.
- Bundle id `xyz.supercut.editor` (Tauri warns against `.app` at the end).
- Unit tests live next to the code (`#[cfg(test)]`). Live tests skip if the model is missing.

## Next (for Uncle Bob)
- First-run model download inside the app, with progress (see issues.txt).
- Phase 1 of the roadmap on this skeleton: `design/main-screen.md`.
