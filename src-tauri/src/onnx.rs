//! The one ONNX Runtime environment of the process, shared by Parakeet (`parakeet.rs`) and Silero (`vad.rs`):
//! ONNX Runtime allows one environment per process.

use parakeet_rs::ort::environment::Environment;
use std::sync::OnceLock;

static ENV: OnceLock<Result<Environment, String>> = OnceLock::new();

/// Built on first use. A failure is kept and returned to every caller (as its message).
pub fn environment() -> Result<&'static Environment, String> {
    ENV.get_or_init(|| parakeet_rs::ort::init().build().map_err(|e| e.to_string())).as_ref().map_err(Clone::clone)
}
