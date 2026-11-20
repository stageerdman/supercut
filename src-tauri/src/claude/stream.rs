//! Reads `claude -p --output-format stream-json` output line by line and decides what the
//! call came to: the structured answer, or one of three plain errors (signed out, busy, failed).
//! Pure: no process here, so every failure shape is tested from text alone.

use crate::error::AppError;
use serde_json::Value;

#[derive(Default)]
pub struct Stream {
    result: Option<Value>,
    /// Kind of the latest `system/api_retry` event, e.g. "rate_limit".
    retry: Option<String>,
    /// The last line that wasn't JSON (CLI warnings land here): a detail for the error.
    noise: Option<String>,
}

impl Stream {
    /// Feeds one stdout line. Returns the retry kind if this line is a retry event,
    /// so the caller can log that Claude is waiting.
    pub fn line(&mut self, line: &str) -> Option<&str> {
        let line = line.trim();
        if line.is_empty() {
            return None;
        }
        let Ok(v) = serde_json::from_str::<Value>(line) else {
            self.noise = Some(line.to_owned());
            return None;
        };
        match (v["type"].as_str(), v["subtype"].as_str()) {
            (Some("result"), _) => self.result = Some(v),
            (Some("system"), Some("api_retry")) => {
                self.retry = Some(v["error"].as_str().unwrap_or("unknown").to_owned());
                return self.retry.as_deref();
            }
            _ => {}
        }
        None
    }

    /// The answer, once the process is done. `fallback` explains a run that ended
    /// without a result line (stderr, exit code).
    pub fn finish(self, fallback: &str) -> Result<Value, AppError> {
        let Some(r) = self.result else {
            let detail = self.noise.as_deref().filter(|_| fallback.is_empty()).unwrap_or(fallback);
            return Err(classify(detail, self.retry.as_deref()));
        };
        if r["is_error"] == true {
            let text = r["result"].as_str().or(r["subtype"].as_str()).unwrap_or("unknown error");
            return Err(classify(text, self.retry.as_deref()));
        }
        match r.get("structured_output") {
            Some(answer) if !answer.is_null() => Ok(answer.clone()),
            _ => Err(AppError::ClaudeFailed("the answer didn't have the expected shape".into())),
        }
    }
}

fn classify(detail: &str, retry: Option<&str>) -> AppError {
    let d = detail.to_lowercase();
    let has = |words: &[&str]| words.iter().any(|w| d.contains(w));
    if retry == Some("authentication_failed") || has(&["login", "log in", "logged in", "invalid api key", "oauth"]) {
        AppError::ClaudeSignedOut
    } else if matches!(retry, Some("rate_limit" | "overloaded")) || has(&["usage limit", "rate limit", "overloaded"]) {
        AppError::ClaudeBusy
    } else {
        AppError::ClaudeFailed(detail.trim().to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn read(lines: &[&str], fallback: &str) -> Result<Value, AppError> {
        let mut s = Stream::default();
        for l in lines {
            s.line(l);
        }
        s.finish(fallback)
    }

    const INIT: &str = r#"{"type":"system","subtype":"init","session_id":"x"}"#;

    #[test]
    fn the_structured_answer_comes_back() {
        let result = r#"{"type":"result","subtype":"success","is_error":false,"result":"","structured_output":{"keep":[2]}}"#;
        assert_eq!(read(&[INIT, "", result], ""), Ok(json!({"keep": [2]})));
    }

    #[test]
    fn a_result_without_structured_output_is_a_failure() {
        let result = r#"{"type":"result","subtype":"success","is_error":false,"result":"Sure! Keep 2."}"#;
        assert!(matches!(read(&[result], ""), Err(AppError::ClaudeFailed(_))));
    }

    #[test]
    fn logged_out_reads_as_sign_in() {
        let result = r#"{"type":"result","subtype":"success","is_error":true,"result":"Invalid API key · Please run /login"}"#;
        assert_eq!(read(&[result], ""), Err(AppError::ClaudeSignedOut));
        let retry = r#"{"type":"system","subtype":"api_retry","error":"authentication_failed"}"#;
        assert_eq!(read(&[retry], "exit 1"), Err(AppError::ClaudeSignedOut));
    }

    #[test]
    fn rate_limits_and_usage_limits_read_as_busy() {
        let retry = r#"{"type":"system","subtype":"api_retry","error":"rate_limit","attempt":3}"#;
        let fail = r#"{"type":"result","subtype":"error_during_execution","is_error":true}"#;
        assert_eq!(read(&[retry, fail], ""), Err(AppError::ClaudeBusy));
        let limit = r#"{"type":"result","is_error":true,"result":"Claude AI usage limit reached|1764000000"}"#;
        assert_eq!(read(&[limit], ""), Err(AppError::ClaudeBusy));
    }

    #[test]
    fn a_retry_line_is_reported_to_the_caller() {
        let mut s = Stream::default();
        assert_eq!(s.line(r#"{"type":"system","subtype":"api_retry","error":"overloaded"}"#), Some("overloaded"));
        assert_eq!(s.line(INIT), None);
    }

    #[test]
    fn other_errors_keep_their_details() {
        let turns = r#"{"type":"result","subtype":"error_max_turns","is_error":true}"#;
        assert_eq!(read(&[turns], ""), Err(AppError::ClaudeFailed("error_max_turns".into())));
        assert_eq!(read(&[], "exit 2: unknown option '--json-schema'"), Err(AppError::ClaudeFailed("exit 2: unknown option '--json-schema'".into())));
    }

    #[test]
    fn non_json_output_is_kept_as_the_detail() {
        assert_eq!(read(&["Error: something broke", INIT], ""), Err(AppError::ClaudeFailed("Error: something broke".into())));
    }
}
