//! Better audio: a part's sound replaced by another recording of the same take (a better mic), lined up by
//! itself, or placed where the caller says (a voice-over, a manual nudge, an undo putting a swap back).
//! The result is one remux of the video with the new sound under its untouched picture, so playback, the preview,
//! Magic Trace clips and transcription all just read `Part::media()`. Remuxes live in the open project's `audio/`
//! folder (store/), so a swap survives a restart; with no project saved, in the cache, cleared at start.

pub mod plan;
pub mod sync;

use crate::audio;
use crate::error::AppError;
use crate::log;
use plan::Probe;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

/// A part's new sound.
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Swap {
    /// The file the sound came from.
    pub recording: PathBuf,
    /// The second of the video where the recording's first sample plays (negative: its head is dropped).
    pub offset: f64,
    /// The offset was found by matching the two sounds (false: given by the caller, or nothing matched and the
    /// recording starts with the video).
    pub synced: bool,
    /// The video with the new sound: what the part plays from now on.
    pub media: PathBuf,
}

pub fn dir() -> PathBuf {
    let home = std::env::var_os("HOME").unwrap_or_default();
    Path::new(&home).join("Library/Caches/xyz.supercut.editor/swap")
}

/// Last session's remuxes are of no use: the project is gone.
pub fn clear(dir: &Path) {
    let _ = std::fs::remove_dir_all(dir);
}

fn ffmpeg_failed(ffmpeg: &Path) -> impl Fn(std::io::Error) -> AppError + '_ {
    move |e| AppError::FfmpegStart { ffmpeg: ffmpeg.display().to_string(), why: e.to_string() }
}

/// The file's length and whether it has sound, from `ffmpeg -i` (which exits 1 when given no output: expected).
pub fn probe(ffmpeg: &Path, file: &Path) -> Result<Probe, AppError> {
    let out = Command::new(ffmpeg).args(["-hide_banner", "-nostdin", "-i"]).arg(file).stdin(Stdio::null()).output().map_err(ffmpeg_failed(ffmpeg))?;
    let report = String::from_utf8_lossy(&out.stderr);
    plan::probe(&report).ok_or_else(|| AppError::Unreadable { file: file.display().to_string(), why: report.trim().lines().last().unwrap_or_default().into() })
}

/// Where the recording lines up with the video's own sound; (0, false) when the video has none or nothing matches.
fn find_offset(ffmpeg: &Path, video: &Path, video_has_sound: bool, recording: &Path) -> Result<(f64, bool), AppError> {
    if !video_has_sound {
        return Ok((0.0, false));
    }
    let theirs = audio::decode_at(ffmpeg, video, sync::RATE)?;
    let ours = audio::decode_at(ffmpeg, recording, sync::RATE)?;
    Ok(sync::offset(&theirs, &ours).map_or((0.0, false), |o| (o, true)))
}

fn mux(ffmpeg: &Path, video: &Path, recording: &Path, offset: f64, seconds: f64, file: &Path) -> Result<(), AppError> {
    let ext = file.extension().unwrap_or_default().to_string_lossy().into_owned();
    let tmp = file.with_extension(format!("tmp.{ext}"));
    let out = Command::new(ffmpeg).args(plan::mux_args(video, recording, offset, seconds, &tmp)).stdin(Stdio::null()).output().map_err(ffmpeg_failed(ffmpeg))?;
    let made = if out.status.success() {
        std::fs::rename(&tmp, file).map_err(|e| AppError::Swap(format!("{}: {e}", file.display())))
    } else {
        Err(AppError::Swap(String::from_utf8_lossy(&out.stderr).trim().to_string()))
    };
    if made.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    made
}

/// `video` with `recording` as its sound, at `offset` if given, else where the sounds match. A video with sound
/// that the recording matches nowhere is refused (`NoMatch`, nothing written): "Replace" means a better recording
/// of the same moment. A video without sound takes it from 0 s. `trace` tags the log.
pub fn make(ffmpeg: &Path, dir: &Path, video: &Path, recording: &Path, offset: Option<f64>, trace: &str) -> Result<Swap, AppError> {
    let name = |p: &Path| p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    let sound = probe(ffmpeg, recording).map_err(|e| match e {
        AppError::Unreadable { file, why } => AppError::SoundUnreadable { file, why },
        e => e,
    })?;
    if !sound.has_sound {
        return Err(AppError::NoSound { name: name(recording) });
    }
    let shape = probe(ffmpeg, video)?;
    let (offset, synced) = match offset {
        Some(o) => (o, false),
        None => match find_offset(ffmpeg, video, shape.has_sound, recording)? {
            (_, false) if shape.has_sound => return Err(AppError::NoMatch { name: name(recording) }),
            found => found,
        },
    };
    let media = dir.join(plan::media_name(video, recording, offset));
    if !media.exists() {
        std::fs::create_dir_all(dir).map_err(|e| AppError::Swap(format!("{}: {e}", dir.display())))?;
        mux(ffmpeg, video, recording, offset, shape.seconds, &media)?;
    }
    let how = if synced { "synced" } else { "placed" };
    log::info("swap", trace, format!("{} {how} at {offset:+.3} s under {} ({:.1} s)", name(recording), name(video), shape.seconds));
    Ok(Swap { recording: recording.to_path_buf(), offset, synced, media })
}

