//! The open project: one or two video parts, played one after the other.
//! Only bookkeeping lives here (no I/O), so every rule is a fast unit test.

use crate::error::AppError;
use crate::media;
use serde::Serialize;
use std::path::{Path, PathBuf};

pub const MAX_PARTS: usize = 2;

#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Part {
    /// Stable for the life of the project, never reused: a late transcript can't land on the wrong part.
    pub id: u32,
    pub path: PathBuf,
    /// The file name, for labels and banners.
    pub name: String,
}

#[derive(Default)]
pub struct Project {
    parts: Vec<Part>,
    next_id: u32,
}

impl Project {
    pub fn parts(&self) -> &[Part] {
        &self.parts
    }

    pub fn add(&mut self, path: &Path) -> Result<Part, AppError> {
        media::require_video(path)?;
        if self.parts.len() >= MAX_PARTS {
            return Err(AppError::TooManyParts);
        }
        self.next_id += 1;
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let part = Part { id: self.next_id, path: path.to_path_buf(), name };
        self.parts.push(part.clone());
        Ok(part)
    }

    pub fn get(&self, id: u32) -> Result<&Part, AppError> {
        self.parts.iter().find(|p| p.id == id).ok_or(AppError::NoSuchPart(id))
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
    fn non_videos_are_refused_and_not_added() {
        let mut p = Project::default();
        assert_eq!(p.add(Path::new("voice.m4a")), Err(AppError::AudioOnly));
        assert!(p.parts().is_empty());
    }

    #[test]
    fn unknown_parts_say_so() {
        let mut p = Project::default();
        assert_eq!(p.remove(7), Err(AppError::NoSuchPart(7)));
        assert_eq!(p.get(7).unwrap_err().to_string(), "Part 7 isn't in this project any more.");
    }
}
