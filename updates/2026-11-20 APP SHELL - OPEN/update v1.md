# App shell, video loading and Parakeet transcription — v1

Goal: drop one or two videos, see them play, get a timed transcript made on this Mac. Nothing uploaded.

## Phases
1. **Rust core** — done. `recognizer.rs` (SpeechRecognizer trait), `parakeet.rs` (real recognizer, model download),
   fakes in `transcribe.rs` tests, `audio.rs` (bundled ffmpeg → 16 kHz mono f32 in memory), 120 s chunks / 15 s overlap,
   `keep_awake.rs` (caffeinate -i -w pid), `words.rs` (tokens → { w, s, e }), `error.rs` (one plain sentence per failure),
   `log.rs` (every line tagged with a trace id like `part-2`), `project.rs` (1–2 parts, ids never reused).
2. **Commands** — done. `add_video`, `remove_part`, `transcribe_part` (downloads the model first if missing, emits `progress`), `claude_status`.
3. **Screen** — done. Empty drop zone (whole window takes drops, ⌘O, Choose Video…), drag-over valid/invalid,
   player with parts back to back, transport row (play, time, one status line + 2 px progress bar), timeline tiles with ✕ and
   "+ Add part 2" slot, transcript panel that appears only once words exist (click a word → seek and play; the current word is lit),
   one banner pattern for every error (with "Try again" for a failed transcription), early Claude sign-in banner.

## Health Analyst's done list
| # | Item | Status |
|---|---|---|
| 1 | Start from main f5fcc40 | yes (no Swift branch used) |
| 2 | No Sources/, Tests/, Package.swift, Packaging/ | none exist |
| 3 | SpeechRecognizer trait + fake | `recognizer.rs`; fakes `Counting`, `Broken` |
| 4 | ffmpeg → 16 kHz mono, chunking, caffeinate | `audio.rs`, `transcribe.rs`, `keep_awake.rs` |
| 5 | Pensieve fixes: PATH from Finder, byte-safe stderr, clear errors | ffmpeg/caffeinate by absolute path, claude gets a full PATH; stderr read as bytes; `error.rs` |
| 6 | Words { w, s, e } + tests for merging and the 1–2 video list | `words.rs`, `project.rs` tests |
| 7 | Wired to the Tailwind screen, no uploads | `src/index.html`, `src/main.js`; the only network call is the model download |
| 8 | cargo test run + a real video's timed transcript | 26/26 pass; `npm run smoke` on a 720p .mov, see `test-run.log` |

## Decisions
- The model downloads on the first transcription, not at launch: no network use until the user actually drops a video.
- Files download as `.part` and get renamed when complete, so a cut connection can never look like a ready model.
- Parts transcribe one at a time (one model in memory). Simple and enough for two parts.

## Next
- Someone opens the window once and drops a real camera recording (agents can't see the screen).
- Cancel for transcription and download; thumbnails/waveform on the timeline; swap part order.
