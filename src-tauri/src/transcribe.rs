//! Any video or audio file -> words with times, and where the talking is, fully on this Mac.
//! Silero (`vad.rs`) finds the talking; Parakeet hears it in short pieces cut at silences (`pieces.rs`).

use crate::audio::{self, RATE};
use crate::error::AppError;
use crate::keep_awake::KeepAwake;
use crate::log;
use crate::parakeet;
use crate::pieces;
use crate::recognizer::{SpeechRecognizer, Token};
use crate::speech::Span;
use crate::vad;
use crate::words::{merge_tokens, Word};
use serde::Serialize;
use std::path::Path;

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Transcript {
    pub text: String,
    pub words: Vec<Word>,
    /// Where someone is talking, heard from the audio. Pauses are the time between these runs, not between
    /// words: word times are coarse, and speech the recognizer missed has no word at all.
    pub speech: Vec<Span>,
    pub seconds: f64,
}

/// Millisecond precision: enough for cuts, and no f32 noise like 0.4000000059604645.
fn ms(t: f64) -> f64 {
    (t * 1000.0).round() / 1000.0
}

fn shift(tokens: Vec<Token>, offset: f64) -> Vec<Token> {
    tokens.into_iter().map(|t| Token { s: ms(offset + t.s), e: ms(offset + t.e), ..t }).collect()
}

/// The pipeline without I/O: cut the talking in `speech` into pieces, recognize each, put the words on the
/// file's clock. `progress(pieces done, pieces total)`.
pub fn transcribe_samples(
    rec: &mut dyn SpeechRecognizer,
    samples: &[f32],
    speech: &[Span],
    mut progress: impl FnMut(usize, usize),
) -> Result<Transcript, AppError> {
    let pieces = pieces::plan(speech, samples.len());
    let mut words = Vec::new();
    for (k, p) in pieces.iter().enumerate() {
        progress(k, pieces.len());
        let tokens = shift(rec.recognize(&samples[p.a..p.b])?, p.a as f64 / RATE as f64);
        words.extend(merge_tokens(&tokens).into_iter().filter(|w| p.keeps(w.s)));
    }
    progress(pieces.len(), pieces.len());
    let text = words.iter().map(|w| w.w.as_str()).collect::<Vec<_>>().join(" ");
    let speech = speech.iter().map(|r| Span { s: ms(r.s), e: ms(r.e) }).collect();
    Ok(Transcript { text, words, speech, seconds: samples.len() as f64 / RATE as f64 })
}

