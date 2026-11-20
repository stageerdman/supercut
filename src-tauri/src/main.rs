//! SuperCut: the Tauri shell. The web UI in ../src calls the commands below.
//! Video and audio never leave the Mac. Network use: the one-time speech model download,
//! and transcript text sent to Claude through the user's own Claude Code CLI.

mod audio;
mod claude;
mod error;
mod keep_awake;
mod log;
mod media;
mod parakeet;
mod project;
mod recognizer;
mod transcribe;
mod words;

use error::AppError;
use project::{Part, Project};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{Emitter, State};

type Shared = Mutex<Project>;

/// What the status line shows while a part is being worked on.
#[derive(Serialize, Clone)]
struct Progress {
    part: u32,
    stage: &'static str, // "download" | "transcribe"
    done: u64,
    total: u64,
}

#[tauri::command]
async fn claude_status() -> claude::Status {
    tauri::async_runtime::spawn_blocking(|| claude::status(claude::find(&claude::candidates())))
        .await
        .unwrap_or(claude::Status { state: "missing", message: "Couldn't check Claude Code.".into() })
}

/// One real Claude call on a sample transcript: proves Magic will work on this Mac.
#[tauri::command]
async fn claude_self_test() -> Result<claude::picks::Picks, AppError> {
    tauri::async_runtime::spawn_blocking(|| claude::self_test::run(&claude::locate()?, "self-test"))
        .await
        .map_err(|e| AppError::ClaudeFailed(e.to_string()))?
}

#[tauri::command]
fn add_video(project: State<Shared>, path: PathBuf) -> Result<Part, AppError> {
    let part = project.lock().unwrap().add(&path)?;
    log::info("project", &format!("part-{}", part.id), format!("added {}", part.path.display()));
    Ok(part)
}

#[tauri::command]
fn remove_part(project: State<Shared>, id: u32) -> Result<(), AppError> {
    project.lock().unwrap().remove(id)
}

/// Downloads the model first if needed, then transcribes. Emits `progress` (see `Progress`).
#[tauri::command]
async fn transcribe_part(app: tauri::AppHandle, project: State<'_, Shared>, id: u32) -> Result<transcribe::Transcript, AppError> {
    let path = project.lock().unwrap().get(id)?.path.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let emit = |stage, done, total| {
            let _ = app.emit("progress", Progress { part: id, stage, done, total });
        };
        let dir = parakeet::model_dir();
        if !parakeet::model_ready(&dir) {
            log::info("model", &format!("part-{id}"), "downloading speech model");
            parakeet::download_model(parakeet::MODEL_URL, &dir, |d, t| emit("download", d, t))?;
        }
        transcribe::transcribe_file(&dir, &audio::bundled_ffmpeg(), &path, &format!("part-{id}"), |d, t| {
            emit("transcribe", d as u64, t as u64)
        })
    })
    .await
    .map_err(|e| AppError::Recognize(e.to_string()))?
}

/// Prints the result as JSON, or the plain error and exit code 1.
fn print_and_exit<T: Serialize>(result: Result<T, AppError>) -> ! {
    match result {
        Ok(v) => println!("{}", serde_json::to_string(&v).unwrap()),
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(1);
        }
    }
    std::process::exit(0)
}

fn main() {
    // CLI modes let `npm run smoke` prove the packaged app really works:
    // `--transcribe <file>` (bundled ffmpeg + ONNX Runtime) and `--claude-test` (the user's Claude Code).
    let args: Vec<String> = std::env::args().collect();
    match args.iter().map(String::as_str).collect::<Vec<_>>().as_slice() {
        [_, "--transcribe", file] => print_and_exit(transcribe::transcribe_file(
            &parakeet::model_dir(),
            &audio::bundled_ffmpeg(),
            Path::new(file),
            "cli",
            |_, _| {},
        )),
        [_, "--claude-test"] => print_and_exit(claude::locate().and_then(|bin| claude::self_test::run(&bin, "cli"))),
        _ => {}
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Shared::default())
        .invoke_handler(tauri::generate_handler![claude_status, claude_self_test, add_video, remove_part, transcribe_part])
        .run(tauri::generate_context!())
        .expect("error while running SuperCut");
}
