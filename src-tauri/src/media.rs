//! What a dropped file is, judged by its extension, before we spend time opening it.

use crate::error::AppError;
use std::path::Path;

const VIDEO: [&str; 3] = ["mp4", "mov", "m4v"];
const AUDIO: [&str; 8] = ["wav", "m4a", "mp3", "aif", "aiff", "caf", "aac", "flac"];

fn ext(path: &Path) -> String {
    path.extension().and_then(|e| e.to_str()).unwrap_or_default().to_lowercase()
}

/// Ok for a video SuperCut can open, else the error the user should see.
pub fn require_video(path: &Path) -> Result<(), AppError> {
    let ext = ext(path);
    if VIDEO.contains(&ext.as_str()) {
        Ok(())
    } else if AUDIO.contains(&ext.as_str()) {
        Err(AppError::AudioOnly)
    } else {
        Err(AppError::Unsupported { ext })
    }
}

/// Ok if the file is there. Undoing a removed part re-adds its file, which may have moved since.
pub fn require_file(path: &Path) -> Result<(), AppError> {
    if path.is_file() {
        return Ok(());
    }
    let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
    Err(AppError::Missing { name })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_file_is_named() {
        let err = require_file(Path::new("/nowhere/my-video.mov")).unwrap_err();
        assert_eq!(err.to_string(), "Can't find my-video.mov.");
        assert_eq!(require_file(&Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml")), Ok(()));
    }

    #[test]
    fn videos_pass_in_any_case() {
        assert_eq!(require_video(Path::new("/a/Take 1.MOV")), Ok(()));
        assert_eq!(require_video(Path::new("clip.mp4")), Ok(()));
    }

    #[test]
    fn audio_and_other_files_say_why() {
        assert_eq!(require_video(Path::new("voice.m4a")), Err(AppError::AudioOnly));
        assert_eq!(require_video(Path::new("x.mkv")), Err(AppError::Unsupported { ext: "mkv".into() }));
        assert_eq!(require_video(Path::new("README")), Err(AppError::Unsupported { ext: "".into() }));
    }
}
