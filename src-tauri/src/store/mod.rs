//! The project library (design/project-store.md): one folder per project in the app's data folder, holding
//! `project.json`, `thumb.jpg` and `audio/` (swapped-audio media). The user's own files live elsewhere and are
//! never touched: deleting a project removes its folder only.

pub mod doc;
pub mod rules;
pub mod session;
pub mod thumb;

use crate::claude::ask::Usage;
use crate::error::AppError;
use crate::log;
use doc::{ProjectFile, Summary};
use std::path::{Path, PathBuf};

const FILE: &str = "project.json";

pub struct Library {
    root: PathBuf,
}

impl Library {
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    /// The app's own library: ~/Library/Application Support/xyz.supercut.editor/projects.
    pub fn at_home() -> Self {
        Self::new(crate::paths::data("projects"))
    }

    /// The project's folder. Ids come from the web side, so one that could leave the library is refused.
    pub fn folder(&self, id: &str) -> Result<PathBuf, AppError> {
        if crate::ids::is_plain(id) {
            Ok(self.root.join(id))
        } else {
            Err(AppError::NoSuchProject)
        }
    }

    pub fn audio_dir(&self, id: &str) -> Result<PathBuf, AppError> {
        Ok(self.folder(id)?.join("audio"))
    }

    pub fn thumb_file(&self, id: &str) -> Result<PathBuf, AppError> {
        Ok(self.folder(id)?.join("thumb.jpg"))
    }

    /// An id no project has.
    pub fn fresh_id(&self) -> String {
        loop {
            let id = rules::new_id();
            if !self.root.join(&id).exists() {
                return id;
            }
        }
    }

    /// The project as saved. Its folder's name is its id, whatever the file says.
    pub fn read(&self, id: &str) -> Result<ProjectFile, AppError> {
        let file = self.folder(id)?.join(FILE);
        let text = std::fs::read_to_string(&file).map_err(|e| match e.kind() {
            std::io::ErrorKind::NotFound => AppError::NoSuchProject,
            _ => AppError::Store(format!("{}: {e}", file.display())),
        })?;
        let mut project = ProjectFile::parse(&text).map_err(|e| AppError::Store(format!("{}: {e}", file.display())))?;
        project.id = id.to_string();
        Ok(project)
    }

    pub fn write(&self, project: &ProjectFile) -> Result<(), AppError> {
        let file = self.folder(&project.id)?.join(FILE);
        crate::atomic::write(&file, &project.to_json()).map_err(|e| AppError::Store(format!("{}: {e}", file.display())))
    }

    pub fn summary(&self, project: &ProjectFile) -> Summary {
        let thumb = self.thumb_file(&project.id).ok().filter(|f| f.is_file());
        project.summary(thumb)
    }

    /// Every project that reads, newest use first. One that doesn't is logged and left out.
    pub fn list(&self) -> Vec<Summary> {
        let mut all: Vec<Summary> = self
            .ids()
            .iter()
            .filter_map(|id| self.read(id).map_err(|e| log::error("store", id, format!("skipped: {e}"))).ok())
            .map(|p| self.summary(&p))
            .collect();
        all.sort_by(|a, b| b.used_at.cmp(&a.used_at));
        all
    }

    /// The project started from this video, if there is one.
    pub fn find_video(&self, path: &Path) -> Option<ProjectFile> {
        self.ids().iter().filter_map(|id| self.read(id).ok()).find(|p| rules::same_video(p, path))
    }

    /// Lock or unlock; the 30-day clock is left as it is.
    pub fn set_locked(&self, id: &str, locked: bool) -> Result<Summary, AppError> {
        let project = self.update(id, |p| p.locked = locked)?;
        log::info("store", id, if locked { "locked" } else { "unlocked" });
        Ok(self.summary(&project))
    }

    /// Adds one Claude call to the project's tally. Returns the project's name.
    pub fn add_usage(&self, id: &str, usage: &Usage) -> Result<String, AppError> {
        Ok(self.update(id, |p| p.usage.add_call(usage))?.name)
    }

