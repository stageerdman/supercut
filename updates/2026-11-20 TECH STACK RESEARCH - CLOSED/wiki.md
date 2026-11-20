# Magic Cut tech stack (research, 2026-11-20)

Author: Elon Engineer (Research). The team builds from this document.

> **Stack v2 (2026-11-20, later the same day): Tauri 2 (Rust) + Tailwind v4 web UI, shipped unsigned (ad-hoc).** The user rejected Electron as too heavy and wants the stack of their Pensieve and Master's Circle apps. Swift isn't an option because agents can't run `swift` here. Tauri *can* be built: the Tauri CLI and `npm` scripts drive `cargo`. Sections 1, 2, 3, 8, 9 and 10 below have been rewritten for v2. Sections 0 and 4–7 still hold; read "Swift/Accelerate" there as "Rust" (`rustfft` for cross-correlation). Proof that it builds: `updates/2026-11-20 TAURI SKELETON - OPEN/`.

## 0. The core idea (first principles)

Magic Cut is really **one data object and four workers around it**:

```
Project (JSON, serde in Rust)
 ├─ sources[]      video files (bookmarks), each with its own audio
 ├─ externalAudio? better-mic file + measured offset (and drift)
 ├─ transcript     words[] {text, start, end, confidence, sourceId}
 ├─ segments[]     sentences/takes built from words, stable IDs
 └─ edl[]          kept ranges {sourceId, start, end} in timeline order
Workers: Transcriber (Parakeet) · Syncer (audio match) · Picker (Claude) · Exporter (ffmpeg)
```

Rules that fall out of this:
- **Time lives only in the app.** Claude never invents timestamps. It gets segment IDs and text and returns IDs to keep or drop. The app maps IDs to word times. That removes a whole class of bugs (wrong times, rounding, drift).
- **The EDL is the product.** Playback, the timeline, and export all read the same EDL. A manual pre-cut is just an edit to the EDL.
- Each worker is a separate module with a small interface (`transcribe(url) -> [Word]`, `offset(a, b) -> Seconds`, `pick(segments) -> [ID]`, `export(edl, to:)`).

## 1. App framework

**v2 decision: Tauri 2 + a Tailwind v4 web UI. Rust does the work, the web view draws.** Same stack as the user's Pensieve and Master's Circle apps. The app is ~79 MB, and ffmpeg is most of that. Electron was rejected as too heavy. Swift was rejected because agents can't build it here.
- Layout: `src/` = the web UI (plain HTML/JS + Tailwind, no bundler, `withGlobalTauri`), `src-tauri/` = Rust, one module per worker (`audio`, `transcribe`, `words`, `claude`, `keep_awake`).
- The UI calls Rust with `invoke('command', …)`. Long jobs run in `spawn_blocking` and report progress with events (`transcribe-progress`).
- Build output goes to the shared Cargo target `~/.cargo-shared-target` (see CLAUDE.md). The app ends up at `~/.cargo-shared-target/release/bundle/macos/Magic Cut.app`.
- Commands: `npm run dev` (window with hot reload), `npm test` (cargo test, including live Parakeet), `npm run build` (ad-hoc signed `.app`), `npm run smoke` (the built app transcribes on its own), `npm run fetch-model`.

## 2. Video playback, frame-accurate cutting, timeline

- **Playback:** an HTML `<video>` in the web view (WKWebView, so H.264/HEVC are decoded in hardware by the system). Load local files through Tauri's asset protocol (`convertFileSrc`, with `assetProtocol` enabled and scoped). Preview the EDL by playing kept ranges and jumping over cuts with `requestVideoFrameCallback`. Preview isn't byte-identical to export, but it is close enough to judge cuts.
- **Frame accuracy lives in export** (ffmpeg, section 8). Keep EDL times as seconds in Rust and snap cut points to the source frame rate (from `ffprobe`-style metadata via ffmpeg) at the edge.
- **Timeline (CapCut style):** draw it in a `<canvas>`, not thousands of DOM nodes. Thumbnails: ffmpeg grabs one frame every N seconds into a cache folder. Waveform: peaks computed in Rust from the same 16 kHz samples we already decode for Parakeet, cached per source.
- **Risk to spike early:** seek latency and seam gaps in `<video>` with ~200 cuts. If preview at the seams is bad, render a low-res proxy of the cut with ffmpeg in the background and play that.

