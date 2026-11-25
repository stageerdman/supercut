//! The edit's preview: the kept spans rendered back to back into one small video, so playing over a cut is just
//! playing on (nothing seeks or starts at a cut: in WebKit that is what freezes the picture). Each kept span is its
//! own cached clip, so after an edit only the spans that changed are rendered; the join copies the clips' picture
//! and cuts the sound fresh. Files live in the Mac's cache folder and are cleared when the app starts.
//! Why: updates/2026-11-24 SMOOTH PLAYBACK - OPEN/wiki.md.

pub mod plan;

use crate::error::AppError;
use crate::log;
pub use plan::{Placed, Span};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};

/// A ready preview: the file and where each kept span plays in it.
#[derive(serde::Serialize, Debug)]
pub struct Preview {
    pub file: PathBuf,
    pub map: Vec<Placed>,
}

/// Previews kept on disk: the newest, and the one that may still be playing.
const KEEP: usize = 2;

static LATEST: AtomicU64 = AtomicU64::new(0);

/// A new render's number. Starting one makes every older render stop at its next clip: its edit is gone.
pub fn ticket() -> u64 {
    LATEST.fetch_add(1, Ordering::SeqCst) + 1
}

/// Is render `t` still the newest?
pub fn latest(t: u64) -> bool {
    LATEST.load(Ordering::SeqCst) == t
}

fn still(live: &(dyn Fn() -> bool + Sync)) -> Result<(), AppError> {
    if live() {
        Ok(())
    } else {
        Err(AppError::PreviewStale)
    }
}

pub fn dir() -> PathBuf {
    let home = std::env::var_os("HOME").unwrap_or_default();
    Path::new(&home).join("Library/Caches/xyz.supercut.editor/preview")
}

/// Empties the folder (last session's clips are of no use: the project is gone).
pub fn clear(dir: &Path) {
    let _ = std::fs::remove_dir_all(dir);
}

fn check(spans: &[Span]) -> Result<(), AppError> {
    plan::fault(spans).map_or(Ok(()), |why| Err(AppError::Preview(why)))
}

fn run(ffmpeg: &Path, args: Vec<String>, what: &str) -> Result<(), AppError> {
    let out = Command::new(ffmpeg)
        .args(args)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| AppError::FfmpegStart { ffmpeg: ffmpeg.display().to_string(), why: e.to_string() })?;
    if out.status.success() {
        return Ok(());
    }
    Err(AppError::Preview(format!("{what}: {}", String::from_utf8_lossy(&out.stderr).trim())))
}

/// Writes `file` through a temp beside it, so a reader never sees half of it.
fn render_to(file: &Path, make: impl FnOnce(&Path) -> Result<(), AppError>) -> Result<(), AppError> {
    let tmp = file.with_extension("tmp.mp4");
    let made = make(&tmp).and_then(|_| std::fs::rename(&tmp, file).map_err(|e| AppError::Preview(format!("{}: {e}", file.display()))));
    if made.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    made
}

/// Renders the clips not cached yet, several at once (each ffmpeg decodes from the keyframe before its span, so
/// one at a time leaves most cores idle). Stops at the next clip once a newer render has begun.
fn render_clips(ffmpeg: &Path, dir: &Path, todo: &[&Span], size: (u32, u32), live: &(dyn Fn() -> bool + Sync)) -> Result<(), AppError> {
    let workers = std::thread::available_parallelism().map_or(4, |n| n.get()).clamp(1, 8);
    let next = AtomicUsize::new(0);
    std::thread::scope(|s| {
        let jobs: Vec<_> = (0..workers.min(todo.len()))
            .map(|_| {
                s.spawn(|| loop {
                    let k = next.fetch_add(1, Ordering::SeqCst);
                    let Some(span) = todo.get(k) else { return Ok(()) };
                    still(live)?;
                    let file = dir.join(plan::clip_name(span, size));
                    render_to(&file, |tmp| run(ffmpeg, plan::clip_args(span, size, tmp), &format!("clip at {:.2} s", span.s)))?;
                })
            })
            .collect();
        jobs.into_iter().map(|j| j.join().unwrap_or_else(|_| Err(AppError::Preview("a clip render crashed".into())))).collect()
    })
}

