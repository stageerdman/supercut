//! ffmpeg turns any container (mp4, mov, mkv, m4a, wav…) into 16 kHz mono f32 samples.
//! The bundled binary is called by absolute path, so Finder's minimal PATH doesn't matter.
//! Samples come straight from stdout: no temp WAV file to write, read and clean up.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

pub const RATE: usize = 16_000;

/// The ffmpeg that Tauri bundles next to our own binary (`bundle.externalBin`).
/// `tauri dev` and `tauri build` both put it there, named plain `ffmpeg`.
pub fn bundled_ffmpeg() -> PathBuf {
    let exe = std::env::current_exe().unwrap_or_default();
    exe.with_file_name("ffmpeg")
}

pub fn decode(ffmpeg: &Path, input: &Path) -> Result<Vec<f32>, String> {
    let out = Command::new(ffmpeg)
        .args(["-hide_banner", "-loglevel", "error", "-nostdin", "-i"])
        .arg(input)
        .args(["-vn", "-ac", "1", "-ar", "16000", "-f", "f32le", "-"])
        .stdin(Stdio::null())
        // .output() drains stdout and stderr together, so a chatty stderr can't block the pipe.
        .output()
        .map_err(|e| format!("Couldn't start ffmpeg ({}): {e}", ffmpeg.display()))?;
    if !out.status.success() {
        // Bytes, not str: a non-UTF-8 or split multi-byte message must not crash us.
        let why = String::from_utf8_lossy(&out.stderr);
        return Err(format!("Couldn't read the sound in {}: {}", input.display(), why.trim()));
    }
    Ok(out.stdout.chunks_exact(4).map(|b| f32::from_le_bytes([b[0], b[1], b[2], b[3]])).collect())
}
