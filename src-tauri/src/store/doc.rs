//! `project.json` v1 (design/project-store.md) and the shapes the UI gets back. Every field but `id` has a
//! default, so an older or hand-damaged file still opens. `ui` is the UI's own JSON, never read here.

use super::rules;
use crate::project::Part;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::PathBuf;

pub const VERSION: u32 = 1;

/// Where the thumbnail comes from: a part and a second of it (the first kept frame, as the UI last said).
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq)]
pub struct Cover {
    pub part: u32,
    pub t: f64,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProjectFile {
    #[serde(default = "version")]
    pub v: u32,
    pub id: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub created_at: u64,
    /// Set on open and on every save: the 30-day clock counts from here.
    #[serde(default)]
    pub used_at: u64,
    #[serde(default)]
    pub locked: bool,
    /// The edited length in seconds, for the card.
    #[serde(default)]
    pub length: f64,
    #[serde(default)]
    pub cover: Option<Cover>,
    /// `Project::next_id`, so part ids are never reused after reopening.
    #[serde(default)]
    pub next_part_id: u32,
    #[serde(default)]
    pub parts: Vec<Part>,
    #[serde(default)]
    pub ui: Option<Value>,
}

fn version() -> u32 {
    VERSION
}

impl ProjectFile {
    /// A fresh, empty project made and used at `now`.
    pub fn new(id: String, now: u64) -> Self {
        Self { v: VERSION, id, name: String::new(), created_at: now, used_at: now, locked: false, length: 0.0, cover: None, next_part_id: 0, parts: Vec::new(), ui: None }
    }

    pub fn parse(text: &str) -> serde_json::Result<Self> {
        serde_json::from_str(text)
    }

    pub fn to_json(&self) -> String {
        serde_json::to_string_pretty(self).expect("a project always serializes")
    }

    pub fn summary(&self, thumb: Option<PathBuf>) -> Summary {
        Summary {
            id: self.id.clone(),
            name: self.name.clone(),
            used_at: self.used_at,
            locked: self.locked,
            deletes_at: rules::deletes_at(self.used_at, self.locked),
            length: self.length,
            thumb,
        }
    }
}

/// One card on the home screen.
#[derive(Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Summary {
    pub id: String,
    pub name: String,
    pub used_at: u64,
    pub locked: bool,
    /// None while locked.
    pub deletes_at: Option<u64>,
    pub length: f64,
    /// The absolute path of thumb.jpg, None until it is made.
    pub thumb: Option<PathBuf>,
}

/// A project just made the open one.
#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Opened {
    pub summary: Summary,
    pub parts: Vec<Part>,
    /// None for a new project.
    pub ui: Option<Value>,
    /// `new_project` found a project for this video and opened that.
    pub existing: bool,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::swap::Swap;
    use serde_json::json;

    #[test]
    fn a_project_round_trips_with_its_ui_blob_untouched() {
        let ui = json!({ "edit": { "cuts": [[1.5, 2.25]], "notes": [{ "t": 3, "text": "ünïcode ✂" }] }, "zeta": null, "alpha": [1e-9, 12345678901234u64] });
        let swap = Swap { recording: "/r/mic.wav".into(), offset: -1.2, synced: true, media: "/p/audio/swap-1.mov".into() };
        let p = ProjectFile {
            name: "my-video".into(),
            locked: true,
            length: 892.4,
            cover: Some(Cover { part: 1, t: 3.2 }),
            next_part_id: 3,
            parts: vec![Part { id: 1, path: "/v/my-video.mov".into(), name: "my-video.mov".into(), swap: Some(swap) }],
            ui: Some(ui.clone()),
            ..ProjectFile::new("k3m9q2x7a1bz".into(), 1_764_000_000_000)
        };
        let back = ProjectFile::parse(&p.to_json()).unwrap();
        assert_eq!(back, p);
        assert_eq!(back.ui.unwrap().to_string(), ui.to_string(), "the ui blob reads back as written");
    }

    #[test]
    fn the_file_uses_the_contract_names() {
        let text = ProjectFile::new("x".into(), 7).to_json();
        for key in ["\"v\": 1", "\"createdAt\": 7", "\"usedAt\": 7", "\"nextPartId\"", "\"locked\": false"] {
            assert!(text.contains(key), "{key} in {text}");
        }
    }

    #[test]
    fn an_old_file_missing_fields_still_opens() {
        let p = ProjectFile::parse(r#"{ "id": "old1", "parts": [{ "id": 4, "path": "/v/a.mov", "name": "a.mov", "swap": null }] }"#).unwrap();
        assert_eq!((p.v, p.used_at, p.locked, p.next_part_id, p.cover, p.ui), (VERSION, 0, false, 0, None, None));
        assert_eq!(p.parts[0].id, 4);
        assert!(ProjectFile::parse("{ \"name\": \"no id\" }").is_err(), "the id is the one thing a file must have");
    }

    #[test]
    fn a_summary_counts_down_unless_locked() {
        let mut p = ProjectFile::new("a".into(), 100);
        assert_eq!(p.summary(None).deletes_at, Some(100 + rules::KEEP_MS));
        p.locked = true;
        let s = p.summary(Some("/p/a/thumb.jpg".into()));
        assert_eq!((s.deletes_at, s.thumb.clone()), (None, Some(PathBuf::from("/p/a/thumb.jpg"))));
        let json = serde_json::to_value(&s).unwrap();
        assert_eq!(json["usedAt"], 100);
        assert!(json["deletesAt"].is_null());
    }
}
