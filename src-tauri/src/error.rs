//! Every failure the user can meet, each with one plain sentence (the banner text).
//! Details from ffmpeg or ONNX Runtime ride along so the log shows the real cause.

use serde::{Serialize, Serializer};
use std::fmt;

#[derive(Debug, Clone, PartialEq)]
pub enum AppError {
    Unsupported { ext: String },
    AudioOnly,
    TooManyParts,
    NoSuchPart(u32),
    ModelMissing { dir: String },
    ModelLoad(String),
    ModelDownload(String),
    FfmpegStart { ffmpeg: String, why: String },
    Unreadable { file: String, why: String },
    Recognize(String),
    ClaudeMissing,
    ClaudeSignedOut,
    ClaudeBusy,
    ClaudeFailed(String),
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Unsupported { ext } if ext.is_empty() => write!(f, "SuperCut opens video files. Try MP4 or MOV."),
            Self::Unsupported { ext } => write!(f, "SuperCut can't open .{ext} files yet. Try MP4 or MOV."),
            Self::AudioOnly => write!(f, "That's an audio file. Better audio comes in a later version."),
            Self::TooManyParts => write!(f, "SuperCut works with two parts. Remove one to add another."),
            Self::NoSuchPart(id) => write!(f, "Part {id} isn't in this project any more."),
            Self::ModelMissing { dir } => write!(f, "The speech model isn't downloaded yet ({dir})."),
            Self::ModelLoad(why) => write!(f, "Couldn't load the speech model: {why}"),
            Self::ModelDownload(why) => {
                write!(f, "Couldn't download the speech model. Check your internet connection and try again. ({why})")
            }
            Self::FfmpegStart { ffmpeg, why } => write!(f, "Couldn't start ffmpeg ({ffmpeg}): {why}"),
            Self::Unreadable { file, why } => write!(f, "This video can't be read. It may be damaged. ({file}: {why})"),
            Self::Recognize(why) => write!(f, "Transcription failed: {why}"),
            Self::ClaudeMissing => write!(f, "Install Claude Code to use Magic Cut."),
            Self::ClaudeSignedOut => write!(f, "Open Terminal and run `claude`, then sign in."),
            Self::ClaudeBusy => write!(f, "Claude is busy or your usage limit is reached. Try again in a few minutes."),
            Self::ClaudeFailed(why) => write!(f, "Claude couldn't answer: {why}"),
        }
    }
}

impl std::error::Error for AppError {}

/// Tauri hands command errors to JS as their message.
impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}
