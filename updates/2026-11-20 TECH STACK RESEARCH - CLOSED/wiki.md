# SuperCut tech stack (research, 2026-11-20)

Author: Elon Engineer (Research). The team builds from this document.
Status: Pensieve has not yet confirmed its Parakeet setup (mail sent 2026-11-20). If their answer differs, update section 3.

## 0. The core idea (first principles)

SuperCut is really **one data object and four workers around it**:

```
Project (JSON, Codable)
 ├─ sources[]      video files (bookmarks), each with its own audio
 ├─ externalAudio? better-mic file + measured offset (and drift)
 ├─ transcript     words[] {text, start, end, confidence, sourceId}
 ├─ segments[]     sentences/takes built from words, stable IDs
 └─ edl[]          kept ranges {sourceId, start, end} in timeline order
Workers: Transcriber (Parakeet) · Syncer (audio match) · Picker (Claude) · Exporter (AVFoundation)
```

Rules that fall out of this:
- **Time lives only in the app.** Claude never invents timestamps. It gets segment IDs and text and returns IDs to keep or drop. The app maps IDs to word times. That removes a whole class of bugs (wrong times, rounding, drift).
- **The EDL is the product.** Playback, the timeline, and export all read the same EDL. A manual pre-cut is just an edit to the EDL.
- Each worker is a separate module with a small interface (`transcribe(url) -> [Word]`, `offset(a, b) -> Seconds`, `pick(segments) -> [ID]`, `export(edl, to:)`).

## 1. App framework

| Option | Good | Bad |
|---|---|---|
| **SwiftUI + AppKit where needed, Swift 6** | Native AVFoundation (hardware decode, frame-accurate seek, export), Parakeet runtime (FluidAudio) is Swift, small app, fast | Timeline must be custom-built |
| Tauri / Electron + web UI (how OpenCut works) | Many web timeline libraries | Video goes through ffmpeg/WebCodecs, Parakeet needs a sidecar, two languages, bigger app |

**Recommendation: SwiftUI app (macOS 14+, Apple Silicon only), AppKit `NSViewRepresentable` only where SwiftUI is weak (player view, timeline scrolling).** One language, one process, no sidecar.

## 2. Video playback, frame-accurate cutting, timeline

- **Playback:** `AVPlayer` + `AVPlayerLayer` playing an `AVMutableComposition` built from the EDL. Rebuild the composition when the EDL changes (cheap, milliseconds). Preview = export, so what you see is what you get.
- **Frame accuracy:** seek with `seek(to:toleranceBefore: .zero, toleranceAfter: .zero)`. Keep all times as `CMTime` with the source's timescale (e.g. 600 or the track's `naturalTimeScale`). Snap cut points to frame boundaries (`frameDuration = 1/nominalFrameRate`). Never store `Double` seconds in the EDL for video; convert at the edge.
- **Timeline (CapCut style):** a custom SwiftUI view: horizontal scroll, zoom, one video track with thumbnails, one audio track with a waveform, plus a word strip from the transcript.
  - Thumbnails: `AVAssetImageGenerator` (async `images(for:)`), cached by time.
  - Waveform: `AVAssetReader` → downsample to peaks with Accelerate (`vDSP`), draw with `Canvas`. Compute once per source and cache to disk.
  - Draw with `Canvas` (not thousands of SwiftUI views) so long videos stay fast.
- **Rejected:** ffmpeg for preview (slow, no hardware path in-process), web timelines (needs a web stack).

## 3. Local transcription: Parakeet with word timings

| Option | Runtime | Word times | Packaging | Speed (Apple Silicon) |
|---|---|---|---|---|
| **FluidAudio + `parakeet-tdt-0.6b-v3-coreml`** | CoreML / Neural Engine, Swift package | Yes: `ASRResult.tokenTimings` (token, start, end, confidence) → merge to words | SwiftPM dependency, model downloaded on first run (~465 MB) | ~120–190× real time (M4 Pro); 1 h audio ≈ 20–30 s |
| parakeet-mlx (Python) | MLX | Yes (sentences → tokens with start/end) | Python sidecar to bundle | fast, but extra runtime |
| sherpa-onnx / parakeet-rs | ONNX | Yes | C/Rust lib to bridge | slower than ANE |
| WhisperKit (Swift) | CoreML | Yes (word timestamps) | SwiftPM | slower than Parakeet; good fallback |

