//! The ledger: one plain JSON line per Claude call and per finished export, append-only.
//! It lives outside `projects/`, so the 30-day sweep and Delete never touch it.

use crate::claude::ask::Usage;
use crate::error::AppError;
use crate::log;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::Path;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Entry {
    /// One Claude call. `project` is None for calls made outside a project (self-test, CLI): kept, never counted.
    Call {
        at: u64,
        #[serde(default)]
        project: Option<String>,
        /// The project's name at the time, so the report can name it after the project is gone.
        #[serde(default, skip_serializing_if = "Option::is_none")]
        name: Option<String>,
        trace: String,
        #[serde(default)]
        model: Option<String>,
        #[serde(flatten)]
        usage: Usage,
    },
    /// The project's video was exported: from now on all its calls count.
    Export { at: u64, project: String, name: String },
}

/// Adds one line at the end of `file`, making its folder if needed.
pub fn append(file: &Path, entry: &Entry) -> Result<(), AppError> {
    let fail = |e: std::io::Error| AppError::Usage(format!("{}: {e}", file.display()));
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir).map_err(fail)?;
    }
    let line = serde_json::to_string(entry).expect("an entry always serializes");
    let mut f = std::fs::OpenOptions::new().create(true).append(true).open(file).map_err(fail)?;
    writeln!(f, "{line}").map_err(fail)
}

/// The ledger's raw text; empty when nothing was recorded yet.
pub fn raw(file: &Path) -> Result<String, AppError> {
    match std::fs::read_to_string(file) {
        Ok(text) => Ok(text),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(AppError::Usage(format!("{}: {e}", file.display()))),
    }
}

/// Every entry, oldest first. A line that doesn't parse is logged and skipped, never fatal.
pub fn read(file: &Path) -> Result<Vec<Entry>, AppError> {
    let text = raw(file)?;
    let parse = |(n, line): (usize, &str)| match serde_json::from_str(line) {
        Ok(entry) => Some(entry),
        Err(e) => {
            log::error("usage", "ledger", format!("{} line {}: {e}", file.display(), n + 1));
            None
        }
    };
    Ok(text.lines().enumerate().filter(|(_, l)| !l.trim().is_empty()).filter_map(parse).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testkit::temp_dir;

    pub fn call(at: u64, project: Option<&str>, input: u64) -> Entry {
        let usage = Usage { input, output: 1, cache_read: 2, cache_write: 3, cost_usd: 0.5 };
        Entry::Call { at, project: project.map(str::to_owned), name: None, trace: "t".into(), model: None, usage }
    }

    #[test]
    fn entries_read_back_in_order() {
        let file = temp_dir("ledger-order").join("usage/ledger.jsonl");
        let export = Entry::Export { at: 2, project: "p1".into(), name: "my-video".into() };
        for e in [call(1, Some("p1"), 10), export.clone(), call(3, None, 5)] {
            append(&file, &e).unwrap();
        }
        assert_eq!(read(&file).unwrap(), vec![call(1, Some("p1"), 10), export, call(3, None, 5)]);
    }

    #[test]
    fn lines_are_the_plain_documented_shape() {
        let file = temp_dir("ledger-shape").join("ledger.jsonl");
        append(&file, &call(1, Some("p1"), 10)).unwrap();
        let line: serde_json::Value = serde_json::from_str(raw(&file).unwrap().trim()).unwrap();
        let want = r#"{"kind":"call","at":1,"project":"p1","trace":"t","model":null,
            "input":10,"output":1,"cacheRead":2,"cacheWrite":3,"costUsd":0.5}"#;
        assert_eq!(line, serde_json::from_str::<serde_json::Value>(want).unwrap());
    }

    #[test]
    fn a_bad_line_is_skipped_not_fatal() {
        let file = temp_dir("ledger-bad").join("ledger.jsonl");
        append(&file, &call(1, Some("p1"), 10)).unwrap();
        std::fs::OpenOptions::new().append(true).open(&file).unwrap().write_all(b"{half a line\n\n").unwrap();
        append(&file, &call(2, Some("p1"), 20)).unwrap();
        assert_eq!(read(&file).unwrap(), vec![call(1, Some("p1"), 10), call(2, Some("p1"), 20)]);
    }

    #[test]
    fn no_ledger_yet_reads_as_empty() {
        let file = temp_dir("ledger-none").join("ledger.jsonl");
        assert_eq!(read(&file).unwrap(), vec![]);
        assert_eq!(raw(&file).unwrap(), "");
    }
}

#[cfg(test)]
pub use tests::call as sample_call;
