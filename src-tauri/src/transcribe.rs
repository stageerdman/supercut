//! Any video or audio file -> words with times, fully on this Mac.
//! Parakeet TDT v3 runs in-process (parakeet-rs on ONNX Runtime). Long recordings are cut into
//! 120 s chunks with 15 s overlap (as in Pensieve); each word is kept from exactly one chunk.

use crate::audio::{self, RATE};
use crate::keep_awake::KeepAwake;
use crate::words::{merge_tokens, Word};
use parakeet_rs::{ExecutionConfig, ParakeetTDT, TimestampMode, Transcriber};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const CHUNK_S: f64 = 120.0;
const OVERLAP_S: f64 = 15.0;

#[derive(Serialize, Debug)]
pub struct Transcript {
    pub text: String,
    pub words: Vec<Word>,
    pub seconds: f64,
}

/// Where the model lives. The same folder for `npm run fetch-model`, tests and the packaged app.
pub fn model_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("SUPERCUT_MODEL_DIR") {
        return dir.into();
    }
    let home = std::env::var_os("HOME").unwrap_or_default();
    Path::new(&home).join("Library/Application Support/xyz.supercut.editor/models/parakeet-tdt-0.6b-v3-int8")
}

pub fn model_ready(dir: &Path) -> bool {
    ["vocab.txt", "decoder_joint-model.int8.onnx", "encoder-model.int8.onnx"].iter().all(|f| dir.join(f).is_file())
}

/// Sample ranges [a, b) of each chunk.
pub fn chunk_ranges(n: usize) -> Vec<(usize, usize)> {
    let len = (CHUNK_S * RATE as f64) as usize;
    let step = ((CHUNK_S - OVERLAP_S) * RATE as f64) as usize;
    let mut ranges = Vec::new();
    let mut a = 0;
    while a < n {
        let b = (a + len).min(n);
        ranges.push((a, b));
        if b == n {
            break;
        }
        a += step;
    }
    ranges
}

/// The part of chunk `k` whose words we keep (seconds): the middle of each overlap is the seam.
pub fn keep_window(ranges: &[(usize, usize)], k: usize) -> (f64, f64) {
    let (a, b) = ranges[k];
    let lo = if k == 0 { f64::NEG_INFINITY } else { a as f64 / RATE as f64 + OVERLAP_S / 2.0 };
    let hi = if k + 1 == ranges.len() { f64::INFINITY } else { b as f64 / RATE as f64 - OVERLAP_S / 2.0 };
    (lo, hi)
}

/// Loaded once, kept for the life of the app: ONNX Runtime allows one environment per process,
/// and loading takes seconds. The lock also means one transcription at a time.
static MODEL: Mutex<Option<ParakeetTDT>> = Mutex::new(None);

fn load(model: &Path) -> Result<ParakeetTDT, String> {
    let err = |e: &dyn std::fmt::Display| format!("Couldn't load the speech model: {e}");
    let env = parakeet_rs::ort::init().build().map_err(|e| err(&e))?;
    ParakeetTDT::from_pretrained(model, Some(ExecutionConfig::new().with_environment(env))).map_err(|e| err(&e))
}

/// Millisecond precision: enough for cuts, and no f32 noise like 0.4000000059604645.
fn ms(t: f64) -> f64 {
    (t * 1000.0).round() / 1000.0
}

