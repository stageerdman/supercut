//! Where a second recording of the same sound lines up with the video's own, pure.
//! Both become onset curves (how fast the loudness rises, every 5 ms): two mics differ in gain and tone, but a
//! syllable or a clap starts at the same moment in both. One FFT cross-correlation over the whole length finds the
//! lag to 5 ms; the waveforms around it refine it to one sample. Why: updates/2026-11-24 BETTER AUDIO SWAP - OPEN.

use rustfft::{num_complex::Complex, FftPlanner};

/// The rate both sounds are decoded at for the search: onsets need no more, and an hour stays ~115 MB.
pub const RATE: usize = 8_000;
const HOP: usize = RATE / 200;
/// A rise above this many nats is just "a strong start" (digital silence → sound must not outweigh speech).
const MAX_RISE: f32 = 4.0;
/// How alike the onset curves must be at the best lag (Pearson) to call it a match.
const MIN_LIKENESS: f32 = 0.2;
/// How far the best lag must beat the best rival lag (one more than 100 ms away).
const MIN_LEAD: f32 = 1.3;
const RIVAL_GAP: usize = 20;
/// The waveform stretch the fine search compares (the middle of the overlap).
const FINE_WINDOW: usize = 60 * RATE;

/// Seconds into the video where the recording's first sample lands (negative: it began before the video), or
/// None when nothing in it clearly matches the video's sound. Both at `RATE`.
pub fn offset(video: &[f32], recording: &[f32]) -> Option<f64> {
    let lag = coarse(&onsets(video), &onsets(recording))?;
    Some(fine(video, recording, lag * HOP as i64) as f64 / RATE as f64)
}

/// The loudness rise every HOP samples, zero-mean: what both mics agree on.
fn onsets(x: &[f32]) -> Vec<f32> {
    let level: Vec<f32> = x.chunks(HOP).map(|c| (1e-7 + c.iter().map(|s| s * s).sum::<f32>() / c.len() as f32).ln()).collect();
    let mut rise: Vec<f32> = std::iter::once(0.0).chain(level.windows(2).map(|w| (w[1] - w[0]).clamp(0.0, MAX_RISE))).collect();
    let mean = rise.iter().sum::<f32>() / rise.len().max(1) as f32;
    rise.iter_mut().for_each(|r| *r -= mean);
    rise
}

/// Every lag's score: index i is the lag `i - (b.len() - 1)`, where b[j] lands on a[j + lag].
fn correlate(a: &[f32], b: &[f32]) -> Vec<f32> {
    let n = (a.len() + b.len()).next_power_of_two();
    let mut planner = FftPlanner::<f32>::new();
    let (forward, inverse) = (planner.plan_fft_forward(n), planner.plan_fft_inverse(n));
    let padded = |x: &[f32]| {
        let mut v: Vec<Complex<f32>> = x.iter().map(|&r| Complex::new(r, 0.0)).collect();
        v.resize(n, Complex::new(0.0, 0.0));
        forward.process(&mut v);
        v
    };
    let (fa, fb) = (padded(a), padded(b));
    let mut r: Vec<Complex<f32>> = fa.iter().zip(&fb).map(|(x, y)| x * y.conj()).collect();
    inverse.process(&mut r);
    let at = |lag: i64| r[lag.rem_euclid(n as i64) as usize].re / n as f32;
    (-(b.len() as i64 - 1)..a.len() as i64).map(at).collect()
}

/// The lag (in hops) where the onset curves agree, if they clearly do.
fn coarse(a: &[f32], b: &[f32]) -> Option<i64> {
    if a.is_empty() || b.is_empty() {
        return None;
    }
    let scores = correlate(a, b);
    let best = (0..scores.len()).max_by(|&i, &j| scores[i].total_cmp(&scores[j]))?;
    let lag = best as i64 - (b.len() as i64 - 1);
    let rival = scores.iter().enumerate().filter(|(i, _)| i.abs_diff(best) > RIVAL_GAP).map(|(_, &s)| s).fold(0f32, f32::max);
    let lead = if rival > 0.0 { scores[best] / rival } else { f32::INFINITY };
    let like = scores[best] / overlap_energy(a, b, lag).sqrt().max(f32::MIN_POSITIVE);
    (like >= MIN_LIKENESS && lead >= MIN_LEAD).then_some(lag)
}

/// √ of (a's energy × b's energy) over the samples that overlap when b is shifted by `lag`.
fn overlap_energy(a: &[f32], b: &[f32], lag: i64) -> f32 {
    let (from, to) = (lag.max(0) as usize, (b.len() as i64 + lag).min(a.len() as i64).max(0) as usize);
    if from >= to {
        return 0.0;
    }
    let ea: f32 = a[from..to].iter().map(|x| x * x).sum();
    let eb: f32 = b[(from as i64 - lag) as usize..(to as i64 - lag) as usize].iter().map(|x| x * x).sum();
    ea * eb
}