## 3. Local transcription: Parakeet with word timings

| Option | Runtime | Python? | First-run setup for the user | Measured / reported speed |
|---|---|---|---|---|
| **parakeet-rs 0.4 (Rust, in-process) + `parakeet-tdt-0.6b-v3` int8 ONNX** | ONNX Runtime (CPU), linked statically into the app | No | One 670 MB model download | **Measured here: 15–25× real time** (230 s in 9–15 s, warm), plus ~2 s to load the model once |
| parakeet-mlx in a Python subprocess (Pensieve) | MLX (GPU) | Yes (a venv we can't bundle) | Install Python + a venv + the model | Pensieve, M3: ~17× (3.5 s per 60 s clip), a 75-min tape in 2–3 min |
| FluidAudio (Swift, Neural Engine) | CoreML | No | Model download | ~100× reported, but Swift can't be built here |

**v2 decision: parakeet-rs in-process. No Python.** It's about as fast as Pensieve's MLX (15–25× vs ~17×), and it deletes the part that caused most of Pensieve's bugs: the Python subprocess. How each of Pensieve's fixes maps over:
- *Finder's minimal PATH* → nothing is looked up on PATH. ffmpeg is bundled inside the app (`bundle.externalBin`) and called by absolute path. `claude` is found at its known install paths, and the child gets a full PATH.
- *Multi-byte stderr breaking the pipe* → `Command::output()` drains stdout and stderr together, and stderr is read as bytes (`from_utf8_lossy`). Samples come back on stdout as raw `f32le`, so there's no text to parse.
- *An external venv we can't bundle* → there is no venv. ONNX Runtime is linked into the binary; the `.app` holds just `supercut` + `ffmpeg`.
- *caffeinate during long jobs* → kept: `/usr/bin/caffeinate -i -w <our pid>` runs while a transcription is going, and quits by itself if we crash.
- *Decode every container first to 16 kHz mono* → kept, but straight to memory (`-f f32le -`). No temp WAV.
- *120 s chunks, 15 s overlap* → kept. The seam sits in the middle of each overlap, so each word comes from exactly one chunk. Tested on 3.9 min (3 chunks): 1020 of 1020 words, none lost or doubled.
- *Words `{ w, s, e }`* → the same shape. Sub-word tokens are merged in Rust (`words.rs`): a token starting with `▁`/space starts a word, anything else, punctuation included, joins the word before it. Times are rounded to ms.

**How users get the model on first run:** the app downloads three files (`encoder-model.int8.onnx` 652 MB, `decoder_joint-model.int8.onnx` 18 MB, `vocab.txt`) from Hugging Face (`istupakov/parakeet-tdt-0.6b-v3-onnx`). They go into `~/Library/Application Support/xyz.supercut.editor/models/parakeet-tdt-0.6b-v3-int8/`, with a progress bar, and they're kept there. `SUPERCUT_MODEL_DIR` overrides the folder. Today `npm run fetch-model` does this download for development; the in-app download is the next build step. The model isn't bundled, which keeps the app small.
- The model loads once per app run and stays loaded. ONNX Runtime allows only one environment per process, and a reload would cost ~2 s per file.
- **Speed-ups if needed later, in order:** parakeet-rs `coreml` feature (ONNX Runtime CoreML provider), then its `metal` burn backend (needs the fp32 model, 2.4 GB). Measure before switching.
- **Still to test:** a real 60+ min recording (memory: 75 min of samples is ~290 MB in RAM, fine), and accuracy of the word times against a hand-checked clip.

## 4. Claude Code CLI in the background (user's own subscription)

**Recommendation: spawn the user's installed `claude` binary with `Process` in print mode. No Agent SDK (would need a Node/Python runtime), no API key.**

Find the binary (GUI apps do not get the shell's PATH): try `~/.local/bin/claude` (native install, the default), then `/opt/homebrew/bin/claude`, `/usr/local/bin/claude`, then `/bin/zsh -lc 'command -v claude'`. Remember the path once found.

Check login at startup: `claude auth status` prints JSON and exits 0 if logged in, 1 if not. `authMethod` is `claude.ai` for a subscription. If not logged in, show one clear message: "Open Terminal and run `claude`, then sign in." (`/login` is not available in `-p` mode.)

The call:

```
claude -p \
  --output-format stream-json --verbose \
  --json-schema '<schema>' \
  --tools "" --strict-mcp-config \
  --no-session-persistence \
  --max-turns 1 \
  --model sonnet \
  --append-system-prompt "<Magic Cut picker rules>"
```
- Prompt goes in on **stdin** (limit 10 MB; a transcript is far below that). Run with an **empty temp folder as working directory**, so no project `CLAUDE.md`, hooks or `.mcp.json` get picked up.
- **Remove `ANTHROPIC_API_KEY` from the child environment.** If it is set, it wins over the subscription login and bills the API.
- **Do not pass `--bare`.** Bare mode never reads the subscription login (keychain). Docs say `--bare` "will become the default for `-p` in a future release"; this is the biggest risk. Mitigate: pin the behaviour with a startup self-test (a tiny `claude -p` call). If it reports an auth failure while `auth status` says `claude.ai`, show an "update Magic Cut" message.
- **Output:** read stdout line by line. Each line is JSON. Show progress from `assistant`/`stream_event` lines. The last line is `type: "result"` with `result`, `is_error`, `session_id`, `total_cost_usd`, and `structured_output` (only present if the schema was met; check before use).
- **Errors:** non-zero exit code; `is_error: true` in the result (for example, missing auth is printed as the result on stdout); `system/api_retry` events with `error` = `authentication_failed`, `rate_limit`, `overloaded`, `billing_error`… Map them to three user messages: "Sign in to Claude", "Claude is busy, retrying…", "Something went wrong (details)". Cancel with SIGINT (SIGTERM drops the turn, exit 143). Add a timeout (~2 min per call).
- **Subscription policy (checked 2026-11-20):** Anthropic's help page says `claude -p` and the Agent SDK, signed in with a Claude plan, "still draw from your subscription limits" (updates of 15 Jun and 7 Oct 2026; earlier planned changes are paused, not cancelled). Fine for the user running their own CLI. Re-check before any commercial distribution: third-party products offering claude.ai login may need approval.
- `total_cost_usd` is a client-side estimate. With a subscription it is not a bill; don't show it to the user.

## 5. Finding repeated / similar takes

Two stages. Cheap local work first, judgment second:
1. **Local (deterministic, instant):** split words into segments at sentence ends and pauses > ~0.7 s. Compare each segment with the next N (~10) segments: normalized text (lowercase, no punctuation, no fillers), similarity = max(word-trigram Jaccard, Levenshtein ratio on words). Above ~0.6 → same "take group". Also flag restarts ("so the… so the idea is") and long silences. Unit-test this; it is pure logic.
2. **Claude (judgment):** send the segments with IDs, groups, pauses and confidences. Ask for JSON `{keep: [id], drop: [{id, reason}]}` via `--json-schema`. Rule of thumb in the prompt: in a group, keep the last complete, fluent take.
- Optional later: Apple `NLEmbedding.sentenceEmbedding` for meaning-level matches. Not needed for v1; text overlap catches retakes because people repeat the same words.

## 6. Syncing the better-mic audio

**Recommendation: cross-correlation of the two audio tracks (what PluralEyes / Premiere "sync by audio" do), with Accelerate FFT. Not clap detection.** The clap is just a strong peak that cross-correlation finds anyway; requiring one adds a step for the user.
- Downmix both to mono, resample to 8 kHz, take the onset envelope (or use GCC-PHAT, which is robust to different mics/rooms). FFT cross-correlate a 60–120 s window, peak = offset. Refine at 48 kHz around the peak for sample accuracy.
- Confidence = peak / second peak. If low → ask the user to nudge it (a single slider on the timeline).
- **Drift:** separate recorders' clocks differ by up to ~tens of ms per hour. Measure the offset near the start and near the end. If they differ by more than half a frame, time-stretch the external audio (`AVMutableCompositionTrack.scaleTimeRange`, or resample) by the ratio.
- In the composition: mute camera audio and use the external track, shifted by the offset. Same for the second camera (sync camera B to camera A the same way).

## 7. Two videos + manual pre-cuts

- Model: `sources[]` (any number, v1 UI = 2), each with its own transcript. Sync camera 2 to camera 1 by audio (section 6). Then both share one master time.
- Pre-cuts: the user marks ranges to throw away before AI runs (I/O keys or drag on the timeline). They are just EDL edits. The AI only sees words inside kept ranges.
- Simplest version that works: v1 = sequential sources (video 1 then video 2), not multi-cam switching. Multi-cam (angle switching) is a later feature; the data model above already allows it.
- Store files as security-scoped bookmarks in the project JSON, so moved files can be re-found.

## 8. Export

- **v2: the bundled ffmpeg renders the EDL.** One `filter_complex` with `trim`/`atrim` per kept range, then `concat`, re-encoded so every cut lands on the exact frame. Encoders: **`hevc_videotoolbox`** (default, hardware), **`h264_videotoolbox`** for compatibility, **`prores_videotoolbox`** for editors. Audio is AAC. Keep the source resolution and frame rate.
- The better-mic audio is one more input to the same filter graph (`adelay`/`atempo` for offset and drift), with the camera audio dropped.
- Progress comes from `-progress pipe:1`, read line by line. Same stderr rule as section 3: read it as bytes.
- Also export an **FCPXML / EDL** later so pros can finish in Final Cut / Resolve. Cheap because the EDL already exists.
- Check the ffmpeg build: `ffmpeg-static` ships a GPL build with libx264 and VideoToolbox. That's fine for a free app the user shares. Swap in an LGPL build before selling it.

## 9. Packaging, sandboxing, distribution

- **No App Sandbox, no Mac App Store.** A sandboxed app's child processes inherit the sandbox. They cannot read `~/.claude` / the keychain login or run a binary from `~/.local/bin`. That kills the Claude integration.
- **v2: unsigned (ad-hoc signed), no Developer ID, no notarization.** `bundle.macOS.signingIdentity: "-"` makes `tauri build` ad-hoc sign the app and the ffmpeg sidecar; `codesign --verify --deep --strict` passes. Without ad-hoc signing, Apple Silicon calls a downloaded app "damaged". First launch on another Mac: System Settings → Privacy & Security → Open Anyway (see the roadmap, Phase 10).
- Bundle identifier `xyz.supercut.editor` (Tauri warns against ids ending in `.app`). Minimum macOS 13, Apple Silicon (`aarch64-apple-darwin`).
- Updates: none in v1 (Sparkle needs signing). The Tauri updater plugin can come later.

## 10. What to spike first (riskiest first)

1. Parakeet on a real 60-minute recording: are the word times right to ±50 ms? Speed and memory. (The 4-min synthetic test passes at 15×.)
2. `<video>` preview of a 200-cut EDL in the web view: seek latency and gaps at the seams.
3. `claude -p` from Rust: the JSON-schema answer, streaming, cancel. (Finding it, the login check and the API-key strip already work.)
4. Audio cross-correlation offset on a real camera + lav recording, with a drift check.

## Sources
- Claude Code headless docs: https://code.claude.com/docs/en/headless
- Claude Code CLI reference: https://code.claude.com/docs/en/cli-reference
- Agent SDK / `claude -p` with a Claude plan: https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan
- Claude Code install troubleshooting (native path `~/.local/bin/claude`): https://code.claude.com/docs/en/troubleshoot-install
- FluidAudio: https://github.com/FluidInference/FluidAudio · docs https://docs.fluidinference.com/asr/getting-started
- Parakeet TDT v3 CoreML model: https://huggingface.co/FluidInference/parakeet-tdt-0.6b-v3-coreml
- MacParakeet (reference app): https://github.com/moona3k/macparakeet
- FluidAudio RN wrapper (tokenTimings fields): https://deepwiki.com/FluidInference/react-native-fluidaudio/4.1-asrmanager
