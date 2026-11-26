//! One ffmpeg of the export: its progress lines handed on as they come, killed as soon as the export is stopped.

use super::plan;
use crate::error::AppError;
use crate::jobs::Job;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::Command;

/// Runs ffmpeg with `args` (which send progress to stdout), telling `seen` each frame count it reports.
/// `stop` is asked at every line (ffmpeg writes one about twice a second); once it says yes, ffmpeg is killed and
/// this returns `ExportCancelled`. `what` names the step in the error.
pub fn ffmpeg(ffmpeg: &Path, args: &[String], what: &str, stop: &dyn Fn() -> bool, seen: &mut dyn FnMut(u64)) -> Result<(), AppError> {
    let mut job = Job::spawn(Command::new(ffmpeg).args(args)).map_err(|e| AppError::FfmpegStart { ffmpeg: ffmpeg.display().to_string(), why: e.to_string() })?;
    let lines = BufReader::new(job.stdout().expect("stdout is piped")).lines();
    for line in lines.map_while(Result::ok) {
        if stop() {
            return Err(AppError::ExportCancelled); // dropping `job` kills ffmpeg
        }
        if let Some(n) = plan::progress_frame(&line) {
            seen(n);
        }
    }
    let out = job.finish(&|| !stop()).map_err(|e| AppError::Export(format!("{what}: {e}")))?.ok_or(AppError::ExportCancelled)?;
    if stop() {
        return Err(AppError::ExportCancelled);
    }
    if out.status.success() {
        return Ok(());
    }
    Err(AppError::Export(format!("{what}: {}", String::from_utf8_lossy(&out.stderr).trim())))
}
