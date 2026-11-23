//! Claude's answer about which sentences to keep. Times stay in the app: Claude sees
//! numbered sentences and answers with numbers only, so it can never invent a timestamp.

use crate::error::AppError;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct Picks {
    pub keep: Vec<u32>,
    pub drop: Vec<Dropped>,
    /// Lines Claude wants the user to listen to or decide on (Magic's notes). Optional: zero is normal.
    #[serde(default)]
    pub check: Vec<Check>,
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct Dropped {
    pub id: u32,
    pub reason: String,
}

#[derive(Serialize, Deserialize, Debug, PartialEq)]
pub struct Check {
    pub line: u32,
    pub why: String,
    /// One of the note colours (`NOTE_COLORS` in the app), only when the user's rules ask for one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

/// The note colours, as the app names them (src/ui/notes.js `NOTE_COLORS`).
pub const NOTE_COLORS: [&str; 5] = ["yellow", "red", "blue", "violet", "teal"];

pub fn schema() -> Value {
    json!({
        "type": "object",
        "properties": {
            "keep": {"type": "array", "items": {"type": "integer"}},
            "drop": {"type": "array", "items": {
                "type": "object",
                "properties": {"id": {"type": "integer"}, "reason": {"type": "string"}},
                "required": ["id", "reason"]
            }},
            "check": {"type": "array", "items": {
                "type": "object",
                "properties": {"line": {"type": "integer"}, "why": {"type": "string"}, "color": {"type": "string", "enum": NOTE_COLORS}},
                "required": ["line", "why"]
            }}
        },
        "required": ["keep", "drop"]
    })
}

/// Checks the answer against the sentences that were sent (ids 1..=count):
/// every sentence decided exactly once, no unknown ids.
pub fn parse(answer: Value, count: u32) -> Result<Picks, AppError> {
    let bad = |why: String| AppError::ClaudeFailed(format!("the answer didn't fit the transcript ({why})"));
    let picks: Picks = serde_json::from_value(answer).map_err(|e| bad(e.to_string()))?;
    let mut ids: Vec<u32> = picks.keep.iter().copied().chain(picks.drop.iter().map(|d| d.id)).collect();
    ids.sort_unstable();
    if ids != (1..=count).collect::<Vec<_>>() {
        return Err(bad(format!("decided {ids:?} for sentences 1–{count}")));
    }
    Ok(picks)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_complete_answer_is_accepted() {
        let p = parse(json!({"keep": [2, 3], "drop": [{"id": 1, "reason": "false start"}]}), 3).unwrap();
        assert_eq!(p.keep, [2, 3]);
        assert_eq!(p.drop[0], Dropped { id: 1, reason: "false start".into() });
        assert!(p.check.is_empty(), "no check list means no notes");
    }

    #[test]
    fn the_check_list_is_read_when_there() {
        let p = parse(json!({"keep": [1], "drop": [], "check": [{"line": 1, "why": "Listen?"}]}), 1).unwrap();
        assert_eq!(p.check, [Check { line: 1, why: "Listen?".into(), color: None }]);
    }

    #[test]
    fn a_check_may_name_a_note_colour() {
        let p = parse(json!({"keep": [1], "drop": [], "check": [{"line": 1, "why": "Fix", "color": "red"}]}), 1).unwrap();
        assert_eq!(p.check[0].color.as_deref(), Some("red"));
        assert_eq!(schema()["properties"]["check"]["items"]["properties"]["color"]["enum"][1], "red");
    }

    #[test]
    fn missing_doubled_or_unknown_ids_are_rejected() {
        for answer in [json!({"keep": [1], "drop": []}), json!({"keep": [1, 1, 2], "drop": []}), json!({"keep": [1, 2, 9], "drop": []})] {
            assert!(matches!(parse(answer, 2), Err(AppError::ClaudeFailed(_))));
        }
    }

    #[test]
    fn a_wrong_shape_is_rejected() {
        assert!(matches!(parse(json!({"keep": "all"}), 2), Err(AppError::ClaudeFailed(_))));
    }
}
