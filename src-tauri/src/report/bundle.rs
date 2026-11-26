//! The debug report's one fixed bundle (design/debug-report.md, "What is sent"), built from plain inputs.
//! Pure: reading files and asking the Mac happen in `report::gather`.

use serde::Serialize;

/// Everything that leaves the Mac. Adding a field means re-reading the hint above the button.
#[derive(Serialize, Debug, PartialEq)]
pub struct Bundle {
    pub install: String,
    pub app: String,
    pub build: String,
    pub macos: String,
    pub model: String,
    pub disk: u64,
    /// "missing" | "signed-out" | "ready": never an account or an email.
    pub claude: String,
    pub log: String,
    pub usage: Vec<String>,
}

/// The last `max` bytes of the log; when the current file is shorter, the end of the previous one comes first.
pub fn log_tail(current: &[u8], previous: &[u8], max: usize) -> String {
    let now = last(current, max);
    let before = last(previous, max - now.len());
    let mut both = before.to_vec();
    both.extend_from_slice(now);
    String::from_utf8_lossy(&both).into_owned()
}

fn last(bytes: &[u8], n: usize) -> &[u8] {
    &bytes[bytes.len().saturating_sub(n)..]
}

/// The bundle as JSON with every `home` path written as `~`, so the Mac's account name isn't sent.
pub fn to_json(bundle: &Bundle, home: &str) -> String {
    let json = serde_json::to_string(bundle).expect("a bundle of strings and numbers always serializes");
    scrub(&json, home)
}

fn scrub(json: &str, home: &str) -> String {
    let home = home.trim_end_matches('/');
    if home.is_empty() {
        return json.to_owned();
    }
    let escaped = serde_json::to_string(home).expect("a string serializes");
    json.replace(home, "~").replace(escaped.trim_matches('"'), "~")
}

#[cfg(test)]
pub fn sample(log: &str, usage: &[&str]) -> Bundle {
    Bundle {
        install: "id".into(),
        app: "1".into(),
        build: "b".into(),
        macos: "15".into(),
        model: "Mac".into(),
        disk: 1,
        claude: "ready".into(),
        log: log.into(),
        usage: usage.iter().map(|s| s.to_string()).collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_tail_keeps_the_newest_bytes() {
        assert_eq!(log_tail(b"0123456789", b"old", 4), "6789");
    }

    #[test]
    fn a_short_log_is_led_by_the_end_of_the_previous_one() {
        assert_eq!(log_tail(b"new\n", b"older\nold\n", 8), "old\nnew\n");
        assert_eq!(log_tail(b"", b"", 8), "");
    }

    #[test]
    fn no_home_path_is_left_anywhere() {
        let b = sample("open /Users/ana/Movies/talk.mov", &[r#"{"file":"/Users/ana/Movies/a \"b\".mov"}"#]);
        let json = to_json(&b, "/Users/ana/");
        assert!(!json.contains("/Users/ana"), "{json}");
        assert!(json.contains("~/Movies/talk.mov"), "{json}");
    }

    #[test]
    fn a_home_with_quotes_is_hidden_in_its_escaped_form_too() {
        let json = to_json(&sample(r#"/Users/a"b/x"#, &[]), r#"/Users/a"b"#);
        assert!(!json.contains("a\\\"b"), "{json}");
        assert!(json.contains("~/x"), "{json}");
    }

    #[test]
    fn no_home_means_nothing_is_replaced() {
        assert!(to_json(&sample("/tmp/x", &[]), "").contains("/tmp/x"));
    }
}
