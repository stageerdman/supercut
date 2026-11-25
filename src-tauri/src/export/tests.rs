//! The engine against a real ffmpeg: a source whose frame i is gray at brightness 4i under a steady tone, so the
//! output shows which source frame each of its frames is, and whether a join clicks.

use super::*;
use crate::testkit::{ffmpeg, ffmpeg_ok, lengths, temp_dir};
use std::sync::OnceLock;

const SIDE: usize = 64;
const FRAMES: usize = 60;
const RATE: usize = 30;
/// Sound samples per frame, at 48 kHz.
const PER_FRAME: usize = 48000 / RATE;

/// 2 s at 30 fps, frame i at brightness 4i, keyframes every 10 frames (so a seek must decode up to its frame), a
/// 440 Hz tone as PCM.
fn source(ff: &Path, dir: &Path) -> PathBuf {
    std::fs::create_dir_all(dir).unwrap();
    let raw = dir.join("frames.gray");
    let bytes: Vec<u8> = (0..FRAMES).flat_map(|i| std::iter::repeat_n((4 * i) as u8, SIDE * SIDE)).collect();
    std::fs::write(&raw, bytes).unwrap();
    let file = dir.join("a.mov");
    let (size, rate) = (format!("{SIDE}x{SIDE}"), RATE.to_string());
    ffmpeg_ok(ff, &[
        "-f", "rawvideo", "-pix_fmt", "gray", "-s", &size, "-r", &rate, "-i", raw.to_str().unwrap(),
        "-f", "lavfi", "-i", "sine=frequency=440:duration=2:sample_rate=48000",
        "-c:v", "libx264", "-qp", "0", "-g", "10", "-pix_fmt", "yuv420p", "-c:a", "pcm_s16le", "-shortest",
        file.to_str().unwrap(),
    ]);
    file
}

fn span(path: &Path, s: f64, e: f64) -> Span {
    Span { part: 1, path: path.to_path_buf(), s, e }
}

/// Edges off the frame grid on purpose: 0..15, 31..36 and 18..27 once snapped; 29 frames in all.
fn edit(a: &Path) -> Vec<Span> {
    vec![span(a, 0.01, 0.49), span(a, 1.02, 1.21), span(a, 0.6, 0.9)]
}

fn kept_frames() -> Vec<usize> {
    (0..15).chain(31..36).chain(18..27).collect()
}

/// Decodes `file` as `args` say (raw format and options) and returns the bytes.
fn decode(ff: &Path, file: &Path, dir: &Path, args: &[&str]) -> Vec<u8> {
    let raw = dir.join("decoded.raw");
    let mut all = vec!["-i", file.to_str().unwrap()];
    all.extend(args);
    all.push(raw.to_str().unwrap());
    ffmpeg_ok(ff, &all);
    std::fs::read(raw).unwrap()
}

fn run(ff: &Path, spans: &[Span], out: &Path, format: Format, work: &Path) -> Result<Exported, AppError> {
    Exports::default().run(&Job { ffmpeg: ff, spans, out, format }, work, &|_, _| {}, "test")
}

#[test]
fn bad_spans_or_an_extension_that_does_not_fit_are_refused_before_anything_is_written() {
    let d = temp_dir("export-bad");
    let ff = Path::new("/nope/ffmpeg");
    let a = Path::new("/a.mov");
    let refused = |spans: &[Span], out: &str, format| matches!(run(ff, spans, Path::new(out), format, &d), Err(AppError::Export(_)));
    assert!(refused(&[], "/o.mp4", Format::Mp4));
    assert!(refused(&[span(a, 2.0, 2.0)], "/o.mp4", Format::Mp4));
    assert!(refused(&[span(a, 0.0, 1.0)], "/o.mp4", Format::Prores));
    assert!(!d.exists(), "nothing written");
}

#[test]
fn the_export_keeps_exactly_the_kept_frames_with_sound_the_same_length_and_no_click_at_a_join() {
    let Some(ff) = ffmpeg() else { return };
    let d = temp_dir("export-mp4");
    let a = source(&ff, &d.join("src"));
    let out = d.join("Talk.mp4");
    let seen = std::sync::Mutex::new(Vec::new());
    let job = Job { ffmpeg: &ff, spans: &edit(&a), out: &out, format: Format::Mp4 };
    let x = Exports::default().run(&job, &d.join("work"), &|done, total| seen.lock().unwrap().push((done, total)), "test").unwrap();

    assert_eq!((x.frames, x.file.clone()), (29, out.clone()));
    assert!((x.seconds - 29.0 / 30.0).abs() < 1e-9);
    let (v, s) = lengths(&ff, &out);
    assert!((v - x.seconds).abs() < 0.04 && (s - x.seconds).abs() < 0.04, "picture {v} s, sound {s} s, kept {} s", x.seconds);

    let seen = seen.into_inner().unwrap();
    assert_eq!((seen.first(), seen.last()), (Some(&(0, 29)), Some(&(29, 29))), "{seen:?}");
    assert!(seen.windows(2).all(|w| w[0].0 <= w[1].0), "progress never goes back: {seen:?}");

    let picture = decode(&ff, &out, &d, &["-f", "rawvideo", "-pix_fmt", "gray"]);
    let means: Vec<f64> = picture.chunks(SIDE * SIDE).map(|f| f.iter().map(|&b| b as f64).sum::<f64>() / f.len() as f64).collect();
    let want = kept_frames();
    assert_eq!(means.len(), want.len());
    for (i, (got, src)) in means.iter().zip(&want).enumerate() {
        assert!((got - 4.0 * *src as f64).abs() < 1.5, "output frame {i} should be source frame {src} (brightness {}), is {got:.1}", 4 * src);
    }

    let sound: Vec<i16> = decode(&ff, &out, &d, &["-f", "s16le", "-ac", "1", "-ar", "48000"]).chunks(2).map(|b| i16::from_le_bytes([b[0], b[1]])).collect();
    let peak = sound.iter().map(|x| x.unsigned_abs()).max().unwrap() as f64;
    for join in [15, 20] {
        let at = join * PER_FRAME;
        let near = sound[at - 24..at + 24].iter().map(|x| x.unsigned_abs()).max().unwrap() as f64;
        assert!(near < 0.35 * peak, "the sound is faded within half a ms of the join at frame {join}: {near} of {peak}");
    }
    assert!(!d.join("work").exists() && !d.join(".Talk.mp4.partial").exists(), "nothing left behind");
}

