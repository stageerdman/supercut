//! The real recognizer: Parakeet TDT v3 in-process (parakeet-rs on ONNX Runtime), nothing uploaded.

use crate::audio::RATE;
use crate::error::AppError;
use crate::onnx;
use crate::recognizer::{SpeechRecognizer, Token};
use parakeet_rs::{ExecutionConfig, ParakeetTDT, TimestampMode, Transcriber};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const MODEL_FILES: [&str; 3] = ["vocab.txt", "decoder_joint-model.int8.onnx", "encoder-model.int8.onnx"];

/// Where the model lives. The same folder for `npm run fetch-model`, tests and the packaged app.
pub fn model_dir() -> PathBuf {
    if let Some(dir) = std::env::var_os("SUPERCUT_MODEL_DIR") {
        return dir.into();
    }
    crate::paths::data("models/parakeet-tdt-0.6b-v3-int8")
}

pub fn model_ready(dir: &Path) -> bool {
    MODEL_FILES.iter().all(|f| dir.join(f).is_file())
}

/// The same files `npm run fetch-model` gets: plain files, nothing to unpack.
pub const MODEL_URL: &str = "https://huggingface.co/istupakov/parakeet-tdt-0.6b-v3-onnx/resolve/main/";

/// The one download in SuperCut, and it goes *to* this Mac. Each file lands as `.part`
/// and is renamed when complete, so a cut connection never leaves a "ready" broken model.
/// Finished files are kept, so a retry resumes. `progress(bytes done, bytes total)`.
pub fn download_model(base: &str, dir: &Path, mut progress: impl FnMut(u64, u64)) -> Result<(), AppError> {
    static ONE_AT_A_TIME: Mutex<()> = Mutex::new(());
    let _one = ONE_AT_A_TIME.lock().unwrap_or_else(|e| e.into_inner());
    let err = |e: &dyn std::fmt::Display| AppError::ModelDownload(e.to_string());
    std::fs::create_dir_all(dir).map_err(|e| err(&e))?;
    let todo: Vec<&str> = MODEL_FILES.into_iter().filter(|f| !dir.join(f).is_file()).collect();
    let mut sizes = Vec::new();
    for f in &todo {
        let r = ureq::head(&format!("{base}{f}")).call().map_err(|e| err(&e))?;
        sizes.push(r.header("content-length").and_then(|v| v.parse::<u64>().ok()).unwrap_or(0));
    }
    let total: u64 = sizes.iter().sum();
    let mut done = 0u64;
    for f in todo {
        let part = dir.join(format!("{f}.part"));
        let mut body = ureq::get(&format!("{base}{f}")).call().map_err(|e| err(&e))?.into_reader();
        let mut out = std::fs::File::create(&part).map_err(|e| err(&e))?;
        let mut buf = vec![0u8; 1 << 20];
        loop {
            let n = std::io::Read::read(&mut body, &mut buf).map_err(|e| err(&e))?;
            if n == 0 {
                break;
            }
            std::io::Write::write_all(&mut out, &buf[..n]).map_err(|e| err(&e))?;
            done += n as u64;
            progress(done, total.max(done));
        }
        std::fs::rename(&part, dir.join(f)).map_err(|e| err(&e))?;
    }
    Ok(())
}

pub struct Parakeet(ParakeetTDT);

impl SpeechRecognizer for Parakeet {
    fn recognize(&mut self, samples: &[f32]) -> Result<Vec<Token>, AppError> {
        let r = self
            .0
            .transcribe_samples(samples.to_vec(), RATE as u32, 1, Some(TimestampMode::Tokens))
            .map_err(|e| AppError::Recognize(e.to_string()))?;
        Ok(r.tokens.into_iter().map(|t| Token { text: t.text, s: t.start as f64, e: t.end as f64 }).collect())
    }
}

/// Loaded once, kept for the life of the app: ONNX Runtime allows one environment per process,
/// and loading takes seconds. The lock also means one transcription at a time.
static MODEL: Mutex<Option<Parakeet>> = Mutex::new(None);

/// Runs `job` with the loaded model, loading it first if needed.
pub fn with_model<T>(dir: &Path, job: impl FnOnce(&mut Parakeet) -> Result<T, AppError>) -> Result<T, AppError> {
    if !model_ready(dir) {
        return Err(AppError::ModelMissing { dir: dir.display().to_string() });
    }
    let mut slot = MODEL.lock().unwrap_or_else(|e| e.into_inner());
    if slot.is_none() {
        *slot = Some(load(dir)?);
    }
    job(slot.as_mut().expect("model loaded above"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn empty_dir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("supercut-model-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn half_downloaded_files_dont_count_as_a_model() {
        let d = empty_dir("half");
        for f in MODEL_FILES {
            std::fs::write(d.join(format!("{f}.part")), b"x").unwrap();
        }
        assert!(!model_ready(&d));
        assert!(matches!(with_model(&d, |_| Ok(())), Err(AppError::ModelMissing { .. })));
    }

    #[test]
    fn a_failed_download_says_so_and_leaves_no_ready_model() {
        let d = empty_dir("offline");
        // Port 9 (discard) refuses connections on a Mac: an offline stand-in.
        let err = download_model("http://127.0.0.1:9/", &d, |_, _| {}).unwrap_err();
        assert!(err.to_string().starts_with("Couldn't download the speech model."), "{err}");
        assert!(!model_ready(&d));
    }
}

fn load(dir: &Path) -> Result<Parakeet, AppError> {
    let err = |e: &dyn std::fmt::Display| AppError::ModelLoad(e.to_string());
    let env = onnx::environment().map_err(|e| err(&e))?.clone();
    let model = ParakeetTDT::from_pretrained(dir, Some(ExecutionConfig::new().with_environment(env))).map_err(|e| err(&e))?;
    Ok(Parakeet(model))
}
