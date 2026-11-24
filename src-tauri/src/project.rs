//! The open project: one or two video parts, played one after the other.
//! Only bookkeeping lives here (no I/O), so every rule is a fast unit test.

use crate::error::AppError;
use crate::media;
use crate::swap::Swap;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

pub const MAX_PARTS: usize = 2;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Part {
    /// Stable for the life of the project, never reused: a late transcript can't land on the wrong part.
    pub id: u32,
    pub path: PathBuf,
    /// The file name, for labels and banners.
    pub name: String,
    /// Better audio, once the user gave it (swap/mod.rs).
    pub swap: Option<Swap>,
}

impl Part {
    /// What the part plays, previews and transcribes from: the video with its new sound, else the video.
    pub fn media(&self) -> &Path {
        self.swap.as_ref().map_or(&self.path, |s| &s.media)
    }
}

#[derive(Default)]
pub struct Project {
    parts: Vec<Part>,
    next_id: u32,
}

impl Project {
    /// A saved project back as it was. Ids keep counting past every saved part even if `next_id` was lost.
    pub fn restore(parts: Vec<Part>, next_id: u32) -> Self {
        let next_id = parts.iter().map(|p| p.id).fold(next_id, u32::max);
        Self { parts, next_id }
    }

    pub fn parts(&self) -> &[Part] {
        &self.parts
    }

    /// The last id given out (saved as `nextPartId`).
    pub fn next_id(&self) -> u32 {
        self.next_id
    }

    pub fn add(&mut self, path: &Path) -> Result<Part, AppError> {
        media::require_video(path)?;
        if self.parts.len() >= MAX_PARTS {
            return Err(AppError::TooManyParts);
        }
        self.next_id += 1;
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let part = Part { id: self.next_id, path: path.to_path_buf(), name, swap: None };
        self.parts.push(part.clone());
        Ok(part)
    }

    pub fn get(&self, id: u32) -> Result<&Part, AppError> {
        self.parts.iter().find(|p| p.id == id).ok_or(AppError::NoSuchPart(id))
    }

    /// The part's sound from now on (replacing an earlier swap; None = the video's own sound again); the part as
    /// it is now.
    pub fn set_swap(&mut self, id: u32, swap: Option<Swap>) -> Result<Part, AppError> {
        let part = self.parts.iter_mut().find(|p| p.id == id).ok_or(AppError::NoSuchPart(id))?;
        part.swap = swap;
        Ok(part.clone())
    }

    pub fn remove(&mut self, id: u32) -> Result<(), AppError> {
        self.get(id)?;
        self.parts.retain(|p| p.id != id);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parts_get_order_names_and_fresh_ids() {
        let mut p = Project::default();
        let a = p.add(Path::new("/v/Take 1.mov")).unwrap();
        let b = p.add(Path::new("/v/take2.MP4")).unwrap();
        assert_eq!((a.id, a.name.as_str(), b.id), (1, "Take 1.mov", 2));
        assert_eq!(p.parts().iter().map(|x| x.id).collect::<Vec<_>>(), [1, 2]);
    }

    #[test]
    fn a_third_part_is_refused_until_one_is_removed() {
        let mut p = Project::default();
        p.add(Path::new("a.mp4")).unwrap();
        p.add(Path::new("b.mp4")).unwrap();
        assert_eq!(p.add(Path::new("c.mp4")), Err(AppError::TooManyParts));
        p.remove(1).unwrap();
        let c = p.add(Path::new("c.mp4")).unwrap();
        assert_eq!(c.id, 3, "ids are never reused");
        assert_eq!(p.parts().iter().map(|x| x.name.as_str()).collect::<Vec<_>>(), ["b.mp4", "c.mp4"]);
    }

    #[test]
    fn a_restored_project_never_reuses_an_id() {
        let part = |id| Part { id, path: "/v/a.mov".into(), name: "a.mov".into(), swap: None };
        let mut p = Project::restore(vec![part(2)], 5);
        assert_eq!(p.add(Path::new("b.mov")).unwrap().id, 6, "counts on from the saved next id");
        let mut lost = Project::restore(vec![part(4)], 0);
        assert_eq!(lost.add(Path::new("b.mov")).unwrap().id, 5, "an old file without nextPartId counts past its parts");
    }

    #[test]
    fn non_videos_are_refused_and_not_added() {
        let mut p = Project::default();
        assert_eq!(p.add(Path::new("voice.m4a")), Err(AppError::AudioOnly));
        assert!(p.parts().is_empty());
    }

    #[test]
    fn a_swapped_part_plays_its_new_media_and_keeps_its_video() {
        let mut p = Project::default();
        let a = p.add(Path::new("/v/a.mov")).unwrap();
        assert_eq!(a.media(), Path::new("/v/a.mov"));
        let swap = Swap { recording: "/r/mic.wav".into(), offset: -1.2, synced: true, media: "/c/swap-1.mov".into() };
        let b = p.set_swap(a.id, Some(swap)).unwrap();
        assert_eq!((b.media(), b.path.as_path()), (Path::new("/c/swap-1.mov"), Path::new("/v/a.mov")));
        assert_eq!(p.get(a.id).unwrap().media(), Path::new("/c/swap-1.mov"));
        assert_eq!(p.set_swap(9, b.swap.clone()), Err(AppError::NoSuchPart(9)));
        assert_eq!(p.set_swap(a.id, None).unwrap().media(), Path::new("/v/a.mov"), "back to camera audio");
    }

    #[test]
    fn unknown_parts_say_so() {
        let mut p = Project::default();
        assert_eq!(p.remove(7), Err(AppError::NoSuchPart(7)));
        assert_eq!(p.get(7).unwrap_err().to_string(), "Part 7 isn't in this project any more.");
    }
}
