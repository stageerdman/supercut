//! Claude's `check` list → Magic's notes (design/notes.md, "Magic's notes"). Like cuts, times come from the
//! lines, never from Claude. The app applies its own rules on top (`withMagicNotes`: your notes win).

use super::lines::Line;
use crate::claude::picks::Check;
use serde::Serialize;

/// Never more than this many notes per run.
pub const MAX: usize = 5;
/// The note is one short line the user reads in the lane.
pub const MAX_CHARS: usize = 70;

/// A note over one line: part `part`, `s`–`e` seconds in that part's own time.
#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Note {
    pub part: u32,
    pub s: f64,
    pub e: f64,
    pub text: String,
}

/// One note per known, distinct line with something to say: the first `MAX` in time order.
pub fn notes(lines: &[Line], checks: &[Check]) -> Vec<Note> {
    lines
        .iter()
        .filter_map(|l| checks.iter().find(|c| c.line == l.id && !c.why.trim().is_empty()).map(|c| (l, c)))
        .take(MAX)
        .map(|(l, c)| Note { part: l.part, s: l.s, e: l.e, text: shorten(c.why.trim()) })
        .collect()
}

fn shorten(text: &str) -> String {
    if text.chars().count() <= MAX_CHARS {
        return text.to_owned();
    }
    let head: String = text.chars().take(MAX_CHARS - 1).collect();
    format!("{}…", head.trim_end())
}

#[cfg(test)]
mod tests {
    use super::super::lines::{sample::part, split};
    use super::*;

    fn check(line: u32, why: &str) -> Check {
        Check { line, why: why.into() }
    }

    #[test]
    fn a_check_becomes_a_note_over_its_line() {
        let lines = split(&[part(1, "Take one. Take two."), part(2, "Bye now.")]);
        assert_eq!(
            notes(&lines, &[check(3, "  Listen to both?  ")]),
            [Note { part: 2, s: 0.0, e: 0.9, text: "Listen to both?".into() }]
        );
    }

    #[test]
    fn unknown_doubled_and_empty_checks_are_dropped() {
        let lines = split(&[part(1, "Take one. Take two.")]);
        let got = notes(&lines, &[check(9, "nope"), check(1, "a"), check(1, "b"), check(2, " ")]);
        assert_eq!(got.iter().map(|n| n.text.as_str()).collect::<Vec<_>>(), ["a"]);
    }

    #[test]
    fn at_most_five_the_first_in_time_order() {
        let lines = split(&[part(1, "A. B. C. D. E. F. G.")]);
        let checks: Vec<Check> = (1..=7).rev().map(|id| check(id, &id.to_string())).collect();
        let got = notes(&lines, &checks);
        assert_eq!(got.iter().map(|n| n.text.as_str()).collect::<Vec<_>>(), ["1", "2", "3", "4", "5"]);
    }

    #[test]
    fn a_long_why_is_cut_to_seventy_characters() {
        let lines = split(&[part(1, "Hi.")]);
        let text = &notes(&lines, &[check(1, &"é".repeat(100))])[0].text;
        assert_eq!(text.chars().count(), MAX_CHARS);
        assert!(text.ends_with('…'));
    }
}
