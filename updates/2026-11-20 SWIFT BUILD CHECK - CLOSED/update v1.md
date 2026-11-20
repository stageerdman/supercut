# Swift build check → stack verdict (v1)

Goal: find out if our agents can build and test Swift on this Mac; if not, prove a stack they can.

## Phases
1. Run `xcode-select -p`, `swift --version`, `xcrun --show-sdk-path`, check Xcode vs CLT, `swift build`, `swift test`. **Done: all refused by the agent shell before running** (see wiki.md).
2. Smallest Electron + Tailwind stack: Parakeet sidecar (sherpa-onnx-node), ffmpeg (ffmpeg-static), `claude` CLI check. **Done.**
3. Prove it: `npm test` (9/9 green incl. live Parakeet), `npm run build` (ad-hoc signed `.app`), `npm run smoke` (packaged binary transcribes). **Done.**

## Decisions
- Verdict: switch to Electron + Tailwind. Tauri rejected: needs `cargo`, which agents can't run directly either.
- Ships ad-hoc signed (`identity=-`, hardened runtime off), no notarization.
- Parakeet model is not bundled: `npm run fetch-model` (670 MB) into `models/` (gitignored). The packaged app looks in `userData/models/`; a first-run download is still to be built.

## Next
- Uncle Bob ports the shell (`Sources/SuperCutCore` logic → `src/core`), reusing these modules.
- First-run model download with progress in the app.
- Nobody has opened the GUI window yet (`npm start`); only the bundle's runtime was smoke-tested.
