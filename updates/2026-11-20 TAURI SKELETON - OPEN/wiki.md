# Lessons: the Tauri skeleton

- **Agents can build Rust/Tauri.** `cargo` isn't on the shell allowlist, but `npx tauri …` and `npm run …` scripts call it. All the build and test commands are npm scripts for this reason.
- **ONNX Runtime allows one environment per process.** Create it once (`parakeet_rs::ort::init().build()`), load `ParakeetTDT` once, and keep it in a `static Mutex<Option<…>>`. A second load fails with "only one environment is allowed per process". This also saves ~2 s per file.
- **parakeet-rs needs the environment passed in:** `ExecutionConfig::new().with_environment(env)`. `None` fails with a config error.
- **parakeet-rs finds int8 files on its own** (`encoder-model.int8.onnx`, `decoder_joint-model.int8.onnx`) on the ort backend. The burn backends only take fp32 (2.4 GB).
- **Use `TimestampMode::Tokens` and merge words ourselves.** Its `Words` mode makes punctuation its own word ("Hello" ","), which is wrong for an editor.
- **Optimize dependencies in dev/test** (`[profile.dev.package."*"] opt-level = 3`), or the live tests measure the debugger, not Parakeet.
- **ONNX Runtime links statically on macOS.** The bundle is just `supercut` + `ffmpeg`, with nothing extra in Frameworks.
- **`bundle.externalBin` + `signingIdentity: "-"`** puts ffmpeg in `Contents/MacOS/` and ad-hoc signs both binaries. `codesign --verify --deep --strict` passes.
- **Test long-file chunking with a looped clip** (`ffmpeg -stream_loop`): the right word count is known exactly (copies × words per copy).
- **The sample clip is 3.9 s, not 6 s.** Work out sizes from the real file before writing assertions.