/// The sample lag within two hops of `guess` where the waveforms agree best (either polarity: a mic may be wired
/// the other way round).
fn fine(a: &[f32], b: &[f32], guess: i64) -> i64 {
    let reach = 2 * HOP as i64;
    let (from, to) = (guess.max(0), (b.len() as i64 + guess).min(a.len() as i64));
    let mid = (from + to) / 2;
    let half = (FINE_WINDOW as i64 / 2).min((to - from) / 2);
    let window = (mid - half, mid + half);
    let score = |lag: i64| {
        let (s, e) = (window.0.max(lag).max(0), window.1.min(b.len() as i64 + lag).min(a.len() as i64));
        (s..e).map(|t| a[t as usize] * b[(t - lag) as usize]).sum::<f32>().abs()
    };
    (guess - reach..=guess + reach).max_by(|&x, &y| score(x).total_cmp(&score(y))).unwrap_or(guess)
}

#[cfg(test)]
pub mod tests {
    use super::*;

    /// A tiny deterministic random source, so every run hears the same "speech".
    pub struct Noise(u64);
    impl Noise {
        pub fn new(seed: u64) -> Self {
            Self(seed.wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1)
        }
        pub fn next(&mut self) -> f32 {
            self.0 ^= self.0 << 13;
            self.0 ^= self.0 >> 7;
            self.0 ^= self.0 << 17;
            (self.0 >> 40) as f32 / (1u64 << 24) as f32
        }
        fn between(&mut self, lo: f32, hi: f32) -> f32 {
            lo + (hi - lo) * self.next()
        }
    }

    /// Speech-like sound: syllables (a voiced hum with breath) of 80–250 ms, gaps of 40–400 ms, now and then a pause.
    pub fn speech(seed: u64, seconds: f32) -> Vec<f32> {
        let mut rng = Noise::new(seed);
        let mut out = Vec::new();
        while out.len() < (seconds * RATE as f32) as usize {
            let (len, loud, pitch) = ((rng.between(0.08, 0.25) * RATE as f32) as usize, rng.between(0.2, 0.8), rng.between(100.0, 220.0));
            for k in 0..len {
                let (t, hump) = (k as f32 / RATE as f32, (std::f32::consts::PI * k as f32 / len as f32).sin());
                let voice: f32 = (1..=5).map(|h| (std::f32::consts::TAU * pitch * h as f32 * t).sin() / h as f32).sum();
                out.push(loud * hump * (0.6 * voice + 0.3 * (rng.next() - 0.5)));
            }
            let gap = if rng.next() < 0.1 { rng.between(0.6, 1.2) } else { rng.between(0.04, 0.4) };
            out.extend(std::iter::repeat(0.0).take((gap * RATE as f32) as usize));
        }
        out
    }

    /// The same sound through another mic: its own gain, a duller tone, and its own room hiss.
    pub fn other_mic(x: &[f32], gain: f32, dull: f32, hiss: f32, seed: u64) -> Vec<f32> {
        let mut rng = Noise::new(seed);
        let mut y = 0.0;
        x.iter().map(|&s| {
            y += dull * (s - y);
            gain * y + hiss * (rng.next() - 0.5)
        }).collect()
    }

    fn seconds(s: f64) -> usize {
        (s * RATE as f64) as usize
    }

    /// The video hears `sound[v0..v0+vl]` through its mic; the recorder `sound[r0..r0+rl]` through a better one.
    fn pair(sound: &[f32], (v0, vl): (f64, f64), (r0, rl): (f64, f64)) -> (Vec<f32>, Vec<f32>) {
        let video = other_mic(&sound[seconds(v0)..seconds(v0 + vl)], 0.5, 0.35, 0.05, 1);
        let rec = other_mic(&sound[seconds(r0)..seconds(r0 + rl)], 1.2, 0.9, 0.004, 2);
        (video, rec)
    }

    fn assert_near(found: Option<f64>, want: f64) {
        let got = found.unwrap_or_else(|| panic!("no match, want {want}"));
        assert!((got - want).abs() < 0.002, "found {got:.4} s, want {want:.4} s");
    }

    #[test]
    fn a_recorder_started_after_the_camera_lands_later_in_the_video() {
        let sound = speech(7, 100.0);
        let (video, rec) = pair(&sound, (0.0, 60.0), (2.345, 70.0));
        assert_near(offset(&video, &rec), 2.345);
    }

    #[test]
    fn a_recorder_started_before_the_camera_lands_before_the_video() {
        let sound = speech(8, 100.0);
        let (video, rec) = pair(&sound, (5.5, 40.0), (0.0, 30.0));
        assert_near(offset(&video, &rec), -5.5);
    }

    #[test]
    fn a_clap_at_the_start_is_enough() {
        let mut sound = vec![0.0; seconds(1.0)];
        let mut rng = Noise::new(3);
        sound.extend((0..seconds(0.03)).map(|k| (rng.next() - 0.5) * 1.8 * (-(k as f32) / 60.0).exp()));
        sound.extend(vec![0.0; seconds(1.5)]);
        sound.extend(speech(9, 1.0));
        sound.extend(vec![0.0; seconds(4.0)]);
        let (video, rec) = pair(&sound, (0.3, 6.0), (0.0, 7.0));
        assert_near(offset(&video, &rec), -0.3);
    }

    #[test]
    fn a_different_recording_is_no_match() {
        let (video, _) = pair(&speech(10, 40.0), (0.0, 40.0), (0.0, 1.0));
        let (_, rec) = pair(&speech(11, 40.0), (0.0, 1.0), (0.0, 40.0));
        assert_eq!(offset(&video, &rec), None);
        assert_eq!(offset(&vec![0.0; seconds(10.0)], &rec), None, "a silent video");
        assert_eq!(offset(&[], &rec), None);
    }
}
