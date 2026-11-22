//! Where someone is talking, as runs of seconds. Pauses are the time between runs (src/ui/pauses.js), and
//! transcription is cut into pieces in the silences between them (`pieces.rs`). Pure: the speech
//! probabilities come from `vad.rs`.

use serde::{Deserialize, Serialize};

/// Silero's own defaults (its get_speech_timestamps): talking starts at 0.5 and lasts until below 0.35.
const START: f32 = 0.5;
const END: f32 = 0.35;
/// A hole shorter than this is a breath between syllables, not a pause.
const BRIDGE_S: f64 = 0.15;

/// One stretch of talking, seconds from the start of the recording.
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
pub struct Span {
    pub s: f64,
    pub e: f64,
}

/// `probs[i]` = chance of speech in window i, each `hop` s long; `length` = the recording's seconds.
pub fn runs(probs: &[f32], hop: f64, length: f64) -> Vec<Span> {
    let mut out: Vec<Span> = Vec::new();
    let mut talking = false;
    let mut start = 0;
    for (i, &p) in probs.iter().chain([&0.0]).enumerate() {
        let now = if talking { p >= END } else { p >= START };
        match (talking, now) {
            (false, true) => start = i,
            (true, false) => push(&mut out, Span { s: start as f64 * hop, e: (i as f64 * hop).min(length) }),
            _ => {}
        }
        talking = now;
    }
    out
}

fn push(out: &mut Vec<Span>, run: Span) {
    match out.last_mut() {
        Some(last) if run.s - last.e < BRIDGE_S => last.e = run.e,
        _ => out.push(run),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const HOP: f64 = 0.1;

    fn span(s: f64, e: f64) -> Span {
        Span { s, e }
    }

    fn close(a: &[Span], b: &[Span]) -> bool {
        a.len() == b.len() && a.iter().zip(b).all(|(x, y)| (x.s - y.s).abs() < 1e-9 && (x.e - y.e).abs() < 1e-9)
    }

    #[test]
    fn no_talking_gives_no_runs() {
        assert!(runs(&[0.1; 50], HOP, 5.0).is_empty());
        assert!(runs(&[], HOP, 0.0).is_empty());
    }

    #[test]
    fn talking_starts_at_half_and_holds_until_it_drops_below_035() {
        let r = runs(&[0.1, 0.6, 0.4, 0.36, 0.2, 0.2, 0.2, 0.45, 0.1], HOP, 1.0);
        assert!(close(&r, &[span(0.1, 0.4)]), "{r:?}: 0.45 alone never starts talking");
    }

    #[test]
    fn a_short_hole_stays_talking_a_longer_one_is_a_pause() {
        let r = runs(&[0.9, 0.9, 0.1, 0.9, 0.9, 0.1, 0.1, 0.9], HOP, 1.0);
        assert!(close(&r, &[span(0.0, 0.5), span(0.7, 0.8)]), "{r:?}");
    }

    #[test]
    fn talking_to_the_end_stops_at_the_recordings_length() {
        // The last window runs past the end of the samples.
        let r = runs(&[0.1, 0.9, 0.9], HOP, 0.25);
        assert!(close(&r, &[span(0.1, 0.25)]), "{r:?}");
    }
}
