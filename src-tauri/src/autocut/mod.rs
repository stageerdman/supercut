//! Magic's engine: transcript words → proposed cuts.
//! `lines` splits the words, `similar` finds repeated takes, `prompt` is what Claude reads,
//! `decide` turns Claude's keep/drop (plus the last-take rule) into cuts, `notes` its check list into notes,
//! and `record` keeps what Claude read and answered: the run's trace.

pub mod decide;
pub mod lines;
#[cfg(test)]
mod live_tests;
pub mod notes;
mod prompt;
pub mod record;
mod similar;

use crate::claude::ask::{self, Ask, Reply};
use crate::claude::picks;
use crate::error::AppError;
use crate::log;
use decide::Cut;
use lines::PartWords;
use notes::Note;
use record::Run;
use serde::Serialize;
use std::path::Path;
use std::time::Duration;

pub use prompt::RULES;

/// A long recording is a few hundred lines; Claude needs more than the self-test's 120 s.
const LIMIT: Duration = Duration::from_secs(300);

/// What one Magic run proposes: the cuts, the few places it wants the user to check, and the run's record
/// (None when there was nothing to ask Claude about).
#[derive(Serialize, Debug, Default, PartialEq)]
pub struct Proposal {
    pub cuts: Vec<Cut>,
    pub notes: Vec<Note>,
    pub run: Option<Run>,
}

/// The engine without I/O. `custom_rules` are the user's own editing rules (they win over the built-in ones);
/// `ask_claude` gets the question and returns Claude's reply.
pub fn propose(
    parts: &[PartWords],
    custom_rules: &[String],
    ask_claude: impl FnOnce(&Ask) -> Result<Reply, AppError>,
) -> Result<Proposal, AppError> {
    let lines = lines::split(parts);
    if lines.is_empty() {
        return Ok(Proposal::default());
    }
    let groups = similar::groups(&lines);
    let (schema, system, transcript) = (picks::schema(), prompt::system(custom_rules), prompt::transcript(&lines, &groups));
    let Reply { answer, model } = ask_claude(&Ask { prompt: &transcript, system: &system, schema: &schema })?;
    let decided = decide::keep_last_takes(picks::parse(answer.clone(), lines.len() as u32)?, &groups);
    let (cuts, notes) = (decide::cuts(&lines, &decided, &groups), notes::notes(&lines, &decided.picks.check));
    let run = Run { model, rules: record::rules_version(), custom: custom_rules.to_vec(), lines, groups, answer };
    Ok(Proposal { cuts, notes, run: Some(run) })
}

/// The real thing: this Mac's `claude` at `bin`, with the user's `custom_rules`. `trace` tags the log lines.
pub fn run(bin: &Path, parts: &[PartWords], custom_rules: &[String], trace: &str) -> Result<Proposal, AppError> {
    let p = propose(parts, custom_rules, |q| ask::ask(bin, q, LIMIT, trace))?;
    let counts = format!("{} cuts, {} notes proposed, {} custom rules", p.cuts.len(), p.notes.len(), custom_rules.len());
    log::info("autocut", trace, counts);
    Ok(p)
}

#[cfg(test)]
mod tests {
    use super::lines::sample::part;
    use super::*;
    use crate::claude::ask::fake;
    use decide::Source;
    use serde_json::{json, Value};

    const RETAKES: &str = "Hello there. This is my new video. This is my brand new video. Bye.";

    fn reply(answer: Value) -> Result<Reply, AppError> {
        Ok(Reply { answer, model: Some("claude-test-1".into()) })
    }

    #[test]
    fn claude_sees_numbered_lines_and_the_groups() {
        let mut seen = String::new();
        let answer = json!({"keep": [1, 2, 3, 4], "drop": []});
        propose(&[part(1, RETAKES)], &[], |q| {
            seen = q.prompt.to_owned();
            reply(answer)
        })
        .unwrap();
        assert!(seen.starts_with("1: Hello there.\n2: This is my new video.\n") && seen.ends_with("one line: 2, 3\n"), "{seen}");
    }