**Recommendation: FluidAudio (Apache-2.0) with Parakeet TDT v3, in-process.** It is the runtime that the shipping Mac app MacParakeet uses (word timestamps, ~81–93× real time steady, ~130 MB RAM, notarized DMG). Likely what Pensieve uses too; not yet confirmed.
- Use `.v3` by default (multilingual). Make `.v2` (English-only, slightly better on rare English words) a later setting, not a v1 option.
- Pipeline: extract audio with `AVAssetReader` → `AudioConverter` (FluidAudio) to 16 kHz mono Float32 → `AsrManager.transcribe` → merge sub-word tokens into words (a token starting with a space or `▁` begins a new word; word start = first token start, end = last token end, confidence = min of token confidences).
- Long files: the model works on ~15 s windows inside the library. Test a 60+ min file early. If memory or the edges of windows are a problem, chunk on silences ourselves (VAD from FluidAudio) and shift the times.
- Model: first-run download with a progress bar, cached by FluidAudio (Application Support). Don't bundle it in the app (keeps the DMG small).
- **Verify in the first spike:** the exact Swift field names (`tokenTimings`, `TokenTiming.startTime/endTime`); I took them from the wrapper docs, not the Swift source.
- **Fallback:** WhisperKit (Swift, word timestamps, same packaging story). Not a Python sidecar.

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
  --append-system-prompt "<SuperCut picker rules>"
```
- Prompt goes in on **stdin** (limit 10 MB; a transcript is far below that). Run with an **empty temp folder as working directory**, so no project `CLAUDE.md`, hooks or `.mcp.json` get picked up.
- **Remove `ANTHROPIC_API_KEY` from the child environment.** If it is set, it wins over the subscription login and bills the API.
- **Do not pass `--bare`.** Bare mode never reads the subscription login (keychain). Docs say `--bare` "will become the default for `-p` in a future release"; this is the biggest risk. Mitigate: pin the behaviour with a startup self-test (a tiny `claude -p` call). If it reports an auth failure while `auth status` says `claude.ai`, show an "update SuperCut" message.
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

- **Recommendation:** `AVAssetExportSession` on the same `AVMutableComposition` (+ `AVAudioMix`). Presets: **HEVC highest quality** (default, `AVAssetExportPresetHEVCHighestQuality`), **H.264** for compatibility, **ProRes 422** for editors. MP4/MOV output. Keep source resolution and frame rate.
- Use `AVAssetWriter` only if we need custom bitrate control later.
- Passthrough (no re-encode) is fast but cuts snap to keyframes or depend on edit lists that some players ignore. So the default is re-encode for frame-accurate cuts. A "fast export" option can come later.
- Also export an **FCPXML / EDL** later so pros can finish in Final Cut / Resolve. Cheap because the EDL already exists.

## 9. Packaging, sandboxing, distribution

- **No App Sandbox, no Mac App Store.** A sandboxed app's child processes inherit the sandbox. They cannot read `~/.claude` / the keychain login or run a binary from `~/.local/bin`. That kills the Claude integration.
- **Developer ID signing + hardened runtime + notarization, shipped as a DMG; Sparkle 2 for updates.** Same path as MacParakeet. Hardened runtime allows launching the `claude` child process. It needs no extra entitlements beyond the network (for the model download).
- macOS 14+, Apple Silicon only (CoreML/ANE Parakeet; Intel is not worth the support cost).
- Build: Xcode project (or SwiftPM + a small bundling script). Uncle Bob's call, but one target, one app.
- Needs from the user: an Apple Developer ID for signing/notarizing before sharing with anyone else. Unsigned local builds are fine for development.

## 10. What to spike first (riskiest first)

1. FluidAudio on a 60-minute video: word times correct to ±50 ms? Speed? Memory? (Also confirms field names.)
2. `claude -p` from a SwiftUI app with `Process`: PATH lookup, `auth status`, `--json-schema` result, cancel. (No API key in env.)
3. Audio cross-correlation offset on a real camera + lav recording, with drift check.
4. Composition rebuild + frame-accurate seek on a 200-cut EDL.

## Sources
- Claude Code headless docs: https://code.claude.com/docs/en/headless
- Claude Code CLI reference: https://code.claude.com/docs/en/cli-reference
- Agent SDK / `claude -p` with a Claude plan: https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan
- Claude Code install troubleshooting (native path `~/.local/bin/claude`): https://code.claude.com/docs/en/troubleshoot-install
- FluidAudio: https://github.com/FluidInference/FluidAudio · docs https://docs.fluidinference.com/asr/getting-started
- Parakeet TDT v3 CoreML model: https://huggingface.co/FluidInference/parakeet-tdt-0.6b-v3-coreml
- MacParakeet (reference app): https://github.com/moona3k/macparakeet
- FluidAudio RN wrapper (tokenTimings fields): https://deepwiki.com/FluidInference/react-native-fluidaudio/4.1-asrmanager
