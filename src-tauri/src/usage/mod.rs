//! Token usage per project (updates/2026-11-26 … update v1.md, Part A): every Claude call and every finished
//! export goes into the `ledger`; `report` turns it into per-project figures and the exported-only total.

pub mod ledger;
pub mod report;
pub mod track;

pub use track::Tracker;

use crate::log;
use ledger::Entry;
use serde::Serialize;
use std::path::{Path, PathBuf};

pub fn dir() -> PathBuf {
    crate::paths::data("usage")
}

pub fn ledger_file(dir: &Path) -> PathBuf {
    dir.join("ledger.jsonl")
}

/// Appends `entry`; a failure is logged, never passed on: bookkeeping must not fail Magic or an export.
pub fn record(file: &Path, entry: &Entry, trace: &str) {
    if let Err(e) = ledger::append(file, entry) {
        log::error("usage", trace, format!("couldn't record {entry:?}: {e}"));
    }
}

/// The raw notes, to pull out any time (and for the debug report).
#[derive(Serialize, Debug, PartialEq)]
pub struct Notes {
    pub path: String,
    pub lines: Vec<String>,
}

pub fn notes(file: &Path) -> Result<Notes, crate::error::AppError> {
    let lines = ledger::raw(file)?.lines().filter(|l| !l.trim().is_empty()).map(str::to_owned).collect();
    Ok(Notes { path: file.display().to_string(), lines })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testkit::temp_dir;

    #[test]
    fn notes_give_the_path_and_every_line() {
        let file = ledger_file(&temp_dir("usage-notes"));
        record(&file, &ledger::sample_call(1, Some("p"), 3), "t");
        record(&file, &ledger::sample_call(2, None, 4), "t");
        let n = notes(&file).unwrap();
        assert_eq!(n.path, file.display().to_string());
        assert_eq!(n.lines.len(), 2);
        assert!(n.lines[0].contains(r#""project":"p""#));
    }

    #[test]
    fn a_failed_record_is_only_logged() {
        let dir = temp_dir("usage-blocked");
        std::fs::create_dir_all(&dir).unwrap();
        let blocker = dir.join("not-a-dir");
        std::fs::write(&blocker, "").unwrap();
        record(&blocker.join("ledger.jsonl"), &ledger::sample_call(1, None, 1), "t");
        assert!(ledger::append(&blocker.join("ledger.jsonl"), &ledger::sample_call(1, None, 1)).is_err(), "it did fail");
    }
}
