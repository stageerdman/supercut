//! One question to the user's `claude`, answered as JSON that matches a schema.
//! Runs `claude -p` on their subscription: no API key, no `--bare` (bare mode ignores the
//! subscription login), no tools, no saved session, in an empty folder so no project
//! CLAUDE.md, hooks or MCP config get picked up. The prompt goes in on stdin.

use super::setup::command;
use super::stream::Stream;
use crate::error::AppError;
use crate::log;
use serde_json::Value;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::mpsc::{self, RecvTimeoutError};
use std::thread;
use std::time::{Duration, Instant};

pub struct Ask<'a> {
    pub prompt: &'a str,
    pub system: &'a str,
    pub schema: &'a Value,
}

/// Fast and good enough to judge takes; the user's default model may be slower.
const MODEL: &str = "sonnet";

pub fn args(ask: &Ask) -> Vec<String> {
    let flags = ["-p", "--output-format", "stream-json", "--verbose", "--tools", "", "--strict-mcp-config", "--no-session-persistence"];
    let mut args: Vec<String> = flags.iter().map(|s| s.to_string()).collect();
    args.extend(["--model", MODEL, "--json-schema"].map(String::from));
    args.push(ask.schema.to_string());
    args.extend(["--append-system-prompt".to_owned(), ask.system.to_owned()]);
    args
}

/// Asks and waits up to `limit`. `trace` tags the log lines.
pub fn ask(bin: &Path, ask: &Ask, limit: Duration, trace: &str) -> Result<Value, AppError> {
    log::info("claude", trace, format!("ask: {} chars, up to {} s", ask.prompt.len(), limit.as_secs()));
    let t0 = Instant::now();
    let result = run(bin, ask, limit, trace);
    match &result {
        Ok(_) => log::info("claude", trace, format!("answered in {:.1} s", t0.elapsed().as_secs_f64())),
        Err(e) => log::error("claude", trace, format!("{} failed: {e}", bin.display())),
    }
    result
}

fn run(bin: &Path, ask: &Ask, limit: Duration, trace: &str) -> Result<Value, AppError> {
    let mut child = command(bin)
        .args(args(ask))
        .current_dir(quiet_dir()?)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| AppError::ClaudeFailed(format!("couldn't start {}: {e}", bin.display())))?;

    // Feed and drain on threads so a full pipe can never deadlock the call.
    let mut stdin = child.stdin.take().expect("piped stdin");
    let prompt = ask.prompt.to_owned();
    let writer = thread::spawn(move || stdin.write_all(prompt.as_bytes()));
    let mut stderr = child.stderr.take().expect("piped stderr");
    let err_reader = thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = stderr.read_to_end(&mut bytes); // best effort: only used as error detail
        String::from_utf8_lossy(&bytes).into_owned()
    });
    let lines = spawn_line_reader(child.stdout.take().expect("piped stdout"));

    let deadline = Instant::now() + limit;
    let mut stream = Stream::default();
    loop {
        match lines.recv_timeout(deadline.saturating_duration_since(Instant::now())) {
            Ok(line) => {
                if let Some(kind) = stream.line(&line) {
                    log::info("claude", trace, format!("waiting: Claude asked to retry ({kind})"));
                }
            }
            Err(RecvTimeoutError::Disconnected) => break,
            Err(RecvTimeoutError::Timeout) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(AppError::ClaudeFailed(format!("no answer after {} s", limit.as_secs())));
            }
        }
    }

    let exit = child.wait().map_err(|e| AppError::ClaudeFailed(format!("lost the claude process: {e}")))?;
    if let Ok(Err(e)) = writer.join() {
        // Claude quit before reading everything; its own output says why.
        log::info("claude", trace, format!("prompt not fully sent: {e}"));
    }
    let stderr = err_reader.join().unwrap_or_default();
    let fallback = if exit.success() { stderr.trim().to_owned() } else { format!("{exit}: {}", stderr.trim()) };
    stream.finish(fallback.trim_end_matches(": "))
}

