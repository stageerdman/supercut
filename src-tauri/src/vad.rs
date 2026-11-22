//! Hears where someone is talking: Silero VAD v5 (MIT licence, github.com/snakers4/silero-vad v5.1.2,
//! `models/silero_vad.onnx`, 2.3 MB, built into the binary) on the ONNX Runtime that Parakeet already brings.
//! Unlike loudness, it tells talking apart from room sound, movement and breaths.
//! Why Silero: updates/2026-11-22 AUDIO PAUSES - OPEN/wiki.md.

use crate::audio::RATE;
use crate::error::AppError;
use crate::onnx;
use crate::speech::{self, Span};
use parakeet_rs::ort::session::Session;
use parakeet_rs::ort::value::Tensor;

static MODEL: &[u8] = include_bytes!("../models/silero_vad.onnx");

/// v5 at 16 kHz: 32 ms windows, each heard with the 64 samples before it.
const WINDOW: usize = 512;
const CONTEXT: usize = 64;
const STATE: [usize; 3] = [2, 1, 128];

/// The talking in 16 kHz mono samples, as runs of seconds.
pub fn speech(samples: &[f32]) -> Result<Vec<Span>, AppError> {
    let probs = probabilities(samples)?;
    Ok(speech::runs(&probs, WINDOW as f64 / RATE as f64, samples.len() as f64 / RATE as f64))
}

fn err(e: impl std::fmt::Display) -> AppError {
    AppError::Vad(e.to_string())
}

/// One chance of speech per window. The last, short window is padded with silence.
fn probabilities(samples: &[f32]) -> Result<Vec<f32>, AppError> {
    let env = onnx::environment().map_err(err)?;
    let mut session = Session::builder(env).map_err(err)?.commit_from_memory(MODEL).map_err(err)?;
    let mut state = vec![0f32; STATE.iter().product()];
    let mut probs = Vec::with_capacity(samples.len() / WINDOW + 1);
    for at in (0..samples.len()).step_by(WINDOW) {
        let out = session
            .run(parakeet_rs::ort::inputs![
                "input" => Tensor::from_array(([1, CONTEXT + WINDOW], window(samples, at))).map_err(err)?,
                "state" => Tensor::from_array((STATE, state)).map_err(err)?,
                "sr" => Tensor::from_array(([0usize; 0], vec![RATE as i64])).map_err(err)?,
            ])
            .map_err(err)?;
        probs.push(out["output"].try_extract_tensor::<f32>().map_err(err)?.1[0]);
        state = out["stateN"].try_extract_tensor::<f32>().map_err(err)?.1.to_vec();
    }
    Ok(probs)
}

/// The model's input at sample `at`: CONTEXT samples before it (zeros at the start), then WINDOW samples.
fn window(samples: &[f32], at: usize) -> Vec<f32> {
    let mut buf = vec![0f32; CONTEXT + WINDOW];
    let from = at.saturating_sub(CONTEXT);
    buf[CONTEXT - (at - from)..CONTEXT].copy_from_slice(&samples[from..at]);
    let to = (at + WINDOW).min(samples.len());
    buf[CONTEXT..CONTEXT + to - at].copy_from_slice(&samples[at..to]);
    buf
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::transcribe::fake::ffmpeg;
    use std::path::Path;

    fn tone(seconds: f64, hz: f64) -> Vec<f32> {
        (0..(seconds * RATE as f64) as usize).map(|i| 0.3 * (i as f64 * hz * std::f64::consts::TAU / RATE as f64).sin() as f32).collect()
    }

    #[test]
    fn a_window_carries_the_samples_before_it() {
        let s: Vec<f32> = (0..1000).map(|i| i as f32).collect();
        let first = window(&s, 0);
        assert_eq!((first[CONTEXT - 1], first[CONTEXT]), (0.0, 0.0));
        let second = window(&s, WINDOW);
        assert_eq!((second[0], second[CONTEXT], second[CONTEXT + 487]), (448.0, 512.0, 999.0));
        assert_eq!(*second.last().unwrap(), 0.0, "past the end is silence");
    }

    #[test]
    fn silence_and_a_tone_are_not_talking() {
        assert_eq!(speech(&vec![0.0; 3 * RATE]), Ok(vec![]));
        assert_eq!(speech(&tone(3.0, 440.0)), Ok(vec![]));
        assert_eq!(speech(&[]), Ok(vec![]));
    }

    /// Real speech: the sample clip from `npm run fetch-model`, with 2 s of silence on each side.
    #[test]
    fn live_speech_is_heard_and_the_silence_around_it_is_not() {
        let wav = Path::new(env!("CARGO_MANIFEST_DIR")).join("../models/en.wav");
        if !wav.is_file() {
            return println!("# skipped: models/en.wav missing (npm run fetch-model)");
        }
        let clip = crate::audio::decode(&ffmpeg(), &wav).unwrap();
        let pad = vec![0.0; 2 * RATE];
        let samples = [&pad[..], &clip, &pad].concat();
        let runs = speech(&samples).unwrap();
        println!("# speech runs: {runs:?}");
        let len = samples.len() as f64 / RATE as f64;
        assert!(!runs.is_empty());
        assert!(runs[0].s >= 1.9 && runs.last().unwrap().e <= len - 1.9, "the silences stay silent: {runs:?}");
        let talking: f64 = runs.iter().map(|r| r.e - r.s).sum();
        assert!(talking > 0.6 * (clip.len() as f64 / RATE as f64), "most of the clip is talking: {talking:.2} s");
    }
}
