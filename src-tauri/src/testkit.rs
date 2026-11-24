//! Test helpers for the modules that run a real ffmpeg on real files.

use std::path::{Path, PathBuf};
use std::process::Command;

/// The ffmpeg `npm ci` puts in node_modules; the tests that need a real one skip without it.
pub fn ffmpeg() -> Option<PathBuf> {
    let f = Path::new(env!("CARGO_MANIFEST_DIR")).join("../node_modules/ffmpeg-static/ffmpeg");
    f.exists().then_some(f)
}

/// A fresh, empty folder for one test (not created: a test can check nothing was written).
pub fn temp_dir(name: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("supercut-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    d
}

/// Runs ffmpeg quietly (overwriting outputs) and fails the test if it fails. Makes the output's folder.
pub fn ffmpeg_ok(ff: &Path, args: &[&str]) {
    if let Some(dir) = args.last().and_then(|out| Path::new(out).parent()) {
        std::fs::create_dir_all(dir).unwrap();
    }
    let out = Command::new(ff).args(["-hide_banner", "-loglevel", "error", "-nostdin", "-y"]).args(args).output().unwrap();
    assert!(out.status.success(), "ffmpeg {args:?}: {}", String::from_utf8_lossy(&out.stderr));
}

/// (video seconds, audio seconds), measured by decoding each stream and reading ffmpeg's last time.
pub fn lengths(ff: &Path, file: &Path) -> (f64, f64) {
    let time = |stream: &str| {
        let out = Command::new(ff).args(["-hide_banner", "-i"]).arg(file).args(["-map", stream, "-f", "null", "-"]).output().unwrap();
        let text = String::from_utf8_lossy(&out.stderr).into_owned();
        let at = text.rfind("time=").expect("ffmpeg reports the time") + 5;
        let hms: Vec<f64> = text[at..at + 11].split(':').map(|x| x.parse().unwrap()).collect();
        hms[0] * 3600.0 + hms[1] * 60.0 + hms[2]
    };
    (time("0:v"), time("0:a"))
}