/// The real thing: bundled ffmpeg + Silero + Parakeet, Mac kept awake until done. `trace` tags the log lines.
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
        let speech = vad::speech(&samples)?;
        parakeet::with_model(model, |p| transcribe_samples(p, &samples, &speech, progress))
    })();
    match &result {
        Ok(t) => log::info(
            "transcribe",
            trace,
            format!("done: {} words, {} speech runs, {:.1} s", t.words.len(), t.speech.len(), t.seconds),
        ),
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

    /// A recording of `seconds` where word n (from 1) is said over `words[n - 1]`: its samples carry n as their
    /// value, silence is 0. `Marked` hears exactly those words, so a word lost, doubled or clipped by how the
    /// recording was cut shows up as a missing, repeated or shifted "w<n>".
    pub fn spoken(seconds: f64, words: &[Span]) -> Vec<f32> {
        let mut out = vec![0.0; (seconds * RATE as f64) as usize];
        for (n, w) in words.iter().enumerate() {
            out[(w.s * RATE as f64) as usize..(w.e * RATE as f64) as usize].fill((n + 1) as f32);
        }
        out
    }

    pub struct Marked;

    impl SpeechRecognizer for Marked {
        fn recognize(&mut self, samples: &[f32]) -> Result<Vec<Token>, AppError> {
            let mut tokens = Vec::new();
            let mut i = 0;
            while i < samples.len() {
                let (n, from) = (samples[i], i);
                while i < samples.len() && samples[i] == n {
                    i += 1;
                }
                let t = |j: usize| j as f64 / RATE as f64;
                if n > 0.0 {
                    tokens.push(Token { text: format!("▁w{n}"), s: t(from), e: t(i) });
                }
            }
            Ok(tokens)
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
    use super::fake::{ffmpeg, spoken, Broken, Marked};
    use super::*;
    use std::path::PathBuf;
    use std::process::Command;
    use std::time::Instant;

    const S: usize = RATE;

    fn span(s: f64, e: f64) -> Span {
        Span { s, e }
    }

    /// 100 words, one a second: word n over [n - 0.8, n - 0.3).
    fn hundred_words() -> Vec<Span> {
        (0..100).map(|k| span(k as f64 + 0.2, k as f64 + 0.7)).collect()
    }

    fn heard_once_at_file_time(t: &Transcript, said: &[Span]) {
        let got: Vec<_> = t.words.iter().map(|w| (w.w.clone(), w.s, w.e)).collect();
        let want: Vec<_> = said.iter().enumerate().map(|(n, w)| (format!("w{}", n + 1), ms(w.s), ms(w.e))).collect();
        assert_eq!(got, want, "every word once, whole, at its time in the file");
    }

    #[test]
    fn words_are_heard_through_pieces_cut_in_the_silences() {
        let said = hundred_words();
        // Ten runs of talking with 0.5 s between them: pieces of three runs each.
        let speech: Vec<Span> = (0..10).map(|k| span(10.0 * k as f64 + 0.2, 10.0 * k as f64 + 9.7)).collect();
        let t = transcribe_samples(&mut Marked, &spoken(101.0, &said), &speech, |_, _| {}).unwrap();
        heard_once_at_file_time(&t, &said);
        assert_eq!((t.seconds, t.speech.len()), (101.0, 10), "the speech runs ride along");
        assert!(t.text.starts_with("w1 w2 w3"));
    }

    #[test]
    fn talking_without_a_pause_is_heard_across_window_seams() {
        let said = hundred_words();
        let t = transcribe_samples(&mut Marked, &spoken(101.0, &said), &[span(0.2, 99.7)], |_, _| {}).unwrap();
        heard_once_at_file_time(&t, &said);
    }

    #[test]
    fn progress_counts_every_piece_then_finishes() {
        let said = hundred_words();
        let speech = [span(0.2, 9.7), span(40.2, 49.7), span(80.2, 89.7)];
        let mut seen = Vec::new();
        transcribe_samples(&mut Marked, &spoken(101.0, &said), &speech, |d, n| seen.push((d, n))).unwrap();
        assert_eq!(seen, [(0, 3), (1, 3), (2, 3), (3, 3)]);
    }

    #[test]
    fn where_nobody_talks_nothing_is_sent_to_the_recognizer() {
        let t = transcribe_samples(&mut Broken, &vec![0.0; 5 * S], &[], |_, _| {}).unwrap();
        assert_eq!((t.words.len(), t.seconds), (0, 5.0));
        let t = transcribe_samples(&mut Broken, &[], &[], |_, _| {}).unwrap();
        assert_eq!((t.words.len(), t.seconds), (0, 0.0));
    }

    #[test]
    fn a_recognizer_failure_reaches_the_caller() {
        let err = transcribe_samples(&mut Broken, &vec![0.0; 5 * S], &[span(1.0, 2.0)], |_, _| {}).unwrap_err();
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
    fn live_long_recording_is_heard_piece_by_piece() {
        let Some(wav) = sample() else { return println!("# skipped: model not downloaded") };
        let once = run(&wav).words.len();
        // 60 copies of the 3.9 s clip back to back ≈ 3.9 min: many pieces, cut where the copies meet.
        let copies = 60;
        let long = tmp("long.wav");
        ff(&["-stream_loop", &(copies - 1).to_string(), "-i", wav.to_str().unwrap(), long.to_str().unwrap()]);
        let t = run(&long);
        check_times(&t.words);
        let expected = once * copies;
        let diff = (t.words.len() as f64 - expected as f64).abs() / expected as f64;
        assert!(diff < 0.05, "no words lost or doubled between pieces: {} words, expected about {expected}", t.words.len());
        let unheard: Vec<_> =
            t.speech.iter().filter(|r| r.e - r.s >= 0.5 && !t.words.iter().any(|w| w.s < r.e && r.s < w.e)).collect();
        assert!(unheard.is_empty(), "every half second of talking has a word on it: {unheard:?}");
    }
}