    /// Notes that the project's video was exported at `at`. Returns the project's name.
    pub fn mark_exported(&self, id: &str, at: u64) -> Result<String, AppError> {
        Ok(self.update(id, |p| p.exported_at = Some(at))?.name)
    }

    /// Read, change, write back. Callers hold the session lock, so two writes never interleave.
    fn update(&self, id: &str, change: impl FnOnce(&mut ProjectFile)) -> Result<ProjectFile, AppError> {
        let mut project = self.read(id)?;
        change(&mut project);
        self.write(&project)?;
        Ok(project)
    }

    /// Removes the project's folder. The open project is refused.
    pub fn delete(&self, id: &str, open: Option<&str>) -> Result<(), AppError> {
        if open == Some(id) {
            return Err(AppError::ProjectOpen);
        }
        let folder = self.folder(id)?;
        if !folder.is_dir() {
            return Err(AppError::NoSuchProject);
        }
        std::fs::remove_dir_all(&folder).map_err(|e| AppError::Store(format!("{}: {e}", folder.display())))?;
        log::info("store", id, "deleted");
        Ok(())
    }

    /// Deletes every unlocked project unused for 30 days (never the open one); how many went. A folder whose
    /// project.json won't read counts from the file's (or folder's) last change.
    pub fn sweep(&self, now: u64, open: Option<&str>) -> u32 {
        let mut gone = 0;
        for id in self.ids() {
            let (used_at, locked) = match self.read(&id) {
                Ok(p) => (p.used_at, p.locked),
                Err(_) => (self.changed_at(&id), false),
            };
            if !rules::expired(&id, used_at, locked, now, open) {
                continue;
            }
            match std::fs::remove_dir_all(self.root.join(&id)) {
                Ok(()) => gone += 1,
                Err(e) => log::error("store", &id, format!("sweep couldn't delete: {e}")),
            }
        }
        if gone > 0 {
            log::info("store", "sweep", format!("deleted {gone} unused projects"));
        }
        gone
    }

    /// The names of the library's project folders.
    fn ids(&self) -> Vec<String> {
        let Ok(entries) = std::fs::read_dir(&self.root) else { return Vec::new() };
        entries
            .flatten()
            .filter(|e| e.path().is_dir())
            .filter_map(|e| e.file_name().into_string().ok())
            .filter(|id| crate::ids::is_plain(id))
            .collect()
    }

    fn changed_at(&self, id: &str) -> u64 {
        let folder = self.root.join(id);
        let modified = std::fs::metadata(folder.join(FILE)).or_else(|_| std::fs::metadata(&folder)).and_then(|m| m.modified());
        modified.ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |d| d.as_millis() as u64)
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use crate::project::Part;
    use crate::swap::Swap;

    pub fn library(name: &str) -> (Library, PathBuf) {
        let d = crate::testkit::temp_dir(&format!("store-{name}"));
        (Library::new(d.join("projects")), d)
    }

    fn saved(lib: &Library, id: &str, used_at: u64, locked: bool) -> ProjectFile {
        let p = ProjectFile { locked, ..ProjectFile::new(id.into(), used_at) };
        lib.write(&p).unwrap();
        p
    }

    const DAY: u64 = 24 * 60 * 60 * 1000;
    const NOW: u64 = 1_764_000_000_000;

    #[test]
    fn list_is_newest_first_and_skips_a_broken_file() {
        let (lib, _) = library("list");
        saved(&lib, "old", NOW - 5 * DAY, false);
        saved(&lib, "new", NOW, true);
        crate::atomic::write(&lib.root.join("broken").join(FILE), "{ not json").unwrap();
        let ids: Vec<_> = lib.list().into_iter().map(|s| (s.id, s.locked)).collect();
        assert_eq!(ids, [("new".to_string(), true), ("old".to_string(), false)]);
        assert!(Library::new("/nowhere/at/all".into()).list().is_empty(), "no library yet: no projects");
    }

