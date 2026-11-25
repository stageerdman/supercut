//! One ffmpeg of the export: its progress lines handed on as they come, killed as soon as the export is stopped.

use super::plan;
use crate::error::AppError;
use std::io::{BufRead, BufReader};
use std::path::Path;
use std::process::{Child, Command, Stdio};

/// Runs ffmpeg with `args` (which send progress to stdout), telling `seen` each frame count it reports.
/// `stop` is asked at every line (ffmpeg writes one about twice a second); once it says yes, ffmpeg is killed and
/// this returns `ExportCancelled`. `what` names the step in the error.
pub fn ffmpeg(ffmpeg: &Path, args: &[String], what: &str, stop: &dyn Fn() -> bool, seen: &mut dyn FnMut(u64)) -> Result<(), AppError> {
    let mut child = Command::new(ffmpeg)
        .args(args)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::FfmpegStart { ffmpeg: ffmpeg.display().to_string(), why: e.to_string() })?;
    let lines = BufReader::new(child.stdout.take().expect("stdout is piped")).lines();
    for line in lines.map_while(Result::ok) {
        if stop() {
            return Err(kill(child));
        }
        if let Some(n) = plan::progress_frame(&line) {
            seen(n);
        }
    }
    let out = child.wait_with_output().map_err(|e| AppError::Export(format!("{what}: {e}")))?;
    if stop() {
        return Err(AppError::ExportCancelled);
    }
    if out.status.success() {
        return Ok(());
    }
    Err(AppError::Export(format!("{what}: {}", String::from_utf8_lossy(&out.stderr).trim())))
}

fn kill(mut child: Child) -> AppError {
    let _ = child.kill();
    let _ = child.wait();
    AppError::ExportCancelled
}
