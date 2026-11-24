//! The swap's plan, pure: what ffmpeg says about a file, and the arguments of the remux that puts the new sound
//! under the video's picture: shifted by the offset, padded with silence or trimmed to exactly the video's length.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::Path;

/// Bumped when the remux settings change, so an old cached remux is never reused.
const VERSION: u32 = 1;

/// What `ffmpeg -i <file>` reports about a file.
#[derive(Debug, Clone, PartialEq)]
pub struct Probe {
    pub seconds: f64,
    pub has_sound: bool,
}

/// Reads ffmpeg's report (its stderr). None when it names no length (not a media file, or a broken one).
pub fn probe(report: &str) -> Option<Probe> {
    let at = report.find("Duration: ")? + "Duration: ".len();
    let hms: Vec<f64> = report[at..].split(',').next()?.trim().split(':').map(|x| x.parse().ok()).collect::<Option<_>>()?;
    let [h, m, s] = hms[..] else { return None };
    let has_sound = report.lines().any(|l| l.trim_start().starts_with("Stream #") && l.contains(": Audio:"));
    Some(Probe { seconds: h * 3600.0 + m * 60.0 + s, has_sound })
}

/// The new sound's filter: lands at `offset` s of the video (delayed, or its head dropped), then exactly `seconds`
/// long (silence after its end, nothing past the video's).
pub fn sound_filter(offset: f64, seconds: f64) -> String {
    let shift = if offset >= 0.0 {
        format!("adelay=delays={}:all=1", (offset * 1000.0).round() as u64)
    } else {
        format!("atrim=start={:.6},asetpts=PTS-STARTPTS", -offset)
    };
    format!("[1:a]{shift},apad=whole_dur={seconds:.6},atrim=duration={seconds:.6}[a]")
}

/// mov stays mov (it holds any codec a camera writes); mp4 and m4v become mp4.
fn container(video: &Path) -> &'static str {
    let ext = video.extension().and_then(|e| e.to_str()).unwrap_or_default().to_lowercase();
    if ext == "mov" {
        "mov"
    } else {
        "mp4"
    }
}

/// The remux's cache name: the same video, recording and offset (to 0.1 ms) are remuxed once.
pub fn media_name(video: &Path, recording: &Path, offset: f64) -> String {
    let mut h = DefaultHasher::new();
    (VERSION, video, recording, (offset * 10_000.0).round() as i64).hash(&mut h);
    format!("swap-{:016x}.{}", h.finish(), container(video))
}

/// The picture copied untouched, the new sound under it, `seconds` long.
pub fn mux_args(video: &Path, recording: &Path, offset: f64, seconds: f64, out: &Path) -> Vec<String> {
    let mut a: Vec<String> = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-i"].map(String::from).to_vec();
    a.push(video.display().to_string());
    a.push("-i".into());
    a.push(recording.display().to_string());
    a.extend(["-filter_complex".into(), sound_filter(offset, seconds)]);
    a.extend(["-map", "0:v:0", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k"].map(String::from));
    a.extend(["-t".into(), format!("{seconds:.6}"), "-movflags".into(), "+faststart".into(), "-f".into(), container(video).into()]);
    a.push(out.display().to_string());
    a
}

#[cfg(test)]
mod tests {
    use super::*;

    const REPORT: &str = "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'a.mov':\n  Duration: 00:01:02.53, start: 0.000000, bitrate: 1 kb/s\n  Stream #0:0[0x1](und): Video: h264 (High), yuv420p, 1920x1080, 30 fps\n  Stream #0:1[0x2](und): Audio: aac (LC), 48000 Hz, stereo\nAt least one output file must be specified";

    #[test]
    fn the_report_gives_the_length_and_whether_there_is_sound() {
        assert_eq!(probe(REPORT), Some(Probe { seconds: 62.53, has_sound: true }));
        let silent = REPORT.replace("  Stream #0:1[0x2](und): Audio: aac (LC), 48000 Hz, stereo\n", "");
        assert_eq!(probe(&silent), Some(Probe { seconds: 62.53, has_sound: false }));
        assert_eq!(probe("  Duration: 01:00:00.00, start"), Some(Probe { seconds: 3600.0, has_sound: false }));
    }

    #[test]
    fn no_length_is_no_probe() {
        assert_eq!(probe("x.mov: Invalid data found when processing input"), None);
        assert_eq!(probe("  Duration: N/A, bitrate: N/A"), None);
    }

    #[test]
    fn a_later_recording_is_delayed_an_earlier_one_loses_its_head_and_both_end_with_the_video() {
        assert_eq!(sound_filter(2.3456, 60.0), "[1:a]adelay=delays=2346:all=1,apad=whole_dur=60.000000,atrim=duration=60.000000[a]");
        assert_eq!(sound_filter(-5.5, 40.0), "[1:a]atrim=start=5.500000,asetpts=PTS-STARTPTS,apad=whole_dur=40.000000,atrim=duration=40.000000[a]");
    }

    #[test]
    fn the_remux_copies_the_picture_in_the_video_s_own_container() {
        let s = mux_args(Path::new("/v/a.mov"), Path::new("/r/mic.wav"), 0.0, 6.0, Path::new("/c/o.mov")).join(" ");
        assert!(s.contains("-i /v/a.mov -i /r/mic.wav -filter_complex [1:a]"), "{s}");
        assert!(s.contains("-map 0:v:0 -map [a] -c:v copy -c:a aac"), "{s}");
        assert!(s.ends_with("-t 6.000000 -movflags +faststart -f mov /c/o.mov"), "{s}");
        assert!(media_name(Path::new("/v/a.m4v"), Path::new("/r/mic.wav"), 0.0).ends_with(".mp4"));
    }

    #[test]
    fn a_new_offset_or_recording_is_a_new_remux() {
        let (v, r) = (Path::new("/v/a.mov"), Path::new("/r/mic.wav"));
        assert_eq!(media_name(v, r, 1.0), media_name(v, r, 1.00001));
        assert_ne!(media_name(v, r, 1.0), media_name(v, r, 1.001));
        assert_ne!(media_name(v, r, 1.0), media_name(v, Path::new("/r/other.wav"), 1.0));
    }
}