    #[test]
    fn a_summary_points_at_the_thumbnail_once_it_exists() {
        let (lib, _) = library("thumb");
        let p = saved(&lib, "a", NOW, false);
        assert_eq!(lib.summary(&p).thumb, None);
        std::fs::write(lib.thumb_file("a").unwrap(), b"jpg").unwrap();
        assert_eq!(lib.summary(&p).thumb, Some(lib.root.join("a/thumb.jpg")));
    }

    #[test]
    fn locking_keeps_the_clock_and_stops_the_countdown() {
        let (lib, _) = library("lock");
        saved(&lib, "a", NOW, false);
        let s = lib.set_locked("a", true).unwrap();
        assert_eq!((s.locked, s.deletes_at, s.used_at), (true, None, NOW));
        assert_eq!(lib.set_locked("a", false).unwrap().deletes_at, Some(NOW + rules::KEEP_MS));
        assert_eq!(lib.set_locked("zz", true), Err(AppError::NoSuchProject));
    }

    #[test]
    fn delete_removes_the_folder_but_refuses_the_open_one() {
        let (lib, _) = library("delete");
        saved(&lib, "a", NOW, false);
        assert_eq!(lib.delete("a", Some("a")), Err(AppError::ProjectOpen));
        assert_eq!(lib.delete("a", Some("a")).unwrap_err().to_string(), "This project is open. Close it first.");
        lib.delete("a", None).unwrap();
        assert!(!lib.root.join("a").exists());
        assert_eq!(lib.delete("a", None), Err(AppError::NoSuchProject));
        assert_eq!(lib.delete("../projects", None), Err(AppError::NoSuchProject), "can't leave the library");
        assert!(lib.root.exists());
    }

    #[test]
    fn sweep_deletes_only_expired_projects_and_never_the_users_files() {
        let (lib, d) = library("sweep");
        let video = d.join("mine/take.mov");
        let recording = d.join("mine/mic.wav");
        crate::atomic::write(&video, "video").unwrap();
        crate::atomic::write(&recording, "sound").unwrap();
        let swap = Swap { recording: recording.clone(), offset: 0.0, synced: true, media: lib.audio_dir("gone").unwrap().join("swap-1.mov") };
        let mut gone = ProjectFile::new("gone".into(), NOW - 30 * DAY);
        gone.parts = vec![Part { id: 1, path: video.clone(), name: "take.mov".into(), swap: Some(swap.clone()) }];
        lib.write(&gone).unwrap();
        crate::atomic::write(&swap.media, "remux").unwrap();
        saved(&lib, "fresh", NOW - 29 * DAY, false);
        saved(&lib, "locked", NOW - 300 * DAY, true);
        saved(&lib, "open", NOW - 300 * DAY, false);

        assert_eq!(lib.sweep(NOW, Some("open")), 1);
        let mut left: Vec<_> = lib.list().into_iter().map(|s| s.id).collect();
        left.sort();
        assert_eq!(left, ["fresh", "locked", "open"]);
        assert!(video.is_file() && recording.is_file(), "the user's video and recording stay");
        assert_eq!(lib.sweep(NOW, Some("open")), 0, "nothing more to do");
    }

    #[test]
    fn sweep_dates_a_broken_project_by_its_file() {
        let (lib, _) = library("sweep-broken");
        crate::atomic::write(&lib.root.join("broken").join(FILE), "{ not json").unwrap();
        let written = lib.changed_at("broken");
        assert!(written > 0);
        assert_eq!(lib.sweep(written + rules::KEEP_MS - 1, None), 0, "written just now");
        assert_eq!(lib.sweep(written + rules::KEEP_MS, None), 1);
        assert!(!lib.root.join("broken").exists());
    }

    #[test]
    fn the_folder_name_is_the_id() {
        let (lib, _) = library("id");
        crate::atomic::write(&lib.root.join("real").join(FILE), r#"{ "id": "../elsewhere" }"#).unwrap();
        assert_eq!(lib.read("real").unwrap().id, "real");
        assert_eq!(lib.read("missing"), Err(AppError::NoSuchProject));
        assert!(matches!(lib.read("../x"), Err(AppError::NoSuchProject)));
    }
}