fn join(ffmpeg: &Path, dir: &Path, spans: &[Span], size: (u32, u32), file: &Path) -> Result<(), AppError> {
    let stem = file.file_stem().unwrap_or_default().to_string_lossy().into_owned();
    let (list, graph) = (dir.join(format!("{stem}.list.txt")), dir.join(format!("{stem}.sound.txt")));
    let clips: Vec<PathBuf> = spans.iter().map(|x| dir.join(plan::clip_name(x, size))).collect();
    let io = |e: std::io::Error| AppError::Preview(format!("{}: {e}", dir.display()));
    std::fs::write(&list, plan::concat_list(&clips)).map_err(io)?;
    std::fs::write(&graph, plan::sound_graph(spans)).map_err(io)?;
    let made = render_to(file, |tmp| run(ffmpeg, plan::join_args(&list, spans, &graph, tmp), "join"));
    let _ = (std::fs::remove_file(&list), std::fs::remove_file(&graph));
    made
}

/// Deletes all previews but the KEEP newest (clips stay: an undo brings their spans back).
fn prune(dir: &Path) {
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    let mut previews: Vec<(std::time::SystemTime, PathBuf)> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.file_name().is_some_and(|n| n.to_string_lossy().starts_with("preview-") && !n.to_string_lossy().contains(".tmp")))
        .filter_map(|p| Some((std::fs::metadata(&p).ok()?.modified().ok()?, p)))
        .collect();
    previews.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, p) in previews.into_iter().skip(KEEP) {
        let _ = std::fs::remove_file(p);
    }
}

