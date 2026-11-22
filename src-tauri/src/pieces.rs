//! What Parakeet hears at a time: pieces of up to 30 s, cut in the silences between speech runs.
//! Fed whole 120 s chunks it dropped whole sentences; short pieces cut at silences fixed most of that
//! (updates/2026-11-22 AUDIO PAUSES - OPEN/wiki.md). Silence between pieces is never sent: nobody talks there.
//! Pure: sample ranges in, sample ranges out.

use crate::audio::RATE;
use crate::speech::Span;

const MAX_S: f64 = 30.0;
/// Heard on each side of a piece so a word's first and last sound aren't clipped.
const PAD_S: f64 = 0.25;
/// Talking longer than MAX_S without a pause has no silence to cut in: it is heard in overlapping
/// windows, and each word is kept from the window whose share (cut at the overlap's middle) it starts in.
const OVERLAP_S: f64 = 5.0;

/// Samples [a, b) of the recording, and the start times (s) of the words kept from them: [lo, hi).
#[derive(Debug, Clone, PartialEq)]
pub struct Piece {
    pub a: usize,
    pub b: usize,
    pub lo: f64,
    pub hi: f64,
}

impl Piece {
    pub fn keeps(&self, start: f64) -> bool {
        self.lo <= start && start < self.hi
    }
}

/// The pieces for a recording of `n` samples with talking in `speech` (in time order).
pub fn plan(speech: &[Span], n: usize) -> Vec<Piece> {
    let length = n as f64 / RATE as f64;
    let groups = join(speech);
    let mut pieces = Vec::new();
    for (k, g) in groups.iter().enumerate() {
        let before = if k == 0 { 0.0 } else { (groups[k - 1].e + g.s) / 2.0 };
        let after = groups.get(k + 1).map_or(length, |next| (g.e + next.s) / 2.0);
        let padded = Span { s: (g.s - PAD_S).max(before), e: (g.e + PAD_S).min(after) };
        pieces.extend(windows(padded).into_iter().map(|w| to_samples(w, n)));
    }
    pieces
}

/// Runs joined while the whole stays within MAX_S. Only a single long run can be longer.
fn join(speech: &[Span]) -> Vec<Span> {
    let mut groups: Vec<Span> = Vec::new();
    for run in speech {
        match groups.last_mut() {
            Some(g) if run.e - g.s <= MAX_S => g.e = run.e,
            _ => groups.push(*run),
        }
    }
    groups
}

/// [s, e) as one window, or as overlapping windows of MAX_S when longer. (s, e, lo, hi) in seconds.
fn windows(span: Span) -> Vec<(f64, f64, f64, f64)> {
    let mut out = Vec::new();
    let mut s = span.s;
    loop {
        let e = (s + MAX_S).min(span.e);
        let lo = if out.is_empty() { f64::NEG_INFINITY } else { s + OVERLAP_S / 2.0 };
        let last = e >= span.e;
        out.push((s, e, lo, if last { f64::INFINITY } else { e - OVERLAP_S / 2.0 }));
        if last {
            return out;
        }
        s = e - OVERLAP_S;
    }
}

fn to_samples((s, e, lo, hi): (f64, f64, f64, f64), n: usize) -> Piece {
    let at = |t: f64| ((t * RATE as f64).round() as usize).min(n);
    Piece { a: at(s), b: at(e), lo, hi }
}

#[cfg(test)]
mod tests {
    use super::*;

    const S: usize = RATE;

    fn span(s: f64, e: f64) -> Span {
        Span { s, e }
    }

    fn secs(p: &Piece) -> (f64, f64) {
        (p.a as f64 / S as f64, p.b as f64 / S as f64)
    }

    #[test]
    fn no_talking_means_nothing_to_hear() {
        assert!(plan(&[], 60 * S).is_empty());
    }

    #[test]
    fn runs_join_into_pieces_of_at_most_30_s_cut_in_the_silence() {
        let speech = [span(1.0, 10.0), span(12.0, 25.0), span(25.3, 40.0), span(41.0, 50.0)];
        let p = plan(&speech, 60 * S);
        // Padded 0.25 s, except into a 0.3 s gap: there both stop at its middle.
        assert_eq!(p.iter().map(secs).collect::<Vec<_>>(), [(0.75, 25.15), (25.15, 50.25)]);
        assert!(p.iter().all(|p| p.keeps(0.0) && p.keeps(1e9)), "pieces don't overlap: every word is kept");
    }

    #[test]
    fn padding_stops_at_the_recordings_ends() {
        let p = plan(&[span(0.1, 4.9)], 5 * S);
        assert_eq!(secs(&p[0]), (0.0, 5.0));
    }

    #[test]
    fn a_long_run_is_heard_in_overlapping_windows_whose_shares_meet() {
        let p = plan(&[span(10.0, 80.0)], 90 * S);
        assert_eq!(p.iter().map(secs).collect::<Vec<_>>(), [(9.75, 39.75), (34.75, 64.75), (59.75, 80.25)]);
        assert_eq!((p[0].lo, p[2].hi), (f64::NEG_INFINITY, f64::INFINITY));
        for w in p.windows(2) {
            assert_eq!(w[0].hi, w[1].lo, "each start time belongs to exactly one window");
        }
    }

    #[test]
    fn a_short_run_after_a_long_one_gets_its_own_piece() {
        let p = plan(&[span(0.0, 31.0), span(32.0, 33.0)], 40 * S);
        assert_eq!(p.len(), 3);
        assert_eq!(secs(&p[2]), (31.75, 33.25));
    }
}
