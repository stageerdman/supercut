//! The open project: at most one, its parts in `project` (which add/remove/swap change as before), saved into the
//! library on every `save`. With none open, `project` is an unsaved scratch project, as before the library.

use super::doc::{Cover, Opened, ProjectFile};
use super::thumb;
use super::Library;
use crate::error::AppError;
use crate::log;
use crate::media;
use crate::project::Project;
use serde_json::Value;
use std::path::PathBuf;

/// What the UI says about its edit on every save.
#[derive(Debug, Clone)]
pub struct Edit {
    pub name: String,
    pub length: f64,
    pub cover: Option<Cover>,
    pub ui: Value,
}

#[derive(Default)]
pub struct Session {
    open: Option<String>,
    pub project: Project,
}

impl Session {
    pub fn open_id(&self) -> Option<&str> {
        self.open.as_deref()
    }

    /// Where a swap's media goes: the open project's audio/, else the cache (`fallback`).
    pub fn audio_dir(&self, lib: &Library, fallback: PathBuf) -> Result<PathBuf, AppError> {
        self.open.as_deref().map_or(Ok(fallback), |id| lib.audio_dir(id))
    }

    /// A project for these videos, now the open one. If one was started from the same first video, that one opens
    /// instead (`existing`).
    pub fn new_project(&mut self, lib: &Library, paths: &[PathBuf], now: u64) -> Result<Opened, AppError> {
        let first = paths.first().ok_or(AppError::Unsupported { ext: String::new() })?;
        if let Some(found) = lib.find_video(first) {
            return Ok(Opened { existing: true, ..self.open(lib, &found.id, now)? });
        }
        let mut project = Project::default();
        for path in paths {
            media::require_file(path)?;
            project.add(path)?;
        }
        let file = ProjectFile {
            name: first.file_stem().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
            parts: project.parts().to_vec(),
            next_part_id: project.next_id(),
            ..ProjectFile::new(lib.fresh_id(), now)
        };
        lib.write(&file)?;
        log::info("store", &file.id, format!("new project from {}", first.display()));
        self.open = Some(file.id.clone());
        self.project = project;
        Ok(Opened { summary: lib.summary(&file), parts: file.parts, ui: None, existing: false })
    }

    /// The saved project, now the open one, used now. A part whose video has gone still loads: the UI offers Locate.
    pub fn open(&mut self, lib: &Library, id: &str, now: u64) -> Result<Opened, AppError> {
        let mut file = lib.read(id)?;
        file.used_at = now;
        lib.write(&file)?;
        self.project = Project::restore(file.parts.clone(), file.next_part_id);
        self.open = Some(file.id.clone());
        log::info("store", id, "opened");
        Ok(Opened { summary: lib.summary(&file), parts: file.parts, ui: file.ui, existing: false })
    }

    /// Writes the open project whole: the UI's edit and the parts as they are now. Returns the thumbnail to
    /// (re)make, when the cover moved or there is none yet.
    pub fn save(&self, lib: &Library, id: &str, edit: Edit, now: u64) -> Result<Option<thumb::Job>, AppError> {
        if self.open_id() != Some(id) {
            return Err(AppError::NotOpen);
        }
        let mut file = lib.read(id)?;
        let moved = file.cover != edit.cover;
        file.name = edit.name;
        file.length = edit.length;
        file.cover = edit.cover;
        file.ui = Some(edit.ui);
        file.used_at = now;
        file.parts = self.project.parts().to_vec();
        file.next_part_id = self.project.next_id();
        lib.write(&file)?;
        let thumb = lib.thumb_file(id)?;
        if !moved && thumb.is_file() {
            return Ok(None);
        }
        Ok(edit.cover.and_then(|c| self.project.get(c.part).ok().map(|p| thumb::Job { media: p.media().to_path_buf(), t: c.t, file: thumb })))
    }

    /// Forgets the open project; back to an empty scratch project.
    pub fn close(&mut self) {
        if let Some(id) = self.open.take() {
            log::info("store", &id, "closed");
        }
        self.project = Project::default();
    }
}

#[cfg(test)]
mod tests {
    use super::super::tests::library;
    use super::*;
    use serde_json::json;
    use std::path::Path;

    /// A video file: just has to exist and look like a video.
    fn video(dir: &Path, name: &str) -> PathBuf {
        let f = dir.join(name);
        crate::atomic::write(&f, "video").unwrap();
        f
    }

    const NOW: u64 = 1_764_000_000_000;

    fn edit(cover: Option<Cover>) -> Edit {
        Edit { name: "Renamed".into(), length: 12.5, cover, ui: json!({ "edit": { "cuts": [[1, 2]] } }) }
    }

    #[test]
    fn a_new_project_is_saved_and_open() {
        let (lib, d) = library("new");
        let o = Session::default().new_project(&lib, &[video(&d, "my-video.mov"), video(&d, "b.mp4")], NOW).unwrap();
        assert_eq!((o.summary.name.as_str(), o.existing, o.ui.clone()), ("my-video", false, None));
        assert_eq!(o.parts.iter().map(|p| p.id).collect::<Vec<_>>(), [1, 2]);
        let saved = lib.read(&o.summary.id).unwrap();
        assert_eq!((saved.created_at, saved.used_at, saved.next_part_id, saved.parts), (NOW, NOW, 2, o.parts));
    }