/// The preview of `spans` (play order) for video of `width`×`height`. `live`: is this edit still wanted
/// (false once a newer render began: see `ticket`, `latest`); `trace` tags the log line.
pub fn render(ffmpeg: &Path, dir: &Path, spans: &[Span], (width, height): (u32, u32), live: &(dyn Fn() -> bool + Sync), trace: &str) -> Result<Preview, AppError> {
    check(spans)?;
    let size = plan::frame(width, height);
    let file = dir.join(plan::preview_name(spans, size));
    let map = plan::placed(spans);
    if file.exists() {
        return Ok(Preview { file, map });
    }
    std::fs::create_dir_all(dir).map_err(|e| AppError::Preview(format!("{}: {e}", dir.display())))?;
    let mut todo: Vec<&Span> = spans.iter().filter(|x| !dir.join(plan::clip_name(x, size)).exists()).collect();
    todo.dedup_by(|a, b| plan::clip_name(a, size) == plan::clip_name(b, size));
    let started = std::time::Instant::now();
    render_clips(ffmpeg, dir, &todo, size, live)?;
    still(live)?;
    join(ffmpeg, dir, spans, size, &file)?;
    prune(dir);
    let took = started.elapsed().as_secs_f64();
    log::info("preview", trace, format!("{} spans ({} new clips) in {took:.1} s", spans.len(), todo.len()));
    Ok(Preview { file, map })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testkit::{ffmpeg, lengths};

    fn temp_dir(name: &str) -> PathBuf {
        crate::testkit::temp_dir(&format!("preview-{name}"))
    }

    fn source(ffmpeg: &Path, dir: &Path) -> PathBuf {
        std::fs::create_dir_all(dir).unwrap();
        let file = dir.join("a.mp4");
        let st = Command::new(ffmpeg)
            .args(["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=duration=6:size=640x360:rate=25"])
            .args(["-f", "lavfi", "-i", "sine=frequency=440:duration=6:sample_rate=44100", "-shortest"])
            .args(["-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac"])
            .arg(&file)
            .status()
            .unwrap();
        assert!(st.success());
        file
    }

    #[test]
    fn nothing_kept_or_an_empty_span_is_refused_before_ffmpeg_runs() {
        let d = temp_dir("bad");
        let nope = Path::new("/nope/ffmpeg");
        assert!(matches!(render(nope, &d, &[], (640, 360), &|| true, "test"), Err(AppError::Preview(_))));
        let bad = [Span { part: 1, path: "/a.mov".into(), s: 2.0, e: 2.0 }];
        assert!(matches!(render(nope, &d, &bad, (640, 360), &|| true, "test"), Err(AppError::Preview(_))));
        assert!(!d.exists(), "nothing written");
    }

    #[test]
    fn a_preview_is_the_kept_spans_back_to_back_with_picture_and_sound_the_same_length() {
        let Some(ff) = ffmpeg() else { return };
        let d = temp_dir("render");
        let a = source(&ff, &d.join("src"));
        let spans: Vec<Span> = [(0.0, 1.5), (2.0, 2.7), (3.3, 6.0)].map(|(s, e)| Span { part: 1, path: a.clone(), s, e }).to_vec();
        let p = render(&ff, &d.join("cache"), &spans, (640, 360), &|| true, "test").unwrap();
        let last = p.map.last().unwrap();
        let length = last.at + last.e - last.s;
        assert!((length - 4.9).abs() < 0.02, "{length}");
        let (v, s) = lengths(&ff, &p.file);
        assert!((v - length).abs() < 0.05 && (s - length).abs() < 0.05, "video {v} s, sound {s} s, map {length} s");
        // An edit that keeps two of the spans renders only the new one.
        let again = render(&ff, &d.join("cache"), &spans[..2], (640, 360), &|| true, "test").unwrap();
        assert_ne!(again.file, p.file);
        let clips = std::fs::read_dir(d.join("cache")).unwrap().flatten().filter(|e| e.file_name().to_string_lossy().starts_with("clip-")).count();
        assert_eq!(clips, 3, "the clips were reused");
    }

    /// For the WebKit measure (updates/2026-11-24 SMOOTH PLAYBACK - OPEN/measure): renders MEASURE_SRC's spans
    /// MEASURE_SPANS ("s-e,s-e") at MEASURE_SIZE ("1920x1080") into MEASURE_OUT and writes preview.json there.
    #[test]
    #[ignore]
    fn render_for_measure() {
        let (ff, env) = (ffmpeg().expect("npm ci puts ffmpeg in node_modules"), |k: &str| std::env::var(k).expect(k));
        let (src, out) = (PathBuf::from(env("MEASURE_SRC")), PathBuf::from(env("MEASURE_OUT")));
        let num = |x: &str| x.parse::<f64>().expect("a number");
        let spans: Vec<Span> = env("MEASURE_SPANS").split(',').map(|x| x.split_once('-').expect("s-e")).map(|(s, e)| Span { part: 1, path: src.clone(), s: num(s), e: num(e) }).collect();
        let (w, h) = env("MEASURE_SIZE").split_once('x').map(|(w, h)| (w.parse().unwrap(), h.parse().unwrap())).expect("WxH");
        let p = render(&ff, &out, &spans, (w, h), &|| true, "measure").unwrap();
        std::fs::write(out.join("preview.json"), serde_json::to_string(&p).unwrap()).unwrap();
    }

    #[test]
    fn an_older_render_stops_once_a_newer_one_begins() {
        let Some(ff) = ffmpeg() else { return };
        let d = temp_dir("stale");
        let a = source(&ff, &d.join("src"));
        let (old, new) = (ticket(), ticket());
        assert!(!latest(old) && new > old);
        let spans = [Span { part: 1, path: a, s: 0.0, e: 1.0 }];
        assert_eq!(render(&ff, &d.join("cache"), &spans, (640, 360), &|| false, "test").unwrap_err(), AppError::PreviewStale);
        assert!(!d.join("cache").join(plan::preview_name(&spans, (640, 360))).exists());
    }
}
