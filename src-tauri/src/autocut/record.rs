//! The run record: what Magic's Claude read and answered, kept with the project as the run's trace
//! (design/magic-trace.md). With `lines`, `groups`, `rules` and `custom`, `prompt::system` and `prompt::transcript`
//! rebuild the exact question, so a logged run can be replayed against a new prompt or model.

use super::lines::Line;
use super::prompt::RULES;
use serde::Serialize;
use serde_json::Value;

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Run {
    /// The build that ran it: version and frontend id (`--build-id`), so a log is tied to the code that made it.
    pub app: String,
    /// The real model id from Claude's init line; None if the stream didn't say.
    pub model: Option<String>,
    /// Which version of the built-in rules was sent (`rules_version`).
    pub rules: String,
    /// The user's own rules, as sent.
    pub custom: Vec<String>,
    /// The numbered lines exactly as Claude read them (words may be fixed later).
    pub lines: Vec<Line>,
    /// What `similar::groups` hinted.
    pub groups: Vec<Vec<u32>>,
    /// Claude's raw answer, before our last-take rule.
    pub answer: Value,
}

pub fn app_build() -> String {
    format!("{} {}", env!("CARGO_PKG_VERSION"), env!("MAGIC_CUT_FRONTEND_ID"))
}

/// A short, stable fingerprint of the built-in rules (FNV-1a, 64 bit): equal rules give equal versions across builds.
pub fn rules_version() -> String {
    format!("{:016x}", fnv1a(RULES))
}

fn fnv1a(text: &str) -> u64 {
    text.bytes().fold(0xcbf2_9ce4_8422_2325, |h, b| (h ^ b as u64).wrapping_mul(0x0000_0100_0000_01b3))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_rules_version_is_stable_and_changes_with_the_text() {
        assert_eq!(fnv1a(""), 0xcbf2_9ce4_8422_2325);
        assert_eq!(fnv1a("a"), 0xaf63_dc4c_8601_ec8c, "the published FNV-1a value");
        assert_eq!(rules_version().len(), 16);
        assert_ne!(fnv1a(RULES), fnv1a(&format!("{RULES} ")));
    }
}
