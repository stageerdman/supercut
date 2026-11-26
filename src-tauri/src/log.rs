//! The one logger. Every line names where it came from and the job it belongs to
//! (a trace id such as "part-2"), so any failure can be followed end to end:
//! `magic-cut INFO  transcribe part-2 chunk 3/9`
//! Lines go to stderr and to `logs/magic-cut.log` in the app's data folder, which the debug report sends.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// At this size the log moves to `magic-cut.1.log` (one old file kept), so the folder stays small.
pub const MAX_BYTES: u64 = 2 * 1024 * 1024;

/// Lines from many threads must not interleave or race a rotation.
static FILE_LOCK: Mutex<()> = Mutex::new(());

pub fn dir() -> PathBuf {
    crate::paths::data("logs")
}

pub fn current(dir: &Path) -> PathBuf {
    dir.join("magic-cut.log")
}

pub fn previous(dir: &Path) -> PathBuf {
    dir.join("magic-cut.1.log")
}

pub fn info(scope: &str, trace: &str, msg: impl AsRef<str>) {
    write("INFO ", scope, trace, msg.as_ref());
}

pub fn error(scope: &str, trace: &str, msg: impl AsRef<str>) {
    write("ERROR", scope, trace, msg.as_ref());
}

fn write(level: &str, scope: &str, trace: &str, msg: &str) {
    let line = format!("magic-cut {level} {scope} {trace} {msg}");
    eprintln!("{line}");
    // Tests log too; they must never write into the user's own log.
    if cfg!(not(test)) {
        let at = crate::store::rules::now_ms();
        // The file is a copy of stderr: failing to write it must not fail the work being logged.
        let _ = append(&dir(), &format!("{at} {line}"), MAX_BYTES);
    }
}

/// Appends one line, first moving a full log aside.
pub fn append(dir: &Path, line: &str, max: u64) -> std::io::Result<()> {
    let _held = FILE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    std::fs::create_dir_all(dir)?;
    let file = current(dir);
    if std::fs::metadata(&file).is_ok_and(|m| m.len() >= max) {
        std::fs::rename(&file, previous(dir))?;
    }
    let mut out = std::fs::OpenOptions::new().create(true).append(true).open(&file)?;
    writeln!(out, "{line}")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read(file: PathBuf) -> String {
        std::fs::read_to_string(file).unwrap_or_default()
    }

    #[test]
    fn lines_are_appended_in_order() {
        let d = crate::testkit::temp_dir("log-append");
        append(&d, "one", MAX_BYTES).unwrap();
        append(&d, "two", MAX_BYTES).unwrap();
        assert_eq!(read(current(&d)), "one\ntwo\n");
    }

    #[test]
    fn a_full_log_moves_aside_and_only_one_old_file_is_kept() {
        let d = crate::testkit::temp_dir("log-rotate");
        append(&d, "first-0123456789", 10).unwrap();
        append(&d, "second-0123456789", 10).unwrap();
        assert_eq!((read(previous(&d)), read(current(&d))), ("first-0123456789\n".into(), "second-0123456789\n".into()));
        append(&d, "third", 10).unwrap();
        assert_eq!((read(previous(&d)), read(current(&d))), ("second-0123456789\n".into(), "third\n".into()));
    }
}