/// Lines as they arrive. Raw bytes, decoded lossily: one bad byte must not lose the answer.
fn spawn_line_reader(out: impl Read + Send + 'static) -> mpsc::Receiver<String> {
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        for line in BufReader::new(out).split(b'\n').map_while(Result::ok) {
            if tx.send(String::from_utf8_lossy(&line).into_owned()).is_err() {
                break;
            }
        }
    });
    rx
}

/// An empty folder to run in, so nothing project-specific is loaded.
fn quiet_dir() -> Result<PathBuf, AppError> {
    let dir = std::env::temp_dir().join("supercut-claude");
    std::fs::create_dir_all(&dir).map_err(|e| AppError::ClaudeFailed(format!("couldn't make {}: {e}", dir.display())))?;
    Ok(dir)
}

#[cfg(test)]
pub mod fake {
    //! A stand-in `claude`: a shell script that prints canned stream-json, so the
    //! process plumbing (stdin, stdout, exit codes, timeout) is tested without the network.
    use std::os::unix::fs::PermissionsExt;
    use std::path::PathBuf;

    pub fn claude(name: &str, script: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("supercut-fake-claude-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let bin = dir.join(name);
        std::fs::write(&bin, format!("#!/bin/sh\n{script}\n")).unwrap();
        std::fs::set_permissions(&bin, std::fs::Permissions::from_mode(0o755)).unwrap();
        bin
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    const LIMIT: Duration = Duration::from_secs(10);

    fn call(bin: &Path, limit: Duration) -> Result<Value, AppError> {
        let schema = json!({"type": "object"});
        ask(bin, &Ask { prompt: "hello claude", system: "be brief", schema: &schema }, limit, "test")
    }

    #[test]
    fn runs_on_the_subscription_with_no_tools_and_the_schema() {
        let schema = json!({"type": "object"});
        let a = args(&Ask { prompt: "p", system: "rules", schema: &schema });
        assert!(!a.contains(&"--bare".to_owned()), "bare mode ignores the subscription login");
        let after = |flag: &str| a[a.iter().position(|x| x == flag).unwrap() + 1].clone();
        assert_eq!(after("--tools"), "");
        assert_eq!(after("--json-schema"), r#"{"type":"object"}"#);
        assert_eq!(after("--append-system-prompt"), "rules");
        assert_eq!(after("--output-format"), "stream-json");
    }

    #[test]
    fn the_prompt_goes_in_on_stdin_and_the_answer_comes_back() {
        // Echoes the prompt it read back inside the structured answer.
        let bin = fake::claude(
            "echo",
            r#"p=$(cat); printf '{"type":"system","subtype":"init"}\n{"type":"result","is_error":false,"structured_output":{"heard":"%s"}}\n' "$p""#,
        );
        assert_eq!(call(&bin, LIMIT), Ok(json!({"heard": "hello claude"})));
    }

    #[test]
    fn a_crash_reports_stderr_and_exit_code() {
        let bin = fake::claude("crash", "echo 'error: unknown option --json-schema' >&2; exit 2");
        let err = call(&bin, LIMIT).unwrap_err().to_string();
        assert!(err.contains("unknown option --json-schema") && err.contains("2"), "{err}");
    }

    #[test]
    fn logged_out_claude_gives_the_sign_in_message() {
        let bin = fake::claude("logged-out", r#"echo '{"type":"result","is_error":true,"result":"Not logged in · Please run /login"}'; exit 1"#);
        assert_eq!(call(&bin, LIMIT), Err(AppError::ClaudeSignedOut));
    }

    #[test]
    fn a_hung_claude_is_stopped_at_the_time_limit() {
        let bin = fake::claude("hang", "exec sleep 30");
        let t0 = Instant::now();
        let err = call(&bin, Duration::from_millis(300)).unwrap_err();
        assert!(t0.elapsed() < Duration::from_secs(5), "didn't wait for the child");
        assert!(err.to_string().starts_with("Claude couldn't answer: no answer after"), "{err}");
    }

    #[test]
    fn a_binary_that_cant_start_says_which() {
        let err = call(Path::new("/nope/claude"), LIMIT).unwrap_err().to_string();
        assert!(err.starts_with("Claude couldn't answer: couldn't start /nope/claude"), "{err}");
    }
}
