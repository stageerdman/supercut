//! The usage report, computed from the ledger alone (pure). The export rule: a project's calls count toward the
//! total only once its video has been exported, and then all of them, before and after. Calls with no project
//! never count.

use super::ledger::Entry;
use crate::claude::ask::Usage;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug, Default, Clone, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Counts {
    pub calls: u64,
    pub input: u64,
    pub output: u64,
    pub cache_read: u64,
    pub cache_write: u64,
    /// All four token counts together.
    pub tokens: u64,
}

impl Counts {
    pub fn add_call(&mut self, u: &Usage) {
        self.calls += 1;
        self.input += u.input;
        self.output += u.output;
        self.cache_read += u.cache_read;
        self.cache_write += u.cache_write;
        self.tokens += u.tokens();
    }

    fn add(&mut self, c: &Counts) {
        self.calls += c.calls;
        self.input += c.input;
        self.output += c.output;
        self.cache_read += c.cache_read;
        self.cache_write += c.cache_write;
        self.tokens += c.tokens;
    }
}

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct ProjectUsage {
    pub id: String,
    pub name: String,
    #[serde(flatten)]
    pub counts: Counts,
    pub exported: bool,
    /// Latest activity, for the order.
    #[serde(skip)]
    last: u64,
}

#[derive(Serialize, Debug, Default, PartialEq)]
pub struct Total {
    #[serde(flatten)]
    pub counts: Counts,
    /// How many exported projects the total covers.
    pub projects: u64,
}

#[derive(Serialize, Debug, Default, PartialEq)]
pub struct Report {
    /// Newest activity first.
    pub projects: Vec<ProjectUsage>,
    pub total: Total,
}

pub fn report(entries: &[Entry]) -> Report {
    let mut projects: Vec<ProjectUsage> = Vec::new();
    for e in entries {
        let (id, at, name) = match e {
            Entry::Call { project: Some(id), at, name, .. } => (id, *at, name.as_deref()),
            Entry::Export { project, at, name } => (project, *at, Some(name.as_str())),
            Entry::Call { project: None, .. } => continue,
        };
        let p = project(&mut projects, id);
        p.last = p.last.max(at);
        if let Some(name) = name.filter(|n| !n.is_empty()) {
            p.name = name.to_owned();
        }
        match e {
            Entry::Call { usage, .. } => p.counts.add_call(usage),
            Entry::Export { .. } => p.exported = true,
        }
    }
    projects.sort_by(|a, b| b.last.cmp(&a.last));
    let mut total = Total::default();
    for p in projects.iter().filter(|p| p.exported) {
        total.counts.add(&p.counts);
        total.projects += 1;
    }
    Report { projects, total }
}

fn project<'a>(projects: &'a mut Vec<ProjectUsage>, id: &str) -> &'a mut ProjectUsage {
    match projects.iter().position(|p| p.id == id) {
        Some(i) => &mut projects[i],
        None => {
            projects.push(ProjectUsage { id: id.to_owned(), name: String::new(), counts: Counts::default(), exported: false, last: 0 });
            projects.last_mut().expect("just pushed")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::usage::ledger::sample_call as call;

    fn export(at: u64, project: &str) -> Entry {
        Entry::Export { at, project: project.into(), name: format!("{project}-video") }
    }

    #[test]
    fn calls_add_up_per_project() {
        let r = report(&[call(1, Some("a"), 10), call(2, Some("a"), 20), export(3, "a")]);
        let a = &r.projects[0];
        assert_eq!((a.id.as_str(), a.name.as_str(), a.exported), ("a", "a-video", true));
        assert_eq!(a.counts, Counts { calls: 2, input: 30, output: 2, cache_read: 4, cache_write: 6, tokens: 42 });
        assert_eq!(r.total.counts, a.counts);
        assert_eq!(r.total.projects, 1);
    }

    #[test]
    fn unexported_projects_are_listed_but_dont_count() {
        let r = report(&[call(1, Some("a"), 10), call(2, Some("b"), 20), export(3, "b")]);
        assert_eq!(r.projects.len(), 2);
        let a = r.projects.iter().find(|p| p.id == "a").unwrap();
        assert!(!a.exported);
        assert_eq!(a.counts.input, 10);
        assert_eq!((r.total.counts.input, r.total.projects), (20, 1));
    }

    #[test]
    fn calls_after_the_export_count_too() {
        let r = report(&[call(1, Some("a"), 10), export(2, "a"), call(3, Some("a"), 5), export(4, "a")]);
        assert_eq!((r.total.counts.calls, r.total.counts.input, r.total.projects), (2, 15, 1), "exported twice is still one project");
    }

    #[test]
    fn calls_without_a_project_never_count() {
        let r = report(&[call(1, None, 99), call(2, Some("a"), 1), export(3, "a")]);
        assert_eq!(r.projects.len(), 1);
        assert_eq!(r.total.counts.input, 1);
    }

    #[test]
    fn newest_activity_comes_first() {
        let r = report(&[call(1, Some("old"), 1), call(2, Some("new"), 1), call(3, Some("old"), 1), call(4, Some("new"), 1)]);
        let ids: Vec<&str> = r.projects.iter().map(|p| p.id.as_str()).collect();
        assert_eq!(ids, ["new", "old"]);
    }

    #[test]
    fn the_report_is_the_documented_shape() {
        let json = serde_json::to_value(report(&[call(1, Some("a"), 10), export(2, "a")])).unwrap();
        let want = serde_json::json!({
            "projects": [{"id": "a", "name": "a-video", "calls": 1, "input": 10, "output": 1, "cacheRead": 2, "cacheWrite": 3, "tokens": 16, "exported": true}],
            "total": {"calls": 1, "input": 10, "output": 1, "cacheRead": 2, "cacheWrite": 3, "tokens": 16, "projects": 1}
        });
        assert_eq!(json, want);
    }
}
