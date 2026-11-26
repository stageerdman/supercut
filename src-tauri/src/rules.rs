//! The user's own editing rules (feature "Custom AI editing rules"): a JSON list of plain sentences
//! kept on this Mac. Magic Cut hands them to Claude after the built-in rules; see `autocut::prompt::system`.

use crate::error::AppError;
use std::path::{Path, PathBuf};

/// Next to the app's other saved data (the speech model lives in the same folder).
pub fn path() -> PathBuf {
    crate::paths::data("rules.json")
}

/// Trimmed, no empty lines, no repeats, order kept.
pub fn clean(rules: Vec<String>) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for r in rules {
        let r = r.trim();
        if !r.is_empty() && !out.iter().any(|o| o == r) {
            out.push(r.to_owned());
        }
    }
    out
}

/// No file yet means no rules. A file that isn't a list of strings is an error, never "no rules".
pub fn load(file: &Path) -> Result<Vec<String>, AppError> {
    let text = match std::fs::read_to_string(file) {
        Ok(t) => t,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(e) => return Err(err(file, &e)),
    };
    serde_json::from_str(&text).map_err(|e| err(file, &e))
}

/// Cleans, then writes through a temp file and a rename, so a save is all or nothing. Returns what was stored.
pub fn save(file: &Path, rules: Vec<String>) -> Result<Vec<String>, AppError> {
    let rules = clean(rules);
    let json = serde_json::to_string_pretty(&rules).expect("a list of strings always serializes");
    crate::atomic::write(file, &json).map_err(|e| err(file, &e))?;
    Ok(rules)
}

fn err(file: &Path, why: &dyn std::fmt::Display) -> AppError {
    AppError::Rules(format!("{}: {why}", file.display()))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("supercut-rules-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        d.join("nested/rules.json")
    }

    fn strings(v: &[&str]) -> Vec<String> {
        v.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn cleaning_trims_and_drops_empty_and_repeated_rules() {
        let rules = clean(strings(&["  Keep jokes. ", "", "   ", "Cut the intro.", "Keep jokes."]));
        assert_eq!(rules, strings(&["Keep jokes.", "Cut the intro."]));
    }

    #[test]
    fn saved_rules_load_back_and_save_makes_the_folder() {
        let f = temp_file("round-trip");
        let stored = save(&f, strings(&[" Keep jokes.", "Cut the intro."])).unwrap();
        assert_eq!(stored, strings(&["Keep jokes.", "Cut the intro."]));
        assert_eq!(load(&f).unwrap(), stored);
        assert!(!f.with_extension("json.tmp").exists());
    }

    #[test]
    fn saving_an_empty_list_clears_the_rules() {
        let f = temp_file("clear");
        save(&f, strings(&["Keep jokes."])).unwrap();
        save(&f, Vec::new()).unwrap();
        assert!(load(&f).unwrap().is_empty());
    }

    #[test]
    fn no_file_means_no_rules() {
        assert!(load(&temp_file("missing")).unwrap().is_empty());
    }

    #[test]
    fn a_broken_file_is_an_error_not_an_empty_list() {
        let f = temp_file("broken");
        std::fs::create_dir_all(f.parent().unwrap()).unwrap();
        std::fs::write(&f, "{not a list").unwrap();
        let e = load(&f).unwrap_err();
        assert!(matches!(e, AppError::Rules(_)));
        assert!(e.to_string().starts_with("Couldn't read or save your editing rules."), "{e}");
    }
}