#[cfg(test)]
mod tests {
    use super::sync::tests::{other_mic, speech};
    use super::*;
    use crate::testkit;

    /// `samples` (mono, sync::RATE) written as a WAV file.
    fn wav(ff: &Path, samples: &[f32], file: &Path) -> PathBuf {
        let raw = file.with_extension("f32");
        std::fs::create_dir_all(file.parent().unwrap()).unwrap();
        std::fs::write(&raw, samples.iter().flat_map(|s| s.to_le_bytes()).collect::<Vec<u8>>()).unwrap();
        testkit::ffmpeg_ok(ff, &["-f", "f32le", "-ar", &sync::RATE.to_string(), "-ac", "1", "-i", raw.to_str().unwrap(), file.to_str().unwrap()]);
        file.to_path_buf()
    }

    /// An 8 s test picture; with `sound` (a WAV) as its own sound, or none.
    fn video(ff: &Path, dir: &Path, sound: Option<&Path>) -> PathBuf {
        let file = dir.join(if sound.is_some() { "cam.mov" } else { "silent.mp4" });
        let mut a = vec!["-f", "lavfi", "-i", "testsrc=duration=8:size=320x240:rate=30"];
        if let Some(s) = sound {
            a.extend(["-i", s.to_str().unwrap(), "-c:a", "aac"]);
        }
        a.extend(["-c:v", "libx264", "-preset", "ultrafast", "-t", "8", file.to_str().unwrap()]);
        testkit::ffmpeg_ok(ff, &a);
        file
    }

    fn rate_seconds(s: f64) -> usize {
        (s * sync::RATE as f64) as usize
    }

    /// The camera heard `sound` from 1.0 s on, through its own poor mic.
    fn camera(ff: &Path, d: &Path, sound: &[f32]) -> PathBuf {
        let theirs = wav(ff, &other_mic(&sound[rate_seconds(1.0)..rate_seconds(9.0)], 0.5, 0.35, 0.05, 1), &d.join("cam.wav"));
        video(ff, d, Some(&theirs))
    }

    #[test]
    fn a_longer_recording_is_synced_and_trimmed_to_the_video() {
        let Some(ff) = testkit::ffmpeg() else { return };
        let d = testkit::temp_dir("swap-long");
        let sound = speech(21, 20.0);
        let cam = camera(&ff, &d, &sound);
        let mic = wav(&ff, &sound[..rate_seconds(15.0)], &d.join("mic.wav"));
        let s = make(&ff, &d.join("cache"), &cam, &mic, None, "test").unwrap();
        assert!(s.synced && (s.offset + 1.0).abs() < 0.002, "{s:?}");
        let (v, a) = testkit::lengths(&ff, &s.media);
        // Within AAC's framing (a priming frame; ffmpeg reports the last frame's start), not misplaced: see below.
        assert!((v - 8.0).abs() < 0.1 && (a - 8.0).abs() < 0.1, "video {v} s, sound {a} s");
        let heard = audio::decode_at(&ff, &s.media, sync::RATE).unwrap();
        let at = sync::offset(&heard, &audio::decode_at(&ff, &mic, sync::RATE).unwrap()).unwrap();
        assert!((at + 1.0).abs() < 0.003, "the part now plays the recording, lined up: {at}");
    }

