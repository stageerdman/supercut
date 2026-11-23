//! A real round trip on a tiny sample transcript: proves this Mac's `claude` runs on the
//! subscription and answers in our JSON shape. Catches CLI changes (e.g. `--bare` becoming
//! the default for `-p`) before the user presses Magic.

use super::ask::{ask, Ask};
use super::picks::{self, Picks};
use crate::error::AppError;
use std::path::Path;
use std::time::Duration;

/// A take with a false start and a retake: sentence 1 should go, 2 and 3 stay.
pub const SENTENCES: [&str; 3] = [
    "So today I want to show you, uh, how",
    "So today I want to show you how SuperCut works.",
    "It cuts the boring parts out of your video for you.",
];

const LIMIT: Duration = Duration::from_secs(120);

pub fn prompt(sentences: &[&str]) -> String {
    sentences.iter().enumerate().map(|(i, s)| format!("{}: {s}\n", i + 1)).collect()
}

pub fn run(bin: &Path, trace: &str) -> Result<Picks, AppError> {
    let schema = picks::schema();
    let prompt = prompt(&SENTENCES);
    // Magic's own rules, so the self-test proves what Magic will ask.
    let reply = ask(bin, &Ask { prompt: &prompt, system: crate::autocut::RULES, schema: &schema }, LIMIT, trace)?;
    picks::parse(reply.answer, SENTENCES.len() as u32)
}

#[cfg(test)]
mod tests {
    use super::super::ask::fake;
    use super::super::setup::locate;
    use super::*;

    #[test]
    fn sentences_are_numbered_from_one() {
        assert_eq!(prompt(&["Hi.", "Bye."]), "1: Hi.\n2: Bye.\n");
    }

    #[test]
    fn a_good_answer_from_claude_becomes_picks() {
        let bin = fake::claude(
            "picker",
            r#"cat > /dev/null; echo '{"type":"result","is_error":false,"structured_output":{"keep":[2,3],"drop":[{"id":1,"reason":"false start"}]}}'"#,
        );
        assert_eq!(run(&bin, "test").unwrap().keep, [2, 3]);
    }

    /// The real thing: this Mac's `claude` on the user's subscription. Skipped if Claude
    /// Code isn't installed; fails loudly if it's installed but can't answer.
    #[test]
    fn live_sample_transcript_round_trip() {
        let Ok(bin) = locate() else { return println!("# skipped: Claude Code not installed") };
        let t0 = std::time::Instant::now();
        let picks = run(&bin, "live-test").unwrap();
        println!("# claude answered in {:.1} s: {}", t0.elapsed().as_secs_f64(), serde_json::to_string(&picks).unwrap());
        assert!(picks.keep.contains(&2) && picks.keep.contains(&3), "kept the full take and the next sentence");
    }
}