#[test]
fn prores_renders_a_mov_of_the_kept_length() {
    let Some(ff) = ffmpeg() else { return };
    let d = temp_dir("export-prores");
    let a = source(&ff, &d.join("src"));
    let out = d.join("Talk.mov");
    let x = run(&ff, &edit(&a), &out, Format::Prores, &d.join("work")).unwrap();
    let (v, s) = lengths(&ff, &out);
    assert!((v - x.seconds).abs() < 0.04 && (s - x.seconds).abs() < 0.04, "picture {v} s, sound {s} s, kept {} s", x.seconds);
    let report = std::process::Command::new(&ff).arg("-hide_banner").arg("-i").arg(&out).output().unwrap();
    let report = String::from_utf8_lossy(&report.stderr);
    assert!(report.contains("Video: prores (HQ)") && report.contains("pcm_s24le"), "{report}");
}

/// Sign changes per second of `sound` (48 kHz mono): twice the tone's frequency.
fn crossings_per_second(sound: &[i16]) -> f64 {
    let n = sound.windows(2).filter(|w| (w[0] < 0) != (w[1] < 0)).count();
    n as f64 * 48000.0 / sound.len() as f64
}

#[test]
fn a_part_with_swapped_mic_audio_exports_the_mic_not_the_camera() {
    let Some(ff) = ffmpeg() else { return };
    let d = temp_dir("export-swap");
    let cam = source(&ff, &d.join("src")); // the camera hears 440 Hz
    let mic = d.join("mic.wav");
    ffmpeg_ok(&ff, &["-f", "lavfi", "-i", "sine=frequency=1000:duration=2:sample_rate=48000", mic.to_str().unwrap()]);
    let swap = crate::swap::make(&ff, &d.join("audio"), &cam, &mic, Some(0.0), "test").unwrap();
    // The spans as export_video builds them: each part's media from the open project.
    let mut project = crate::project::Project::default();
    let part = project.add(&cam).unwrap();
    project.set_swap(part.id, Some(swap)).unwrap();
    let media = project.get(part.id).unwrap().media().to_path_buf();
    assert_ne!(media, cam, "a swapped part plays its remux");

    let out = d.join("Talk.mp4");
    let x = run(&ff, &edit(&media), &out, Format::Mp4, &d.join("work")).unwrap();
    assert_eq!(x.frames, 29, "the cuts are gone");
    let sound: Vec<i16> = decode(&ff, &out, &d, &["-f", "s16le", "-ac", "1", "-ar", "48000"]).chunks(2).map(|b| i16::from_le_bytes([b[0], b[1]])).collect();
    let hz = crossings_per_second(&sound[PER_FRAME..14 * PER_FRAME]) / 2.0;
    assert!((hz - 1000.0).abs() < 30.0, "the file plays the mic's 1000 Hz, not the camera's 440 Hz: {hz:.0} Hz");
}

#[test]
fn a_cancel_stops_the_export_and_leaves_nothing_and_a_second_export_waits_its_turn() {
    let Some(ff) = ffmpeg() else { return };
    let d = temp_dir("export-cancel");
    let a = source(&ff, &d.join("src"));
    let out = d.join("Talk.mp4");
    let spans = edit(&a);
    let exports = Exports::default();
    let second = OnceLock::new();
    let job = Job { ffmpeg: &ff, spans: &spans, out: &out, format: Format::Mp4 };
    let other = Job { ffmpeg: &ff, spans: &spans, out: &d.join("Other.mp4"), format: Format::Mp4 };
    let progress = |_, _| {
        second.get_or_init(|| exports.run(&other, &d.join("work2"), &|_, _| {}, "test"));
        exports.cancel();
    };
    assert_eq!(exports.run(&job, &d.join("work"), &progress, "test"), Err(AppError::ExportCancelled));
    assert_eq!(second.get(), Some(&Err(AppError::ExportBusy)));
    assert!(!out.exists() && !d.join(".Talk.mp4.partial").exists() && !d.join("work").exists(), "nothing left behind");
    // The slot is free again and an old cancel doesn't stop the next export.
    assert_eq!(exports.run(&job, &d.join("work"), &|_, _| {}, "test").map(|x| x.frames), Ok(29));
}
