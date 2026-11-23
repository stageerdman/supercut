//! What Claude reads: the editing rules (system prompt) and the numbered lines.

use super::lines::Line;

pub const RULES: &str = "You edit spoken video transcripts. You get numbered lines. \
Decide for every line whether to keep it or drop it, and give every drop a short reason (a few words the user reads next to the cut; the user never sees line numbers, so don't mention them). \
Drop: earlier takes of a line that was said again (keep the last take), false starts, and obvious fumbles \
(a line abandoned midway, a stumble that is said again right after). \
Keep everything else, even casual speech: never drop something that isn't said again. \
Lines that look like takes of one line are listed after the transcript. They are hints: \
lines that only sound alike but say different things both stay. Answer with line numbers only.\n\n\
You may also list a few lines under check, where the user should listen or decide: \
two takes nearly as good as each other, a line you almost cut or almost kept (an aside, a tangent), \
or speech you couldn't make out. Never use check to explain a cut. \
Zero is the normal answer: at most one per 3 minutes of speech and never more than 5. \
Each why is one plain line under 70 characters that says what to do, like \"Two good takes. I kept the second. Listen to both?\"";

/// The built-in rules, then the user's own rules (feature "Custom AI editing rules"), which win where they differ.
pub fn system(custom: &[String]) -> String {
    if custom.is_empty() {
        return RULES.to_owned();
    }
    let mine: String = custom.iter().map(|r| format!("\n- {r}")).collect();
    format!("{RULES}\n\nThe user's own rules. Follow them; where they differ from the rules above, they win:{mine}")
}

/// "1: text" per line, then the groups found by `similar::groups`.
pub fn transcript(lines: &[Line], groups: &[Vec<u32>]) -> String {
    let mut out: String = lines.iter().map(|l| format!("{}: {}\n", l.id, l.text)).collect();
    if !groups.is_empty() {
        let list = |g: &Vec<u32>| g.iter().map(u32::to_string).collect::<Vec<_>>().join(", ");
        out += &format!("\nLook like takes of one line: {}\n", groups.iter().map(list).collect::<Vec<_>>().join(" · "));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::super::lines::{sample::part, split};
    use super::*;

    #[test]
    fn lines_are_numbered_and_groups_listed() {
        let lines = split(&[part(1, "Hi. Hi again. Bye.")]);
        assert_eq!(transcript(&lines, &[vec![1, 2]]), "1: Hi.\n2: Hi again.\n3: Bye.\n\nLook like takes of one line: 1, 2\n");
        assert_eq!(transcript(&lines, &[]), "1: Hi.\n2: Hi again.\n3: Bye.\n");
    }

    #[test]
    fn the_rules_say_when_to_ask_for_a_check_and_how_rarely() {
        for rule in ["Never use check to explain a cut", "Zero is the normal answer", "one per 3 minutes", "never more than 5", "under 70 characters"] {
            assert!(RULES.contains(rule), "missing: {rule}");
        }
    }

    #[test]
    fn custom_rules_come_after_the_built_in_ones() {
        assert_eq!(system(&[]), RULES);
        let s = system(&["Never cut jokes.".into(), "Keep the intro.".into()]);
        assert!(s.starts_with(RULES) && s.ends_with("they win:\n- Never cut jokes.\n- Keep the intro."), "{s}");
    }
}
