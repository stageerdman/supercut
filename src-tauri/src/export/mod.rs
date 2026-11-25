//! The export: the edit's kept spans rendered into one clean video at source quality. Each span becomes its own
//! segment (picture only, exactly its frames), several at once; one join copies their picture and cuts the sound
//! fresh, faded at every join. Progress is counted in frames; a cancel kills the running ffmpegs. The file appears
//! at `out` only when complete. Why each rule and the UI's contract: updates/2026-11-25 EXPORT - OPEN/update v1.md.

pub mod plan;
mod run;

use crate::error::AppError;
use crate::log;
use plan::{Format, Shape, Span};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering};

/// A finished export.
#[derive(serde::Serialize, Debug, Clone, PartialEq)]
pub struct Exported {
    pub file: PathBuf,
    pub seconds: f64,
    pub frames: u64,
}

/// What to export: `spans` in play order (each part's path is its media, swapped sound included) into `out`.
pub struct Job<'a> {
    pub ffmpeg: &'a Path,
    pub spans: &'a [Span],
    pub out: &'a Path,
    pub format: Format,
}

/// Told (frames done, frames in all) as the export goes; done == all while the join runs.
pub type Progress<'a> = &'a (dyn Fn(u64, u64) + Sync);

/// The app's exports: one at a time, and the cancel that stops the running one.
#[derive(Default)]
pub struct Exports {
    running: AtomicBool,
    cancels: AtomicU64,
}

/// Frees the one-at-a-time slot however the export ends.
struct Slot<'a>(&'a AtomicBool);

impl Drop for Slot<'_> {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

impl Exports {
    /// Stops the running export, if any: it returns `ExportCancelled` and leaves nothing behind.
    pub fn cancel(&self) {
        self.cancels.fetch_add(1, Ordering::SeqCst);
    }

    /// Runs `job`, its segments in `work` (a folder of its own, removed afterwards whatever happens).
    pub fn run(&self, job: &Job, work: &Path, progress: Progress, trace: &str) -> Result<Exported, AppError> {
        if self.running.swap(true, Ordering::SeqCst) {
            return Err(AppError::ExportBusy);
        }
        let _slot = Slot(&self.running);
        let at = self.cancels.load(Ordering::SeqCst);
        let stopped = || self.cancels.load(Ordering::SeqCst) != at;
        check(job)?;
        std::fs::create_dir_all(work).map_err(|e| AppError::Export(format!("{}: {e}", work.display())))?;
        let made = render(job, work, &stopped, progress);
        let _ = std::fs::remove_dir_all(work);
        match &made {
            Ok(x) => log::info("export", trace, format!("{} spans, {} frames ({:.2} s) to {}", job.spans.len(), x.frames, x.seconds, x.file.display())),
            Err(AppError::ExportCancelled) => log::info("export", trace, "cancelled"),
            Err(e) => log::error("export", trace, format!("{} spans to {}: {e:?}", job.spans.len(), job.out.display())),
        }
        made
    }
}

/// The folder the running export's segments live in.
pub fn dir() -> PathBuf {
    let home = std::env::var_os("HOME").unwrap_or_default();
    Path::new(&home).join("Library/Caches/xyz.supercut.editor/export")
}

fn check(job: &Job) -> Result<(), AppError> {
    if let Some(why) = crate::preview::plan::fault(job.spans) {
        return Err(AppError::Export(why));
    }
    if !plan::fits(job.out, job.format) {
        return Err(AppError::Export(format!("{} should end in .{}", job.out.display(), job.format.ext())));
    }
    Ok(())
}

fn render(job: &Job, work: &Path, stopped: &(dyn Fn() -> bool + Sync), progress: Progress) -> Result<Exported, AppError> {
    let shape = probe(job.ffmpeg, &job.spans[0].path)?;
    let total = plan::total_frames(job.spans, shape.rate);
    progress(0, total);
    let segments = render_segments(job, work, shape, stopped, &|done| progress(done, total))?;
    progress(total, total);
    join(job, work, shape, &segments, stopped)?;
    Ok(Exported { file: job.out.to_path_buf(), seconds: plan::seconds(total, shape.rate), frames: total })
}

