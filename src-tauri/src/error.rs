//! Every failure the user can meet, each with one plain sentence (the banner text).
//! Details from ffmpeg or ONNX Runtime ride along so the log shows the real cause.

use serde::{Serialize, Serializer};
use std::fmt;

#[derive(Debug, Clone, PartialEq)]
pub enum AppError {
    Unsupported { ext: String },
    AudioOnly,
    Missing { name: String },
    TooManyParts,
    NoSuchPart(u32),
    ModelMissing { dir: String },
    ModelLoad(String),
    ModelDownload(String),
    FfmpegStart { ffmpeg: String, why: String },
    Unreadable { file: String, why: String },
    Recognize(String),
    Vad(String),
    ClaudeMissing,
    ClaudeSignedOut,
    ClaudeBusy,
    ClaudeFailed(String),
    Rules(String),
    Learning(String),
    Preview(String),
    /// A newer edit's preview began: this one is no longer wanted.
    PreviewStale,
    /// A file that can't be a part's new sound (by its extension).
    NotSound { ext: String },
    NoSound { name: String },
    /// A new sound that ffmpeg can't decode.
    SoundUnreadable { file: String, why: String },
    /// The recording's sound matches no stretch of the video's: it's not a recording of this take.
    NoMatch { name: String },
    Swap(String),
    /// The project's folder is gone (deleted, swept) or the id names none.
    NoSuchProject,
    /// Deleting the project that is open.
    ProjectOpen,
    /// A project command for a project that isn't the open one.
    NotOpen,
    /// Reading or writing the project library.
    Store(String),
    /// Making a project's card picture (logged, never shown).
    Thumb(String),
    /// Downloading or installing an update (updates/).
    Update(String),
    /// Install asked for with no newer version known.
    NoUpdate,
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        match self {
            Self::Unsupported { ext } if ext.is_empty() => write!(f, "Only video files open here. Try MP4 or MOV."),
            Self::Unsupported { ext } => write!(f, ".{ext} files don't open yet. Try MP4 or MOV."),
            Self::AudioOnly => write!(f, "That's an audio file. Better audio comes in a later version."),
            Self::Missing { name } => write!(f, "Can't find {name}."),
            Self::TooManyParts => write!(f, "Two parts at most. Remove one to add another."),
            Self::NoSuchPart(id) => write!(f, "Part {id} isn't in this project any more."),
            Self::ModelMissing { dir } => write!(f, "The speech model isn't downloaded yet ({dir})."),
            Self::ModelLoad(why) => write!(f, "Couldn't load the speech model: {why}"),
            Self::ModelDownload(why) => {
                write!(f, "Couldn't download the speech model. Check your internet connection and try again. ({why})")
            }
            Self::FfmpegStart { ffmpeg, why } => write!(f, "Couldn't start ffmpeg ({ffmpeg}): {why}"),
            Self::Unreadable { file, why } => write!(f, "This video can't be read. It may be damaged. ({file}: {why})"),
            Self::Recognize(why) => write!(f, "Transcription failed: {why}"),
            Self::Vad(why) => write!(f, "Couldn't find where the talking is: {why}"),
            Self::ClaudeMissing => write!(f, "Install Claude Code to use Magic Cut."),
            Self::ClaudeSignedOut => write!(f, "Open Terminal and run `claude`, then sign in."),
            Self::ClaudeBusy => write!(f, "Claude is busy or your usage limit is reached. Try again in a few minutes."),
            Self::ClaudeFailed(why) => write!(f, "Claude couldn't answer: {why}"),
            Self::Rules(why) => write!(f, "Couldn't read or save your editing rules. ({why})"),
            Self::Learning(why) => write!(f, "Couldn't save Magic's learning log. ({why})"),
            Self::Preview(why) => write!(f, "Couldn't make the smooth preview; playing the original instead. ({why})"),
            Self::PreviewStale => write!(f, "The edit changed before its preview was ready."),
            Self::NotSound { ext } => write!(f, ".{ext} files can't be used as sound. Try WAV, M4A or MP3."),
            Self::NoSound { name } => write!(f, "{name} has no sound in it."),
            Self::SoundUnreadable { file, why } => write!(f, "This audio file can't be read. ({file}: {why})"),
            Self::NoMatch { name } => write!(f, "{name} doesn't match this video's sound. Nothing changed."),
            Self::Swap(why) => write!(f, "Couldn't use the new sound. ({why})"),
            Self::NoSuchProject => write!(f, "This project isn't here any more."),
            Self::ProjectOpen => write!(f, "This project is open. Close it first."),
            Self::NotOpen => write!(f, "This project isn't open any more. Open it again from Home."),
            Self::Store(why) => write!(f, "Couldn't save or read your projects. ({why})"),
            Self::Thumb(why) => write!(f, "Couldn't make the project's picture. ({why})"),
            Self::Update(why) => write!(f, "Couldn't update Magic Cut. Check your internet connection and try again. ({why})"),
            Self::NoUpdate => write!(f, "There's no update to install."),
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
