//! Where the app's commands hand over what happened: a Claude call (tallied on its project's project.json and
//! written to the ledger) or a finished export. Never fails: bookkeeping must not fail Magic or an export.

use super::ledger::{self, Entry};
use super::report::{self, Report};
use super::{ledger_file, record, Notes};
use crate::claude::ask::Usage;
use crate::error::AppError;
use crate::log;
use crate::store::rules::now_ms;
use crate::store::Library;
use std::path::{Path, PathBuf};

pub struct Tracker {
    ledger: PathBuf,
}

impl Tracker {
    pub fn new(dir: &Path) -> Self {
        Self { ledger: ledger_file(dir) }
    }

    pub fn at_home() -> Self {
        Self::new(&super::dir())
    }

    /// One Claude call. `project` is the project it was made for, None outside one (self-test, command line).
    /// Callers hold the session lock: the tally read-modify-writes project.json.
    pub fn call(&self, lib: &Library, project: Option<&str>, model: Option<String>, usage: Usage, trace: &str) {
        let name = project.and_then(|id| lib.add_usage(id, &usage).map_err(|e| log::error("usage", trace, format!("couldn't tally on {id}: {e}"))).ok());
        log::info("usage", trace, format!("{} tokens for {}", usage.tokens(), project.unwrap_or("no project")));
        record(&self.ledger, &Entry::Call { at: now_ms(), project: project.map(str::to_owned), name, trace: trace.into(), model, usage }, trace);
    }

    /// The project's video was exported: its calls count from now on. Recorded even if project.json won't
    /// update, since the ledger alone decides the report.
    pub fn export(&self, lib: &Library, project: &str, trace: &str) {
        let at = now_ms();
        let name = lib.mark_exported(project, at).unwrap_or_else(|e| {
            log::error("usage", trace, format!("couldn't mark {project} exported: {e}"));
            String::new()
        });
        record(&self.ledger, &Entry::Export { at, project: project.into(), name }, trace);
    }

    pub fn report(&self) -> Result<Report, AppError> {
        Ok(report::report(&ledger::read(&self.ledger)?))
    }

    pub fn notes(&self) -> Result<Notes, AppError> {
        super::notes(&self.ledger)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::store::doc::ProjectFile;
    use crate::store::tests::library;

    fn spent(input: u64) -> Usage {
        Usage { input, output: 2, cache_read: 0, cache_write: 0, cost_usd: 0.01 }
    }

    fn setup(name: &str) -> (Library, Tracker) {
        let (lib, d) = library(&format!("track-{name}"));
        lib.write(&ProjectFile { name: "my-video".into(), ..ProjectFile::new("p1".into(), 1) }).unwrap();
        (lib, Tracker::new(&d.join("usage")))
    }

    #[test]
    fn a_call_lands_in_the_ledger_and_the_projects_tally() {
        let (lib, t) = setup("call");
        t.call(&lib, Some("p1"), Some("claude-x".into()), spent(10), "magic");
        t.call(&lib, Some("p1"), None, spent(5), "magic");
        let p = lib.read("p1").unwrap();
        assert_eq!((p.usage.calls, p.usage.input, p.usage.tokens, p.exported_at), (2, 15, 19, None));
        let r = t.report().unwrap();
        assert_eq!((r.projects[0].name.as_str(), r.projects[0].counts.input, r.total.projects), ("my-video", 15, 0), "not exported: not counted");
    }

    #[test]
    fn an_export_makes_the_project_count() {
        let (lib, t) = setup("export");
        t.call(&lib, Some("p1"), None, spent(10), "magic");
        t.export(&lib, "p1", "export");
        assert!(lib.read("p1").unwrap().exported_at.is_some());
        assert_eq!(t.report().unwrap().total.counts.input, 10);
    }

    #[test]
    fn a_call_outside_a_project_is_kept_but_never_counted() {
        let (lib, t) = setup("none");
        t.call(&lib, None, None, spent(7), "self-test");
        assert_eq!(t.notes().unwrap().lines.len(), 1);
        assert_eq!(t.report().unwrap(), Report::default());
    }

    #[test]
    fn the_ledger_outlives_the_30_day_sweep() {
        let (lib, t) = setup("sweep");
        t.call(&lib, Some("p1"), None, spent(10), "magic");
        t.export(&lib, "p1", "export");
        assert_eq!(lib.sweep(u64::MAX / 2, None), 1, "the project is gone");
        let r = t.report().unwrap();
        assert_eq!((r.projects[0].name.as_str(), r.total.counts.input), ("my-video", 10));
        assert_eq!(t.notes().unwrap().lines.len(), 2);
    }

    #[test]
    fn a_project_that_wont_update_still_reaches_the_ledger() {
        let (lib, t) = setup("gone");
        t.call(&lib, Some("deleted"), None, spent(3), "magic");
        t.export(&lib, "deleted", "export");
        assert_eq!(t.report().unwrap().total.counts.input, 3);
    }
}
