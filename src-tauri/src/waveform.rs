//! The timeline's waveform: one loudness peak per 1/100 s, 0‥255, from the bundled ffmpeg.
//! Decoded at a low rate (peaks don't need detail), straight from stdout like the transcript audio.

use crate::audio;
use crate::error::AppError;
use serde::Serialize;
use std::path::Path;

pub const PER_SECOND: usize = 100;
const RATE: usize = 8_000;

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Waveform {
    pub per_second: usize,
    pub seconds: f64,
    pub peaks: Vec<u8>,
}

/// The loudest sample in each 1/100 s, scaled to 0‥255.
pub fn peaks(samples: &[f32], rate: usize) -> Vec<u8> {
    let step = (rate / PER_SECOND).max(1);
    samples
        .chunks(step)
        .map(|c| (c.iter().fold(0f32, |m, s| m.max(s.abs())).min(1.0) * 255.0).round() as u8)
        .collect()
}

pub fn of_file(ffmpeg: &Path, input: &Path) -> Result<Waveform, AppError> {
    let samples = audio::decode_at(ffmpeg, input, RATE)?;
    Ok(Waveform { per_second: PER_SECOND, seconds: samples.len() as f64 / RATE as f64, peaks: peaks(&samples, RATE) })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn one_peak_per_hundredth_of_a_second() {
        assert_eq!(peaks(&vec![0.0; RATE * 3], RATE).len(), 300);
        assert_eq!(peaks(&vec![0.0; RATE * 3 + 10], RATE).len(), 301, "a last partial step still counts");
    }

    #[test]
    fn silence_is_zero_and_a_full_tone_is_full() {
        assert!(peaks(&vec![0.0; RATE], RATE).iter().all(|&p| p == 0));
        let tone: Vec<f32> = (0..RATE).map(|i| (i as f32 * 0.3).sin()).collect();
        assert!(peaks(&tone, RATE).iter().all(|&p| p >= 250), "{:?}", &peaks(&tone, RATE)[..5]);
    }

    #[test]
    fn clipping_stays_in_range() {
        assert_eq!(peaks(&[2.0, -3.0], RATE), vec![255]);
    }

    #[test]
    fn a_missing_file_gives_the_plain_error() {
        let ffmpeg = audio::bundled_ffmpeg();
        if !ffmpeg.exists() {
            return; // only where prepare-bins has put ffmpeg next to the test binary
        }
        let err = of_file(&ffmpeg, Path::new("/nope/missing.mov")).unwrap_err();
        assert!(matches!(err, AppError::Unreadable { .. }), "{err}");
    }
}
