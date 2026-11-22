//! ffmpeg turns any container (mp4, mov, m4v, wav…) into 16 kHz mono f32 samples.
//! The bundled binary is called by absolute path, so Finder's minimal PATH doesn't matter.
//! Samples come straight from stdout: no temp WAV file to write, read and clean up.

use crate::error::AppError;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

pub const RATE: usize = 16_000;

/// The ffmpeg that Tauri bundles next to our own binary (`bundle.externalBin`).
/// `tauri dev` and `tauri build` both put it there, named plain `ffmpeg`.
pub fn bundled_ffmpeg() -> PathBuf {
    let exe = std::env::current_exe().unwrap_or_default();
    exe.with_file_name("ffmpeg")
}

pub fn decode(ffmpeg: &Path, input: &Path) -> Result<Vec<f32>, AppError> {
    decode_at(ffmpeg, input, RATE)
}

/// Mono f32 samples at `rate` Hz (the waveform uses a lower rate than speech).
pub fn decode_at(ffmpeg: &Path, input: &Path, rate: usize) -> Result<Vec<f32>, AppError> {
    let out = Command::new(ffmpeg)
        .args(["-hide_banner", "-loglevel", "error", "-nostdin", "-i"])
        .arg(input)
        .args(["-vn", "-ac", "1", "-ar", &rate.to_string(), "-f", "f32le", "-"])
        .stdin(Stdio::null())
        // .output() drains stdout and stderr together, so a chatty stderr can't block the pipe.
        .output()
        .map_err(|e| AppError::FfmpegStart { ffmpeg: ffmpeg.display().to_string(), why: e.to_string() })?;
    if !out.status.success() {
        // Bytes, not str: a non-UTF-8 or split multi-byte message must not crash us.
        let why = String::from_utf8_lossy(&out.stderr).trim().to_string();
        return Err(AppError::Unreadable { file: input.display().to_string(), why });
    }
    Ok(out.stdout.chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_ffmpeg_is_named_in_the_error() {
        let err = decode(Path::new("/nope/ffmpeg"), Path::new("a.mp4")).unwrap_err();
        assert!(matches!(err, AppError::FfmpegStart { ref ffmpeg, .. } if ffmpeg == "/nope/ffmpeg"), "{err}");
    }
}
