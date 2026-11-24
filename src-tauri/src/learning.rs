//! Magic Trace learning logs (design/magic-trace.md): one JSON file per Magic run the user disagreed with, built
//! by the UI (src/ui/learning.js). They stay on this Mac, in the app's data folder, until a tool processes them.

use crate::error::AppError;
use serde_json::Value;
use std::path::{Path, PathBuf};

pub fn dir() -> PathBuf {
    let home = std::env::var_os("HOME").unwrap_or_default();
    Path::new(&home).join("Library/Application Support/xyz.supercut.editor/learning")
}

/// A file name stem that can't leave the folder (ids.rs).
pub fn plain_id(id: &str) -> Result<&str, AppError> {
    if crate::ids::is_plain(id) { Ok(id) } else { Err(AppError::Learning(format!("not a run id: {id:?}"))) }
}

/// Writes `<dir>/<id>.json`, replacing a log of the same run.
pub fn save(dir: &Path, id: &str, log: &Value) -> Result<PathBuf, AppError> {
    let id = plain_id(id)?;
    let file = dir.join(format!("{id}.json"));
    let json = serde_json::to_string_pretty(log).expect("a JSON value always serializes");
    crate::atomic::write(&file, &json).map_err(|e| AppError::Learning(format!("{}: {e}", file.display())))?;
    Ok(file)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("supercut-learning-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        d.join("learning")
    }

    fn read(file: &Path) -> Value {
        serde_json::from_str(&std::fs::read_to_string(file).unwrap()).unwrap()
    }

    #[test]
    fn a_log_is_written_whole_and_a_rewrite_replaces_it() {
        let d = temp_dir("write");
        let file = save(&d, "run-1", &json!({ "cases": [1] })).unwrap();
        assert_eq!(file, d.join("run-1.json"));
        assert_eq!(read(&file), json!({ "cases": [1] }));
        save(&d, "run-1", &json!({ "cases": [1, 2] })).unwrap();
        assert_eq!(read(&file), json!({ "cases": [1, 2] }));
        assert!(!d.join("run-1.json.tmp").exists());
    }

    #[test]
    fn an_id_that_could_leave_the_folder_is_refused() {
        let d = temp_dir("bad-id");
        for id in ["", "../x", "a/b", "run 1", "run.1"] {
            let e = save(&d, id, &json!({})).unwrap_err();
            assert!(matches!(e, AppError::Learning(_)), "{id}");
        }
        assert!(!d.exists(), "nothing written");
    }
}
