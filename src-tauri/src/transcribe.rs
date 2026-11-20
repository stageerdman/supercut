//! Any video or audio file -> words with times, fully on this Mac.
//! Long recordings are cut into 120 s chunks with 15 s overlap (as in Pensieve);
//! each word is kept from exactly one chunk: the middle of each overlap is the seam.

use crate::audio::{self, RATE};
use crate::error::AppError;
use crate::keep_awake::KeepAwake;
use crate::log;
use crate::parakeet;
use crate::recognizer::{SpeechRecognizer, Token};
use crate::words::{merge_tokens, Word};
use serde::Serialize;
use std::path::Path;

const CHUNK_S: f64 = 120.0;
const OVERLAP_S: f64 = 15.0;

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Transcript {
    pub text: String,
    pub words: Vec<Word>,
    pub seconds: f64,
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

/// The part of chunk `k` whose words we keep (seconds).
pub fn keep_window(ranges: &[(usize, usize)], k: usize) -> (f64, f64) {
    let (a, b) = ranges[k];
    let lo = if k == 0 { f64::NEG_INFINITY } else { a as f64 / RATE as f64 + OVERLAP_S / 2.0 };
    let hi = if k + 1 == ranges.len() { f64::INFINITY } else { b as f64 / RATE as f64 - OVERLAP_S / 2.0 };
    (lo, hi)
}

/// Millisecond precision: enough for cuts, and no f32 noise like 0.4000000059604645.
fn ms(t: f64) -> f64 {
    (t * 1000.0).round() / 1000.0
}

fn shift(tokens: Vec<Token>, offset: f64) -> Vec<Token> {
    tokens.into_iter().map(|t| Token { s: ms(offset + t.s), e: ms(offset + t.e), ..t }).collect()
}

/// The pipeline without I/O: chunk, recognize, put on the file's clock, stitch.
/// `progress(chunks done, chunks total)`.
pub fn transcribe_samples(
    rec: &mut dyn SpeechRecognizer,
    samples: &[f32],
    mut progress: impl FnMut(usize, usize),
) -> Result<Transcript, AppError> {
    let ranges = chunk_ranges(samples.len());
    let mut words = Vec::new();
    for (k, &(a, b)) in ranges.iter().enumerate() {
        progress(k, ranges.len());
        let tokens = shift(rec.recognize(&samples[a..b])?, a as f64 / RATE as f64);
        let (lo, hi) = keep_window(&ranges, k);
        words.extend(merge_tokens(&tokens).into_iter().filter(|w| w.s >= lo && w.s < hi));
    }
    progress(ranges.len(), ranges.len());
    let text = words.iter().map(|w| w.w.as_str()).collect::<Vec<_>>().join(" ");
    Ok(Transcript { text, words, seconds: samples.len() as f64 / RATE as f64 })
}

/// The real thing: bundled ffmpeg + Parakeet, Mac kept awake until done. `trace` tags the log lines.
pub fn transcribe_file(
    model: &Path,
    ffmpeg: &Path,
    input: &Path,
    trace: &str,
    progress: impl FnMut(usize, usize),
) -> Result<Transcript, AppError> {
    log::info("transcribe", trace, format!("start {}", input.display()));
    let result = (|| {
        let _awake = KeepAwake::start();
        let samples = audio::decode(ffmpeg, input)?;
        parakeet::with_model(model, |p| transcribe_samples(p, &samples, progress))
    })();
    match &result {
        Ok(t) => log::info("transcribe", trace, format!("done: {} words, {:.1} s", t.words.len(), t.seconds)),
        Err(e) => log::error("transcribe", trace, format!("{} failed: {e}", input.display())),
    }
    result
}

#[cfg(test)]
pub mod fake {
    use super::*;
    use std::path::PathBuf;

    /// Tests run outside the .app: the dev copy of ffmpeg (`npm run prepare-bins`).
    pub fn ffmpeg() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries/ffmpeg-aarch64-apple-darwin")
    }

    /// Hears one word per second. The samples carry their own second number as their value,
    /// so the word text says where in the file it came from: "w0", "w1", …
    pub struct Counting;

    pub fn speech(seconds: usize) -> Vec<f32> {
        (0..seconds * RATE).map(|i| (i / RATE) as f32).collect()
    }

    impl SpeechRecognizer for Counting {
        fn recognize(&mut self, samples: &[f32]) -> Result<Vec<Token>, AppError> {
            let tok = |j: usize| Token { text: format!("▁w{}", samples[j * RATE]), s: j as f64 + 0.1, e: j as f64 + 0.5 };
            Ok((0..samples.len() / RATE).map(tok).collect())
        }
    }

    pub struct Broken;

    impl SpeechRecognizer for Broken {
        fn recognize(&mut self, _: &[f32]) -> Result<Vec<Token>, AppError> {
            Err(AppError::Recognize("out of memory".into()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::fake::{ffmpeg, speech, Broken, Counting};
    use super::*;
    use std::path::PathBuf;
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

    #[test]
    fn stitched_words_are_each_heard_once_at_their_file_time() {
        let t = transcribe_samples(&mut Counting, &speech(400), |_, _| {}).unwrap();
        assert_eq!(t.words.len(), 400, "no word lost or doubled at the seams");
        for (n, w) in t.words.iter().enumerate() {
            assert_eq!((w.w.as_str(), w.s, w.e), (format!("w{n}").as_str(), n as f64 + 0.1, n as f64 + 0.5));
        }
        assert_eq!(t.seconds, 400.0);
        assert!(t.text.starts_with("w0 w1 w2"));
    }

    #[test]
    fn progress_counts_every_chunk_then_finishes() {
        let mut seen = Vec::new();
        transcribe_samples(&mut Counting, &speech(250), |d, n| seen.push((d, n))).unwrap();
        assert_eq!(seen, [(0, 3), (1, 3), (2, 3), (3, 3)]);
    }

    #[test]
    fn silence_gives_an_empty_transcript() {
        let t = transcribe_samples(&mut Counting, &[], |_, _| {}).unwrap();
        assert_eq!((t.words.len(), t.seconds), (0, 0.0));
    }

    #[test]
    fn a_recognizer_failure_reaches_the_caller() {
        let err = transcribe_samples(&mut Broken, &speech(5), |_, _| {}).unwrap_err();
        assert_eq!(err.to_string(), "Transcription failed: out of memory");
    }

    // ---- Live tests: real ffmpeg + real Parakeet. Skipped until `npm run fetch-model`. ----

    fn sample() -> Option<PathBuf> {
        let wav = Path::new(env!("CARGO_MANIFEST_DIR")).join("../models/en.wav");
        (parakeet::model_ready(&parakeet::model_dir()) && wav.is_file()).then_some(wav)
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
        let t = transcribe_file(&parakeet::model_dir(), &ffmpeg(), file, "test", |_, _| {}).unwrap();
        let took = t0.elapsed().as_secs_f64();
        let text: String = t.text.chars().take(120).collect();
        println!("# {:.1} s of audio in {took:.1} s ({:.0}x real time), {} words: {text}", t.seconds, t.seconds / took, t.words.len());
        println!("# first words: {}", serde_json::to_string(&t.words[..4.min(t.words.len())]).unwrap());
        t
    }

    /// A real H.264 + AAC .mp4 with speech, like a phone recording.
    pub fn speech_video() -> Option<PathBuf> {
        let wav = sample()?;
        let mp4 = tmp("clip.mp4");
        if !mp4.is_file() {
            let w = wav.to_str().unwrap();
            ff(&["-f", "lavfi", "-i", "color=c=gray:s=320x240:r=30", "-i", w, "-shortest", "-c:v", "libx264", "-c:a", "aac", mp4.to_str().unwrap()]);
        }
        Some(mp4)
    }

    #[test]
    fn live_transcribes_a_video_file_with_word_times() {
        let Some(mp4) = speech_video() else { return println!("# skipped: model not downloaded") };
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
