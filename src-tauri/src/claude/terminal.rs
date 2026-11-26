//! Sets Claude up for the user in Terminal: install it if it's missing, then sign in, then bring Magic Cut back.
//! A `.command` file opens in Terminal with no Automation prompt, unlike scripting Terminal.

use super::setup::{self, Status};
use crate::error::AppError;
use std::os::unix::fs::PermissionsExt;
use std::path::{Path, PathBuf};
use std::process::Command;

const INSTALL: &str = "curl -fsSL https://claude.ai/install.sh | bash";
/// Where the official installer puts `claude` (the first of `setup::candidates()`).
const INSTALLED: &str = "\"$HOME/.local/bin/claude\"";
const APP_ID: &str = "xyz.supercut.editor";
const FILE: &str = "magic-cut-claude-setup.command";

/// The Terminal script for this state, or None when Claude is ready (nothing to do).
/// `bin` is the `claude` that `setup::find` found; a signed-out Mac signs in with that one.
pub fn script(state: &str, bin: Option<&Path>) -> Option<String> {
    let login = match (state, bin) {
        ("ready", _) => return None,
        ("signed-out", Some(bin)) => quote(bin),
        _ => INSTALLED.to_string(),
    };
    let mut lines = vec!["#!/bin/zsh".to_string(), "setopt pipefail".into()];
    if state == "missing" {
        lines.push(step("Magic Cut is installing Claude Code…", INSTALL));
    }
    lines.push(step("Now sign in to Claude in your browser.", &format!("{login} auth login")));
    // Only reached when sign-in worked, so a failed step leaves its error on screen.
    lines.push(format!("echo \"All set. Taking you back to Magic Cut…\"\nopen -b {APP_ID}"));
    Some(lines.join("\n") + "\n")
}

/// Reads the status itself and opens Terminal on the matching script. A ready Claude opens nothing.
pub fn open_setup() -> Result<(), AppError> {
    let bin = setup::find(&setup::candidates());
    let Status { state, .. } = setup::status(bin.clone());
    let Some(text) = script(state, bin.as_deref()) else { return Ok(()) };
    let file = write(&std::env::temp_dir(), &text)?;
    let st = Command::new("open").arg("-a").arg("Terminal").arg(&file).status().map_err(fail)?;
    if !st.success() {
        return Err(AppError::ClaudeSetup(format!("open -a Terminal exited with {st}")));
    }
    Ok(())
}

/// Writes the script as an executable `.command` file in `dir`.
fn write(dir: &Path, text: &str) -> Result<PathBuf, AppError> {
    let file = dir.join(FILE);
    std::fs::write(&file, text).map_err(fail)?;
    std::fs::set_permissions(&file, std::fs::Permissions::from_mode(0o755)).map_err(fail)?;
    Ok(file)
}

fn step(say: &str, run: &str) -> String {
    format!("echo \"{say}\"\n{run} || exit 1")
}

/// A path as one zsh word, whatever it holds.
fn quote(p: &Path) -> String {
    format!("'{}'", p.display().to_string().replace('\'', r"'\''"))
}

fn fail(e: std::io::Error) -> AppError {
    AppError::ClaudeSetup(e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::claude::ask::fake;

    fn lines(state: &str, bin: Option<&Path>) -> Vec<String> {
        script(state, bin).unwrap().lines().map(String::from).collect()
    }

    fn position(lines: &[String], has: &str) -> usize {
        lines.iter().position(|l| l.contains(has)).unwrap_or_else(|| panic!("no line with {has:?}"))
    }

    #[test]
    fn missing_installs_then_signs_in_with_the_installed_claude_then_comes_back() {
        let l = lines("missing", None);
        assert_eq!(l[0], "#!/bin/zsh");
        let install = position(&l, "install.sh | bash || exit 1");
        let login = position(&l, "\"$HOME/.local/bin/claude\" auth login || exit 1");
        assert!(install < login);
        assert_eq!(l.last().unwrap(), "open -b xyz.supercut.editor");
        assert!(l[install - 1].starts_with("echo ") && l[login - 1].starts_with("echo "), "each step is announced");
    }

    #[test]
    fn signed_out_signs_in_with_the_claude_found_and_installs_nothing() {
        let l = lines("signed-out", Some(Path::new("/opt/homebrew/bin/claude")));
        assert!(!l.iter().any(|x| x.contains("install.sh")));
        let login = position(&l, "'/opt/homebrew/bin/claude' auth login || exit 1");
        assert!(login < l.len() - 1);
        assert_eq!(l.last().unwrap(), "open -b xyz.supercut.editor");
    }

    #[test]
    fn a_path_with_a_quote_stays_one_word() {
        assert_eq!(quote(Path::new("/Users/o'neil/claude")), r"'/Users/o'\''neil/claude'");
    }

    #[test]
    fn ready_needs_no_script() {
        assert_eq!(script("ready", Some(Path::new("/x/claude"))), None);
    }

    #[test]
    fn the_script_file_is_executable_zsh() {
        let dir = crate::testkit::temp_dir("claude-terminal");
        std::fs::create_dir_all(&dir).unwrap();
        for (state, bin) in [("missing", None), ("signed-out", Some(Path::new("/a b/claude")))] {
            let file = write(&dir, &script(state, bin).unwrap()).unwrap();
            assert_eq!(file.file_name().unwrap(), FILE);
            assert_eq!(std::fs::metadata(&file).unwrap().permissions().mode() & 0o777, 0o755);
            let parsed = Command::new("/bin/zsh").arg("-n").arg(&file).status().unwrap();
            assert!(parsed.success(), "{state}: zsh can't parse the script");
        }
    }

    #[test]
    fn status_tells_signed_out_from_ready() {
        let out = fake::claude("claude-out", r#"echo '{"loggedIn":false}'"#);
        let ready = fake::claude("claude-in", r#"echo '{"loggedIn":true}'"#);
        let failing = fake::claude("claude-fails", "exit 1");
        assert_eq!(setup::status(Some(out)).state, "signed-out");
        assert_eq!(setup::status(Some(ready)).state, "ready");
        assert_eq!(setup::status(Some(failing)).state, "signed-out");
        assert_eq!(setup::status(None).state, "missing");
    }
}