pub fn transcribe(
    model: &Path,
    ffmpeg: &Path,
    input: &Path,
    mut progress: impl FnMut(usize, usize),
) -> Result<Transcript, String> {
    if !model_ready(model) {
        return Err(format!("The speech model isn't downloaded yet ({}).", model.display()));
    }
    let samples = audio::decode(ffmpeg, input)?;
    let _awake = KeepAwake::start();
    let mut loaded = MODEL.lock().unwrap_or_else(|e| e.into_inner());
    if loaded.is_none() {
        *loaded = Some(load(model)?);
    }
    let parakeet = loaded.as_mut().unwrap();

    let ranges = chunk_ranges(samples.len());
    let mut words = Vec::new();
    for (k, &(a, b)) in ranges.iter().enumerate() {
        progress(k, ranges.len());
        let offset = a as f64 / RATE as f64;
        let r = parakeet
            .transcribe_samples(samples[a..b].to_vec(), RATE as u32, 1, Some(TimestampMode::Tokens))
            .map_err(|e| format!("Transcription failed: {e}"))?;
        let tokens: Vec<_> =
            r.tokens.iter().map(|t| (t.text.clone(), ms(offset + t.start as f64), ms(offset + t.end as f64))).collect();
        let (lo, hi) = keep_window(&ranges, k);
        words.extend(merge_tokens(&tokens).into_iter().filter(|w| w.s >= lo && w.s < hi));
    }
    progress(ranges.len(), ranges.len());

    let text = words.iter().map(|w| w.w.as_str()).collect::<Vec<_>>().join(" ");
    Ok(Transcript { text, words, seconds: samples.len() as f64 / RATE as f64 })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::process::Command;
    use std::time::Instant;

    const S: usize = RATE;

    #[test]
    fn short_audio_is_one_chunk() {
        assert_eq!(chunk_ranges(30 * S), vec![(0, 30 * S)]);
        assert!(chunk_ranges(0).is_empty());
    }

    #[test]
    fn chunks_overlap_by_15_s_and_cover_everything() {
        let n = 300 * S;
        let r = chunk_ranges(n);
        assert_eq!(r[0], (0, 120 * S));
        assert_eq!(r[1].0, 105 * S);
        assert_eq!(r.last().unwrap().1, n);
        for w in r.windows(2) {
            assert_eq!(w[0].1 - w[1].0, 15 * S);
        }
    }

    #[test]
    fn keep_windows_meet_without_gap_or_overlap() {
        let r = chunk_ranges(400 * S);
        assert_eq!(keep_window(&r, 0).0, f64::NEG_INFINITY);
        assert_eq!(keep_window(&r, r.len() - 1).1, f64::INFINITY);
        for k in 1..r.len() {
            assert_eq!(keep_window(&r, k - 1).1, keep_window(&r, k).0);
        }
    }

    // ---- Live tests: real ffmpeg + real Parakeet. Skipped until `npm run fetch-model`. ----

    fn ffmpeg() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries/ffmpeg-aarch64-apple-darwin")
    }

    fn sample() -> Option<PathBuf> {
        let wav = Path::new(env!("CARGO_MANIFEST_DIR")).join("../models/en.wav");
        (model_ready(&model_dir()) && wav.is_file()).then_some(wav)
    }

    fn tmp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("supercut-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join(name)
    }

    fn ff(args: &[&str]) {
        let ok = Command::new(ffmpeg()).args(["-hide_banner", "-loglevel", "error", "-y"]).args(args).status().unwrap();
        assert!(ok.success(), "ffmpeg {args:?}");
    }

    fn check_times(words: &[Word]) {
        for w in words.windows(2) {
            assert!(w[1].s >= w[0].s, "times go forward: {:?} then {:?}", w[0], w[1]);
        }
        assert!(words.iter().all(|w| w.e >= w.s), "every word ends after it starts");
    }

    fn run(file: &Path) -> Transcript {
        let t0 = Instant::now();
        let t = transcribe(&model_dir(), &ffmpeg(), file, |_, _| {}).unwrap();
        let took = t0.elapsed().as_secs_f64();
        let text: String = t.text.chars().take(120).collect();
        println!("# {:.1} s of audio in {took:.1} s ({:.0}x real time), {} words: {text}", t.seconds, t.seconds / took, t.words.len());
        println!("# first words: {}", serde_json::to_string(&t.words[..4.min(t.words.len())]).unwrap());
        t
    }

    #[test]
    fn live_transcribes_a_video_file_with_word_times() {
        let Some(wav) = sample() else { return println!("# skipped: model not downloaded") };
        // Wrap the speech in a real H.264 + AAC .mp4, like a phone recording.
        let mp4 = tmp("clip.mp4");
        let w = wav.to_str().unwrap();
        ff(&["-f", "lavfi", "-i", "color=c=gray:s=320x240:r=30", "-i", w, "-shortest", "-c:v", "libx264", "-c:a", "aac", mp4.to_str().unwrap()]);
        let t = run(&mp4);
        assert!(t.words.len() > 5, "got words");
        check_times(&t.words);
    }

    #[test]
    fn live_long_recording_is_stitched_across_chunks() {
        let Some(wav) = sample() else { return println!("# skipped: model not downloaded") };
        let once = run(&wav).words.len();
        // 60 copies of the 3.9 s clip back to back ≈ 3.9 min: three chunks, two seams.
        let copies = 60;
        let long = tmp("long.wav");
        ff(&["-stream_loop", &(copies - 1).to_string(), "-i", wav.to_str().unwrap(), long.to_str().unwrap()]);
        let t = run(&long);
        assert!(t.seconds > 2.0 * (CHUNK_S - OVERLAP_S), "spans 3 chunks");
        check_times(&t.words);
        let expected = once * copies;
        let diff = (t.words.len() as f64 - expected as f64).abs() / expected as f64;
        assert!(diff < 0.05, "no words lost or doubled at seams: {} words, expected about {expected}", t.words.len());
    }
}
