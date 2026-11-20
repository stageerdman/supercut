//! The one seam between SuperCut and a speech engine.
//! `transcribe` only knows this trait, so tests run it with a fake and the app with Parakeet
//! (`parakeet.rs`).

use crate::error::AppError;

/// One recognized piece of text. Times are seconds from the start of the samples passed in.
/// Text follows SentencePiece: a leading space or "▁" begins a new word.
#[derive(Debug, Clone, PartialEq)]
pub struct Token {
    pub text: String,
    pub s: f64,
    pub e: f64,
}

pub trait SpeechRecognizer {
    /// `samples`: 16 kHz mono f32, at most one chunk (~2 minutes).
    fn recognize(&mut self, samples: &[f32]) -> Result<Vec<Token>, AppError>;
}