    #[test]
    fn the_last_take_is_kept_even_if_claude_picks_the_first() {
        let answer = json!({"keep": [1, 2, 4], "drop": [{"id": 3, "reason": "worse"}]});
        let cuts = propose(&[part(1, RETAKES)], &[], |_| reply(answer)).unwrap().cuts;
        assert_eq!(cuts.len(), 1);
        assert_eq!((cuts[0].from, cuts[0].to, cuts[0].reason.as_str()), (2, 7, decide::EARLIER_TAKE));
        assert_eq!((cuts[0].source, cuts[0].instead), (Source::Rule, Some(3)));
    }

    #[test]
    fn the_run_record_keeps_what_claude_read_and_answered() {
        let answer = json!({"keep": [1, 2, 4], "drop": [{"id": 3, "reason": "worse"}]});
        let run = propose(&[part(1, RETAKES)], &["Keep every joke.".into()], |_| reply(answer.clone())).unwrap().run.unwrap();
        assert_eq!(run.model.as_deref(), Some("claude-test-1"));
        assert_eq!((run.rules, run.custom), (record::rules_version(), vec!["Keep every joke.".to_owned()]));
        assert_eq!(run.lines.iter().map(|l| l.text.as_str()).collect::<Vec<_>>()[1], "This is my new video.");
        assert_eq!((run.groups, run.answer), (vec![vec![2, 3]], answer), "the raw answer, before the last-take rule");
    }

    #[test]
    fn custom_rules_reach_claude() {
        let mut system = String::new();
        let answer = json!({"keep": [1], "drop": []});
        propose(&[part(1, "Hi.")], &["Keep every joke.".into()], |q| {
            system = q.system.to_owned();
            reply(answer)
        })
        .unwrap();
        assert!(system.ends_with("- Keep every joke."));
    }

    #[test]
    fn nothing_said_means_no_call() {
        assert_eq!(propose(&[part(1, "")], &[], |_| panic!("asked Claude about nothing")), Ok(Proposal::default()));
    }

    #[test]
    fn claudes_check_list_becomes_notes_beside_the_cuts() {
        let answer = json!({"keep": [1, 3, 4], "drop": [{"id": 2, "reason": "earlier take"}], "check": [{"line": 3, "why": "Two good takes. Listen?"}]});
        let p = propose(&[part(1, RETAKES)], &[], |_| reply(answer)).unwrap();
        assert_eq!(p.cuts.len(), 1);
        assert_eq!(p.notes, [Note { part: 1, s: 3.5, e: 6.4, text: "Two good takes. Listen?".into(), color: None }]);
    }

    #[test]
    fn an_answer_that_skips_a_line_is_an_error() {
        let err = propose(&[part(1, RETAKES)], &[], |_| reply(json!({"keep": [1], "drop": []}))).unwrap_err();
        assert!(matches!(err, AppError::ClaudeFailed(_)));
    }

    #[test]
    fn end_to_end_through_a_fake_claude() {
        let bin = fake::claude(
            "autocut",
            r#"cat > /dev/null; echo '{"type":"system","subtype":"init","model":"claude-sonnet-x"}'; echo '{"type":"result","is_error":false,"structured_output":{"keep":[1,3,4],"drop":[{"id":2,"reason":"earlier take"}]}}'"#,
        );
        let p = run(&bin, &[part(5, RETAKES)], &[], "test").unwrap();
        let cut = Cut { line: 2, part: 5, from: 2, to: 7, s: 1.0, e: 3.4, reason: "earlier take".into(), source: Source::Claude, instead: Some(3) };
        assert_eq!(p.cuts, [cut]);
        assert!(p.notes.is_empty());
        assert_eq!(p.run.unwrap().model.as_deref(), Some("claude-sonnet-x"), "the model id travels from the stream to the record");
    }

    #[test]
    fn the_real_call_carries_the_users_rules() {
        // Answers only when the user's rule is in its arguments (the system prompt).
        let bin = fake::claude(
            "autocut-rules",
            r#"cat > /dev/null; case "$*" in *"- Keep every joke."*) echo '{"type":"result","is_error":false,"structured_output":{"keep":[1],"drop":[]}}';; *) echo 'rule missing' >&2; exit 3;; esac"#,
        );
        let p = run(&bin, &[part(1, "Hi.")], &["Keep every joke.".into()], "test").unwrap();
        assert!(p.cuts.is_empty() && p.run.is_some());
    }
}