    #[test]
    fn a_shorter_recording_is_padded_with_silence_to_the_video() {
        let Some(ff) = testkit::ffmpeg() else { return };
        let d = testkit::temp_dir("swap-short");
        let sound = speech(22, 20.0);
        let cam = camera(&ff, &d, &sound);
        let mic = wav(&ff, &sound[rate_seconds(3.0)..rate_seconds(6.0)], &d.join("mic.wav"));
        let s = make(&ff, &d.join("cache"), &cam, &mic, None, "test").unwrap();
        assert!(s.synced && (s.offset - 2.0).abs() < 0.002, "{s:?}");
        let heard = audio::decode_at(&ff, &s.media, sync::RATE).unwrap();
        assert!((heard.len() as f64 / sync::RATE as f64 - 8.0).abs() < 0.1, "{}", heard.len());
        let loud = |from: f64, to: f64| heard[rate_seconds(from)..rate_seconds(to)].iter().fold(0f32, |m, x| m.max(x.abs()));
        assert!(loud(0.0, 1.9) < 1e-3 && loud(5.1, 7.9) < 1e-3, "silence before and after the recording");
        assert!(loud(2.0, 5.0) > 0.05, "the recording in between");
    }

    #[test]
    fn a_video_with_no_sound_takes_a_voice_over_from_its_start() {
        let Some(ff) = testkit::ffmpeg() else { return };
        let d = testkit::temp_dir("swap-voice");
        let silent = video(&ff, &d, None);
        let voice = wav(&ff, &speech(23, 3.0), &d.join("voice.wav"));
        let s = make(&ff, &d.join("cache"), &silent, &voice, None, "test").unwrap();
        assert_eq!((s.offset, s.synced), (0.0, false));
        assert_eq!(probe(&ff, &s.media).unwrap(), Probe { seconds: 8.0, has_sound: true });
        let later = make(&ff, &d.join("cache"), &silent, &voice, Some(1.5), "test").unwrap();
        assert!(later.offset == 1.5 && !later.synced && later.media != s.media, "a given offset is used as is");
    }

    #[test]
    fn a_recording_without_sound_is_refused() {
        let Some(ff) = testkit::ffmpeg() else { return };
        let d = testkit::temp_dir("swap-none");
        let silent = video(&ff, &d, None);
        assert_eq!(make(&ff, &d.join("cache"), &silent, &silent, None, "test"), Err(AppError::NoSound { name: "silent.mp4".into() }));
        assert!(!d.join("cache").exists(), "nothing written");
    }

    #[test]
    fn a_recording_of_something_else_is_refused_unless_placed() {
        let Some(ff) = testkit::ffmpeg() else { return };
        let d = testkit::temp_dir("swap-nomatch");
        let cam = camera(&ff, &d, &speech(24, 20.0));
        let other = wav(&ff, &speech(25, 6.0), &d.join("other.wav"));
        assert_eq!(make(&ff, &d.join("cache"), &cam, &other, None, "test"), Err(AppError::NoMatch { name: "other.wav".into() }));
        assert!(!d.join("cache").exists(), "nothing written");
        let placed = make(&ff, &d.join("cache"), &cam, &other, Some(0.5), "test").unwrap();
        assert!(placed.offset == 0.5 && !placed.synced, "a given offset needs no match");
    }

    #[test]
    fn an_unreadable_recording_says_it_is_the_audio() {
        let Some(ff) = testkit::ffmpeg() else { return };
        let d = testkit::temp_dir("swap-bad");
        std::fs::create_dir_all(&d).unwrap();
        let bad = d.join("broken.wav");
        std::fs::write(&bad, b"not a wav").unwrap();
        assert!(matches!(make(&ff, &d.join("cache"), &bad, &bad, None, "test"), Err(AppError::SoundUnreadable { .. })));
    }

    /// Real speech (`npm run sample-retakes` makes models/retakes.wav; skipped without it): the camera's copy is
    /// thin, echoey and hissy, and starts 3.25 s into the recording.
    #[test]
    fn real_speech_through_a_poor_camera_mic_is_synced() {
        let Some(ff) = testkit::ffmpeg() else { return };
        let mic = Path::new(env!("CARGO_MANIFEST_DIR")).join("../models/retakes.wav");
        if !mic.exists() {
            return;
        }
        let d = testkit::temp_dir("swap-real");
        let cam_wav = d.join("cam.wav");
        let graph = "[0:a]atrim=start=3.25,asetpts=PTS-STARTPTS,highpass=f=300,lowpass=f=3400,aecho=0.8:0.6:40:0.4,volume=0.4[v];anoisesrc=color=pink:amplitude=0.02:sample_rate=16000[n];[v][n]amix=inputs=2:duration=first[o]";
        testkit::ffmpeg_ok(&ff, &["-i", mic.to_str().unwrap(), "-filter_complex", graph, "-map", "[o]", "-t", "8", cam_wav.to_str().unwrap()]);
        let cam = video(&ff, &d, Some(&cam_wav));
        let s = make(&ff, &d.join("cache"), &cam, &mic, None, "test").unwrap();
        assert!(s.synced && (s.offset + 3.25).abs() < 0.005, "{s:?}");
    }
}