/// The first part's frame and rate, from `ffmpeg -i` (which exits 1 when given no output: expected).
fn probe(ffmpeg: &Path, file: &Path) -> Result<Shape, AppError> {
    let out = Command::new(ffmpeg)
        .args(["-hide_banner", "-nostdin", "-i"])
        .arg(file)
        .stdin(Stdio::null())
        .output()
        .map_err(|e| AppError::FfmpegStart { ffmpeg: ffmpeg.display().to_string(), why: e.to_string() })?;
    let report = String::from_utf8_lossy(&out.stderr);
    plan::shape(&report).ok_or_else(|| AppError::Unreadable { file: file.display().to_string(), why: report.trim().lines().last().unwrap_or_default().into() })
}

/// Every span's segment, several at once (x264 at `slow` uses a few cores itself, so half the cores' worth).
/// The first failure stops the others; `done` is told the frames finished across all of them.
fn render_segments(job: &Job, work: &Path, shape: Shape, stopped: &(dyn Fn() -> bool + Sync), done: &(dyn Fn(u64) + Sync)) -> Result<Vec<PathBuf>, AppError> {
    let files: Vec<PathBuf> = (0..job.spans.len()).map(|i| work.join(format!("{i}.{}", job.format.ext()))).collect();
    let workers = std::thread::available_parallelism().map_or(2, |n| n.get() / 2).clamp(1, 4);
    let (next, frames, failed) = (AtomicUsize::new(0), AtomicU64::new(0), AtomicBool::new(false));
    let stop = || failed.load(Ordering::SeqCst) || stopped();
    let one = |k: usize| {
        let span = &job.spans[k];
        let mut last = 0;
        let mut seen = |n: u64| {
            let new = n.saturating_sub(last);
            last = last.max(n);
            done(frames.fetch_add(new, Ordering::SeqCst) + new);
        };
        let args = plan::segment_args(span, shape, job.format, &files[k]);
        run::ffmpeg(job.ffmpeg, &args, &format!("part {} at {:.2} s", span.part, span.s), &stop, &mut seen)
    };
    let results: Vec<Result<(), AppError>> = std::thread::scope(|s| {
        let jobs: Vec<_> = (0..workers.min(files.len()))
            .map(|_| {
                s.spawn(|| loop {
                    let k = next.fetch_add(1, Ordering::SeqCst);
                    if k >= files.len() {
                        return Ok(());
                    }
                    if stop() {
                        return Err(AppError::ExportCancelled);
                    }
                    if let Err(e) = one(k) {
                        failed.store(true, Ordering::SeqCst);
                        return Err(e);
                    }
                })
            })
            .collect();
        jobs.into_iter().map(|j| j.join().unwrap_or_else(|_| Err(AppError::Export("a segment render crashed".into())))).collect()
    });
    first_cause(results)?;
    Ok(files)
}

/// The error that started it: a real failure over the cancels it caused in the other workers.
fn first_cause(results: Vec<Result<(), AppError>>) -> Result<(), AppError> {
    let errors: Vec<AppError> = results.into_iter().filter_map(Result::err).collect();
    match errors.iter().find(|e| **e != AppError::ExportCancelled).or(errors.first()) {
        Some(e) => Err(e.clone()),
        None => Ok(()),
    }
}

/// Joins the segments into a temp beside `out` (named so Finder hides it), renamed to `out` once complete.
fn join(job: &Job, work: &Path, shape: Shape, segments: &[PathBuf], stopped: &dyn Fn() -> bool) -> Result<(), AppError> {
    let (list, graph) = (work.join("list.txt"), work.join("sound.txt"));
    let io = |e: std::io::Error| AppError::Export(format!("{}: {e}", work.display()));
    std::fs::write(&list, crate::preview::plan::concat_list(segments)).map_err(io)?;
    std::fs::write(&graph, plan::sound_graph(job.spans, shape.rate)).map_err(io)?;
    let name = job.out.file_name().unwrap_or_default().to_string_lossy();
    let tmp = job.out.with_file_name(format!(".{name}.partial"));
    let args = plan::join_args(&list, job.spans, &graph, job.format, &tmp);
    let made = run::ffmpeg(job.ffmpeg, &args, "join", stopped, &mut |_| {})
        .and_then(|_| std::fs::rename(&tmp, job.out).map_err(|e| AppError::Export(format!("{}: {e}", job.out.display()))));
    if made.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    made
}

#[cfg(test)]
mod tests;