    #[test]
    fn a_new_project_takes_todays_add_rules() {
        let (lib, d) = library("new-rules");
        let mut s = Session::default();
        assert_eq!(s.new_project(&lib, &[video(&d, "voice.m4a")], NOW).unwrap_err(), AppError::AudioOnly);
        assert_eq!(s.new_project(&lib, &[d.join("gone.mov")], NOW).unwrap_err(), AppError::Missing { name: "gone.mov".into() });
        let three = [video(&d, "a.mov"), video(&d, "b.mov"), video(&d, "c.mov")];
        assert_eq!(s.new_project(&lib, &three, NOW).unwrap_err(), AppError::TooManyParts);
        assert!(lib.list().is_empty() && s.open_id().is_none(), "nothing made");
    }

    #[test]
    fn the_same_first_video_reopens_its_project() {
        let (lib, d) = library("same");
        let mut s = Session::default();
        let first = s.new_project(&lib, &[video(&d, "a.mov")], NOW).unwrap();
        let again = s.new_project(&lib, &[video(&d, "a.mov")], NOW + 1).unwrap();
        assert!(again.existing);
        assert_eq!((again.summary.id, again.summary.used_at), (first.summary.id, NOW + 1));
        assert_eq!(lib.list().len(), 1, "no twin");
    }

    #[test]
    fn save_then_reopen_gives_back_the_edit_parts_and_swaps() {
        let (lib, d) = library("reopen");
        let mut s = Session::default();
        let id = s.new_project(&lib, &[video(&d, "a.mov")], NOW).unwrap().summary.id;
        let swap = crate::swap::Swap { recording: d.join("mic.wav"), offset: -1.0, synced: true, media: lib.audio_dir(&id).unwrap().join("swap-1.mov") };
        s.project.set_swap(1, Some(swap.clone())).unwrap();
        s.save(&lib, &id, edit(None), NOW + 5).unwrap();
        s.close();
        assert!(s.open_id().is_none() && s.project.parts().is_empty());

        let o = s.open(&lib, &id, NOW + 9).unwrap();
        assert_eq!((o.summary.name.as_str(), o.summary.length, o.summary.used_at), ("Renamed", 12.5, NOW + 9));
        assert_eq!(o.ui, Some(edit(None).ui));
        assert_eq!(o.parts[0].swap, Some(swap));
        assert_eq!(lib.read(&id).unwrap().used_at, NOW + 9, "opening counts as use");
        assert_eq!(s.project.add(&video(&d, "b.mov")).unwrap().id, 2, "part ids keep counting after reopening");
    }

    #[test]
    fn part_ids_are_never_reused_across_a_reopen() {
        let (lib, d) = library("ids");
        let mut s = Session::default();
        let id = s.new_project(&lib, &[video(&d, "a.mov"), video(&d, "b.mov")], NOW).unwrap().summary.id;
        s.project.remove(2).unwrap();
        s.save(&lib, &id, edit(None), NOW).unwrap();
        s.open(&lib, &id, NOW).unwrap();
        assert_eq!(s.project.add(&video(&d, "c.mov")).unwrap().id, 3);
    }

    #[test]
    fn only_the_open_project_saves() {
        let (lib, d) = library("not-open");
        let mut s = Session::default();
        let id = s.new_project(&lib, &[video(&d, "a.mov")], NOW).unwrap().summary.id;
        assert_eq!(s.save(&lib, "other", edit(None), NOW).unwrap_err(), AppError::NotOpen);
        s.close();
        assert_eq!(s.save(&lib, &id, edit(None), NOW).unwrap_err(), AppError::NotOpen);
    }

    #[test]
    fn the_thumbnail_is_remade_only_when_the_cover_moves_or_is_missing() {
        let (lib, d) = library("cover");
        let mut s = Session::default();
        let id = s.new_project(&lib, &[video(&d, "a.mov")], NOW).unwrap().summary.id;
        let at = |t| Some(Cover { part: 1, t });
        let job = s.save(&lib, &id, edit(at(2.0)), NOW).unwrap().expect("first cover: make it");
        assert_eq!(job, thumb::Job { media: d.join("a.mov"), t: 2.0, file: lib.thumb_file(&id).unwrap() });
        assert!(s.save(&lib, &id, edit(at(2.0)), NOW).unwrap().is_some(), "still no thumb.jpg: try again");
        std::fs::write(&job.file, b"jpg").unwrap();
        assert_eq!(s.save(&lib, &id, edit(at(2.0)), NOW).unwrap(), None, "unchanged cover, picture exists");
        assert_eq!(s.save(&lib, &id, edit(at(4.0)), NOW).unwrap().map(|j| j.t), Some(4.0), "cover moved");
        assert_eq!(s.save(&lib, &id, edit(Some(Cover { part: 9, t: 1.0 })), NOW).unwrap(), None, "no such part");
    }

    #[test]
    fn swaps_go_into_the_open_projects_folder() {
        let (lib, d) = library("audio");
        let mut s = Session::default();
        assert_eq!(s.audio_dir(&lib, d.join("cache")).unwrap(), d.join("cache"), "nothing open: the cache");
        let id = s.new_project(&lib, &[video(&d, "a.mov")], NOW).unwrap().summary.id;
        assert_eq!(s.audio_dir(&lib, d.join("cache")).unwrap(), lib.folder(&id).unwrap().join("audio"));
    }
}
