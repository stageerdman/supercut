//! Magic Trace clips: the few seconds the user heard before saying "no" to a Magic cut, saved next to the
//! run's learning log as `<run id>-<proposal index>.mp4`. Small on purpose (480p, low bitrate): they are for
//! a person or a tool to look at later, not for export. They stay on this Mac.

use crate::error::AppError;
use crate::learning;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

/// One stretch of a source file, in that file's own seconds.
#[derive(Debug, Clone, PartialEq)]
pub struct Span {
    pub path: PathBuf,
    pub s: f64,
    pub e: f64,
}

/// Every input boxed into one frame size and resampled alike: concat refuses parts of different shapes or rates.
const FRAME: &str = "scale=854:480:force_original_aspect_ratio=decrease,pad=854:480:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30";

fn filter(n: usize) -> String {
    let each: String = (0..n)
        .map(|k| format!("[{k}:v]{FRAME}[v{k}];[{k}:a]aresample=48000,aformat=channel_layouts=stereo[a{k}];"))
        .collect();
    let pairs: String = (0..n).map(|k| format!("[v{k}][a{k}]")).collect();
    format!("{each}{pairs}concat=n={n}:v=1:a=1[v][a]")
}

/// The ffmpeg arguments that join `spans`, in order, into one small mp4 at `out`.
pub fn args(spans: &[Span], out: &Path) -> Vec<String> {
    let mut a: Vec<String> = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y"].map(String::from).to_vec();
    for span in spans {
        a.extend(["-ss".into(), format!("{:.3}", span.s), "-t".into(), format!("{:.3}", span.e - span.s), "-i".into()]);
        a.push(span.path.display().to_string());
    }
    a.extend(["-filter_complex".into(), filter(spans.len()), "-map".into(), "[v]".into(), "-map".into(), "[a]".into()]);
    a.extend(
        ["-c:v", "libx264", "-preset", "veryfast", "-crf", "28", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", "-f", "mp4"]
            .map(String::from),
    );
    a.push(out.display().to_string());
    a
}

fn check(id: &str, spans: &[Span]) -> Result<(), AppError> {
    learning::plain_id(id)?;
    if spans.is_empty() {
        return Err(AppError::Learning(format!("clip {id}: nothing was heard")));
    }
    match spans.iter().find(|x| !(x.s >= 0.0 && x.e > x.s)) {
        Some(bad) => Err(AppError::Learning(format!("clip {id}: empty span {:.3}‥{:.3}", bad.s, bad.e))),
        None => Ok(()),
    }
}

/// Writes `<dir>/<id>.mp4`, replacing a clip of the same name. A failed run leaves no half-written clip.
pub fn save(ffmpeg: &Path, dir: &Path, id: &str, spans: &[Span]) -> Result<PathBuf, AppError> {
    check(id, spans)?;
    let fail = |why: String| AppError::Learning(format!("clip {id}: {why}"));
    std::fs::create_dir_all(dir).map_err(|e| fail(format!("{}: {e}", dir.display())))?;
    let (tmp, file) = (dir.join(format!("{id}.tmp.mp4")), dir.join(format!("{id}.mp4")));
    let out = Command::new(ffmpeg)
        .args(args(spans, &tmp))
        .stdin(Stdio::null())
        .output()
        .map_err(|e| AppError::FfmpegStart { ffmpeg: ffmpeg.display().to_string(), why: e.to_string() })?;
    if !out.status.success() {
        let _ = std::fs::remove_file(&tmp);
        return Err(fail(String::from_utf8_lossy(&out.stderr).trim().to_string()));
    }
    std::fs::rename(&tmp, &file).map_err(|e| fail(format!("{}: {e}", file.display())))?;
    Ok(file)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn span(path: &str, s: f64, e: f64) -> Span {
        Span { path: PathBuf::from(path), s, e }
    }

    fn temp_dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("supercut-clip-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        d
    }

    /// The ffmpeg `npm ci` puts in node_modules; the clip tests that need a real one skip without it.
    fn ffmpeg() -> Option<PathBuf> {
        let f = Path::new(env!("CARGO_MANIFEST_DIR")).join("../node_modules/ffmpeg-static/ffmpeg");
        f.exists().then_some(f)
    }

    fn source(ffmpeg: &Path, dir: &Path, name: &str, size: &str) -> PathBuf {
        std::fs::create_dir_all(dir).unwrap();
        let file = dir.join(name);
        let video = format!("testsrc=duration=4:size={size}:rate=25");
        let st = Command::new(ffmpeg)
            .args(["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", &video])
            .args(["-f", "lavfi", "-i", "sine=frequency=440:duration=4:sample_rate=44100", "-shortest"])
            .args(["-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac"])
            .arg(&file)
            .status()
            .unwrap();
        assert!(st.success());
        file
    }

    fn seconds(ffmpeg: &Path, file: &Path) -> f64 {
        let out = Command::new(ffmpeg).arg("-hide_banner").arg("-i").arg(file).output().unwrap();
        let text = String::from_utf8_lossy(&out.stderr);
        let at = text.find("Duration: ").expect("ffmpeg names the duration") + 10;
        let hms: Vec<f64> = text[at..at + 11].split(':').map(|x| x.parse().unwrap()).collect();
        hms[0] * 3600.0 + hms[1] * 60.0 + hms[2]
    }

    #[test]
    fn one_input_per_span_seeked_and_joined_in_order() {
        let a = args(&[span("/v/a.mov", 1.5, 4.0), span("/v/b.mp4", 0.0, 2.25)], Path::new("/l/x.mp4"));
        let s = a.join(" ");
        assert!(s.contains("-ss 1.500 -t 2.500 -i /v/a.mov -ss 0.000 -t 2.250 -i /v/b.mp4"), "{s}");
        assert!(s.contains("[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]"), "{s}");
        assert!(s.contains(&format!("[1:v]{FRAME}[v1]")), "{s}");
        assert_eq!(a.last().unwrap(), "/l/x.mp4");
    }

    #[test]
    fn a_bad_id_or_nothing_heard_is_refused_before_ffmpeg_runs() {
        let d = temp_dir("bad");
        let nope = Path::new("/nope/ffmpeg");
        for id in ["", "../x", "a/b", "run.1"] {
            assert!(matches!(save(nope, &d, id, &[span("/v/a.mov", 0.0, 1.0)]), Err(AppError::Learning(_))), "{id}");
        }
        assert!(matches!(save(nope, &d, "run-1", &[]), Err(AppError::Learning(_))));
        assert!(matches!(save(nope, &d, "run-1", &[span("/v/a.mov", 2.0, 2.0)]), Err(AppError::Learning(_))));
        assert!(!d.exists(), "nothing written");
    }

    #[test]
    fn a_clip_joins_the_spans_of_two_parts_and_a_rewrite_replaces_it() {
        let Some(ff) = ffmpeg() else { return };
        let d = temp_dir("write");
        let (a, b) = (source(&ff, &d.join("src"), "a.mp4", "320x240"), source(&ff, &d.join("src"), "b.mp4", "640x360"));
        let clip = save(&ff, &d, "run-1-3", &[span(a.to_str().unwrap(), 1.0, 3.0), span(b.to_str().unwrap(), 0.0, 1.0)]).unwrap();
        assert_eq!(clip, d.join("run-1-3.mp4"));
        assert!((seconds(&ff, &clip) - 3.0).abs() < 0.2, "{}", seconds(&ff, &clip));
        save(&ff, &d, "run-1-3", &[span(a.to_str().unwrap(), 0.0, 1.0)]).unwrap();
        assert!((seconds(&ff, &clip) - 1.0).abs() < 0.2, "{}", seconds(&ff, &clip));
        assert!(!d.join("run-1-3.tmp.mp4").exists());
    }

    #[test]
    fn a_failed_run_leaves_no_clip() {
        let Some(ff) = ffmpeg() else { return };
        let d = temp_dir("fail");
        let e = save(&ff, &d, "run-2-0", &[span("/nope/missing.mov", 0.0, 1.0)]).unwrap_err();
        assert!(matches!(e, AppError::Learning(_)), "{e}");
        assert!(std::fs::read_dir(&d).unwrap().next().is_none(), "folder is empty");
    }
}
