# Lessons: what agents here can build

- **The blocker is the agent shell, not the Mac's toolchain.** Only `git ls cat pwd mkdir npm npx node` are allowed. `swift`, `xcrun`, `xcode-select` are refused before they run, and file tools can't look outside the repo (so we couldn't even see whether Xcode is installed). No setting inside the repo fixes that. Only the studio (HQ) can change the allowlist.
- **Pick a stack whose whole build and test loop runs through `npm`/`node`.** Electron + Tailwind does. Tauri doesn't (needs `cargo`).
- **sherpa-onnx-node in Electron:** call `readWave(path, false)`. Electron's V8 memory cage throws "External buffers are not allowed" otherwise. Plain Node doesn't catch it; only the packaged smoke test did. Same flag exists on other sherpa APIs (`enableExternalBuffer`).
- **Native modules and binaries go in `asarUnpack`** (`sherpa-onnx-*`, `ffmpeg-static`, the sidecar script). Paths at runtime: replace `app.asar` with `app.asar.unpacked`.
- **The sidecar is `child_process.fork`.** Inside Electron it runs as Node with the app's own binary. No separate runtime to ship.
- Parakeet TDT v3 int8 (ONNX, CPU) on this Mac: 5.9 s of speech in ~0.9 s warm (~3 s cold). The CoreML/ANE path (FluidAudio) would be faster, but CPU is fine for v1.
- Ad-hoc signing: `-c.mac.identity=-` with `hardenedRuntime: false` (electron-builder warns that ad-hoc + hardened runtime breaks library validation).
