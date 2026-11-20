//! Magic's engine: transcript words → proposed cuts.
//! `lines` splits the words, `similar` finds repeated takes, `prompt` is what Claude reads,
//! `decide` turns Claude's keep/drop (plus the last-take rule) into cuts.

pub mod decide;
pub mod lines;
mod prompt;
mod similar;

use crate::claude::ask::{self, Ask};
use crate::claude::picks;
use crate::error::AppError;
use crate::log;
use decide::Cut;
use lines::PartWords;
use serde_json::Value;
use std::path::Path;
use std::time::Duration;

pub use prompt::RULES;

/// A long recording is a few hundred lines; Claude needs more than the self-test's 120 s.
const LIMIT: Duration = Duration::from_secs(300);

/// The engine without I/O. `custom_rules` is the hook for the user's own editing rules;
/// `ask_claude` gets the question and returns Claude's JSON answer.
pub fn propose(
    parts: &[PartWords],
    custom_rules: &[String],
    ask_claude: impl FnOnce(&Ask) -> Result<Value, AppError>,
) -> Result<Vec<Cut>, AppError> {
    let lines = lines::split(parts);
    if lines.is_empty() {
        return Ok(Vec::new());
    }
    let groups = similar::groups(&lines);
    let (schema, system, transcript) = (picks::schema(), prompt::system(custom_rules), prompt::transcript(&lines, &groups));
    let answer = ask_claude(&Ask { prompt: &transcript, system: &system, schema: &schema })?;
    let picks = decide::keep_last_takes(picks::parse(answer, lines.len() as u32)?, &groups);
    Ok(decide::cuts(&lines, &picks.drop))
}

/// The real thing: this Mac's `claude` at `bin`. `trace` tags the log lines.
pub fn run(bin: &Path, parts: &[PartWords], trace: &str) -> Result<Vec<Cut>, AppError> {
    let cuts = propose(parts, &[], |q| ask::ask(bin, q, LIMIT, trace))?;
    log::info("autocut", trace, format!("{} cuts proposed", cuts.len()));
    Ok(cuts)
}

#[cfg(test)]
mod tests {
    use super::lines::sample::part;
    use super::*;
    use crate::claude::ask::fake;
    use serde_json::json;

    const RETAKES: &str = "Hello there. This is my new video. This is my brand new video. Bye.";

    #[test]
    fn claude_sees_numbered_lines_and_the_groups() {
        let mut seen = String::new();
        let answer = json!({"keep": [1, 2, 3, 4], "drop": []});
        propose(&[part(1, RETAKES)], &[], |q| {
            seen = q.prompt.to_owned();
            Ok(answer)
        })
        .unwrap();
        assert!(seen.starts_with("1: Hello there.\n2: This is my new video.\n") && seen.ends_with("one line: 2, 3\n"), "{seen}");
    }

    #[test]
    fn the_last_take_is_kept_even_if_claude_picks_the_first() {
        let answer = json!({"keep": [1, 2, 4], "drop": [{"id": 3, "reason": "worse"}]});
        let cuts = propose(&[part(1, RETAKES)], &[], |_| Ok(answer)).unwrap();
        assert_eq!(cuts.len(), 1);
        assert_eq!((cuts[0].from, cuts[0].to, cuts[0].reason.as_str()), (2, 7, decide::EARLIER_TAKE));
    }

    #[test]
    fn custom_rules_reach_claude() {
        let mut system = String::new();
        let answer = json!({"keep": [1], "drop": []});
        propose(&[part(1, "Hi.")], &["Keep every joke.".into()], |q| {
            system = q.system.to_owned();
            Ok(answer)
        })
        .unwrap();
        assert!(system.ends_with("- Keep every joke."));
    }

    #[test]
    fn nothing_said_means_no_call() {
        let cuts = propose(&[part(1, "")], &[], |_| panic!("asked Claude about nothing")).unwrap();
        assert!(cuts.is_empty());
    }

    #[test]
    fn an_answer_that_skips_a_line_is_an_error() {
        let err = propose(&[part(1, RETAKES)], &[], |_| Ok(json!({"keep": [1], "drop": []}))).unwrap_err();
        assert!(matches!(err, AppError::ClaudeFailed(_)));
    }

    #[test]
    fn end_to_end_through_a_fake_claude() {
        let bin = fake::claude(
            "autocut",
            r#"cat > /dev/null; echo '{"type":"result","is_error":false,"structured_output":{"keep":[1,3,4],"drop":[{"id":2,"reason":"earlier take"}]}}'"#,
        );
        let cuts = run(&bin, &[part(5, RETAKES)], "test").unwrap();
        assert_eq!(cuts, [Cut { part: 5, from: 2, to: 7, s: 1.0, e: 3.4, reason: "earlier take".into() }]);
    }
}
