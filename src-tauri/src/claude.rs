//! Finds the user's own `claude` CLI and checks that it is signed in.
//! Apps opened from Finder get a minimal PATH, so we look in the usual install places
//! and hand the child a sane PATH (in case `claude` is a Node script).

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

#[derive(Serialize, Debug, PartialEq)]
pub struct Status {
    /// "missing" | "signed-out" | "ready"
    pub state: &'static str,
    pub message: String,
}

pub fn candidates() -> Vec<PathBuf> {
    let home = PathBuf::from(std::env::var_os("HOME").unwrap_or_default());
    vec![home.join(".local/bin/claude"), "/opt/homebrew/bin/claude".into(), "/usr/local/bin/claude".into()]
}

pub fn find(candidates: &[PathBuf]) -> Option<PathBuf> {
    candidates.iter().find(|p| p.is_file()).cloned()
}

/// Every `claude` we run goes through here.
pub fn command(bin: &Path) -> Command {
    let dir = bin.parent().map(|d| d.display().to_string()).unwrap_or_default();
    let mut cmd = Command::new(bin);
    cmd.env("PATH", format!("{dir}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"))
        // If set, an API key wins over the subscription and bills the user's API account.
        .env_remove("ANTHROPIC_API_KEY");
    cmd
}

pub fn status(bin: Option<PathBuf>) -> Status {
    let Some(bin) = bin else {
        return Status { state: "missing", message: "Install Claude Code to use Magic.".into() };
    };
    let signed_out = Status { state: "signed-out", message: "Open Terminal and run `claude`, then sign in.".into() };
    let Some(out) = run_with_timeout(command(&bin).args(["auth", "status"]), Duration::from_secs(15)) else {
        return signed_out;
    };
    let info: serde_json::Value = serde_json::from_slice(&out).unwrap_or_default();
    if info["loggedIn"] == false {
        return signed_out;
    }
    Status { state: "ready", message: "Claude is ready.".into() }
}

/// stdout of a successful run, or None on failure or timeout.
fn run_with_timeout(cmd: &mut Command, limit: Duration) -> Option<Vec<u8>> {
    let mut child = cmd.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null()).spawn().ok()?;
    let t0 = Instant::now();
    loop {
        match child.try_wait().ok()? {
            Some(code) if code.success() => break,
            Some(_) => return None,
            None if t0.elapsed() > limit => {
                let _ = child.kill();
                return None;
            }
            None => std::thread::sleep(Duration::from_millis(50)),
        }
    }
    let mut out = Vec::new();
    std::io::Read::read_to_end(&mut child.stdout.take()?, &mut out).ok()?;
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_the_first_candidate_that_exists() {
        let real = std::env::current_exe().unwrap();
        assert_eq!(find(&["/nope/claude".into(), real.clone()]), Some(real));
        assert_eq!(find(&["/nope/claude".into()]), None);
    }

    #[test]
    fn missing_claude_says_so_in_plain_words() {
        assert_eq!(status(None).state, "missing");
    }

    #[test]
    fn child_never_gets_an_api_key() {
        let cmd = command(Path::new("/x/bin/claude"));
        let envs: Vec<_> = cmd.get_envs().collect();
        assert!(envs.contains(&("ANTHROPIC_API_KEY".as_ref(), None)), "API key removed");
        assert!(envs.iter().any(|(k, v)| *k == "PATH" && v.unwrap().to_str().unwrap().starts_with("/x/bin:")));
    }

    #[test]
    fn live_status_of_this_macs_claude() {
        let s = status(find(&candidates()));
        println!("# claude: {s:?}");
    }
}
