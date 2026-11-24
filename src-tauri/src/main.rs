//! Magic Cut: the Tauri shell. The web UI in ../src calls the commands below.
//! Video and audio never leave the Mac. Network use: the one-time speech model download,
//! and transcript text sent to Claude through the user's own Claude Code CLI.

mod atomic;
mod audio;
mod autocut;
mod claude;
mod error;
mod keep_awake;
mod learning;
mod learning_clip;
mod log;
mod media;
mod onnx;
mod parakeet;
mod project;
mod recognizer;
mod pieces;
mod preview;
mod rules;
mod speech;
mod swap;
#[cfg(test)]
mod testkit;
mod transcribe;
mod vad;
mod waveform;
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

/// Magic: the parts' transcripts (play order) → proposed cuts and notes, chosen by the user's Claude
/// with the user's saved editing rules (read fresh each run, so a save applies at once).
#[tauri::command]
async fn auto_cut(parts: Vec<autocut::lines::PartWords>) -> Result<autocut::Proposal, AppError> {
    tauri::async_runtime::spawn_blocking(move || autocut::run(&claude::locate()?, &parts, &rules::load(&rules::path())?, "magic"))
        .await
        .map_err(|e| AppError::ClaudeFailed(e.to_string()))?
}

/// The user's own editing rules, as saved.
#[tauri::command]
fn get_rules() -> Result<Vec<String>, AppError> {
    rules::load(&rules::path())
}

/// Saves the rules and returns them cleaned (trimmed, no empties, no repeats), as stored.
#[tauri::command]
fn save_rules(rules: Vec<String>) -> Result<Vec<String>, AppError> {
    let stored = rules::save(&rules::path(), rules)?;
    log::info("rules", "rules", format!("saved {} rules", stored.len()));
    Ok(stored)
}

/// Magic Trace: one run's learning log (built in src/ui/learning.js), kept on this Mac.
#[tauri::command]
fn save_learning_log(id: String, log: serde_json::Value) -> Result<(), AppError> {
    let file = learning::save(&learning::dir(), &id, &log)?;
    log::info("learning", &id, format!("saved {}", file.display()));
    Ok(())
}

/// One stretch of a part, in its own seconds: one the user heard (src/ui/trace.js verdict `heard`) or one kept
/// (the preview).
#[derive(serde::Deserialize)]
struct PartSpan {
    part: u32,
    s: f64,
    e: f64,
}

/// Magic Trace: the window heard before a review "No", saved beside the learning log. Paths come from the
/// open project, never from the web side, so a clip can only be cut from the user's own parts.
#[tauri::command]
async fn save_learning_clip(project: State<'_, Shared>, id: String, spans: Vec<PartSpan>) -> Result<(), AppError> {
    let spans = {
        let p = project.lock().unwrap();
        spans.iter().map(|x| Ok(learning_clip::Span { path: p.get(x.part)?.media().to_path_buf(), s: x.s, e: x.e })).collect::<Result<Vec<_>, AppError>>()?
    };
    let file = tauri::async_runtime::spawn_blocking(move || learning_clip::save(&audio::bundled_ffmpeg(), &learning::dir(), &id, &spans))
        .await
        .map_err(|e| AppError::Learning(e.to_string()))??;
    log::info("learning", "clip", format!("saved {}", file.display()));
    Ok(())
}

/// The edit's preview (preview/mod.rs): the kept spans, in play order, rendered into one file that plays over every
/// cut without a seek. A newer call makes an older one stop early (`PreviewStale`: expected, so not logged).
#[tauri::command]
async fn preview(project: State<'_, Shared>, spans: Vec<PartSpan>, width: u32, height: u32) -> Result<preview::Preview, AppError> {
    let spans = {
        let p = project.lock().unwrap();
        spans.iter().map(|x| Ok(preview::Span { part: x.part, path: p.get(x.part)?.media().to_path_buf(), s: x.s, e: x.e })).collect::<Result<Vec<_>, AppError>>()?
    };
    let t = preview::ticket();
    let trace = format!("preview-{t}");
    let made = tauri::async_runtime::spawn_blocking(move || {
        let made = preview::render(&audio::bundled_ffmpeg(), &preview::dir(), &spans, (width, height), &|| preview::latest(t), &trace);
        match &made {
            Err(e) if *e != AppError::PreviewStale => log::error("preview", &trace, e.to_string()),
            _ => {}
        }
        made
    });
    made.await.map_err(|e| AppError::Preview(e.to_string()))?
}

#[tauri::command]
fn add_video(project: State<Shared>, path: PathBuf) -> Result<Part, AppError> {
    media::require_file(&path)?;
    let part = project.lock().unwrap().add(&path)?;
    log::info("project", &format!("part-{}", part.id), format!("added {}", part.path.display()));
    Ok(part)
}

#[tauri::command]
fn remove_part(project: State<Shared>, id: u32) -> Result<(), AppError> {
    project.lock().unwrap().remove(id)
}

/// Better audio: `recording` becomes part `id`'s sound, lined up with the video's own sound, or at `offset` s when
/// given (a voice-over, a nudge, an undo putting a swap back). Returns the part, now playing `swap.media`. Its
/// waveform and transcript are then stale: ask for them again.
#[tauri::command]
async fn swap_audio(project: State<'_, Shared>, id: u32, recording: PathBuf, offset: Option<f64>) -> Result<Part, AppError> {
    media::require_sound(&recording)?;
    media::require_file(&recording)?;
    let video = project.lock().unwrap().get(id)?.path.clone();
    let trace = format!("part-{id}");
    let made = tauri::async_runtime::spawn_blocking(move || {
        let made = swap::make(&audio::bundled_ffmpeg(), &swap::dir(), &video, &recording, offset, &trace);
        if let Err(e) = &made {
            log::error("swap", &trace, e.to_string());
        }
        made
    });
    let swap = made.await.map_err(|e| AppError::Swap(e.to_string()))??;
    project.lock().unwrap().set_swap(id, swap)
}

/// The timeline's waveform for one part, from what it plays (its new sound once swapped).
#[tauri::command]
async fn waveform(project: State<'_, Shared>, id: u32) -> Result<waveform::Waveform, AppError> {
    let path = project.lock().unwrap().get(id)?.media().to_path_buf();
    tauri::async_runtime::spawn_blocking(move || waveform::of_file(&audio::bundled_ffmpeg(), &path))
        .await
        .map_err(|e| AppError::Unreadable { file: String::new(), why: e.to_string() })?
}

/// Only when asked (nothing transcribes on load). Reads what the part plays now, so asking again after a swap
/// regenerates the words from the new sound. Downloads the model first if needed. Emits `progress` (see `Progress`).
#[tauri::command]
async fn transcribe_part(app: tauri::AppHandle, project: State<'_, Shared>, id: u32) -> Result<transcribe::Transcript, AppError> {
    let path = project.lock().unwrap().get(id)?.media().to_path_buf();
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

/// Magic on one file, as one part: transcribe, then propose cuts and notes.
fn auto_cut_file(file: &Path) -> Result<autocut::Proposal, AppError> {
    let t = transcribe::transcribe_file(&parakeet::model_dir(), &audio::bundled_ffmpeg(), file, "cli", |_, _| {})?;
    let parts = [autocut::lines::PartWords { id: 1, words: t.words }];
    autocut::run(&claude::locate()?, &parts, &rules::load(&rules::path())?, "cli")
}

fn main() {
    // CLI modes let `npm run smoke` prove the packaged app really works:
    // `--transcribe <file>` (bundled ffmpeg + ONNX Runtime), `--claude-test` (the user's Claude Code)
    // and `--auto-cut <file>` (both, through Magic's engine). `--build-id` lets
    // `npm run install-app` prove which frontend this binary embeds (see build.rs).
    let args: Vec<String> = std::env::args().collect();
    match args.iter().map(String::as_str).collect::<Vec<_>>().as_slice() {
        [_, "--build-id"] => {
            println!("{}", env!("MAGIC_CUT_FRONTEND_ID"));
            std::process::exit(0)
        }
        [_, "--transcribe", file] => print_and_exit(transcribe::transcribe_file(
            &parakeet::model_dir(),
            &audio::bundled_ffmpeg(),
            Path::new(file),
            "cli",
            |_, _| {},
        )),
        [_, "--claude-test"] => print_and_exit(claude::locate().and_then(|bin| claude::self_test::run(&bin, "cli"))),
        [_, "--auto-cut", file] => print_and_exit(auto_cut_file(Path::new(file))),
        _ => {}
    }

    preview::clear(&preview::dir());
    swap::clear(&swap::dir());
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(Shared::default())
        .invoke_handler(tauri::generate_handler![claude_status, claude_self_test, auto_cut, get_rules, save_rules, save_learning_log, save_learning_clip, add_video, remove_part, swap_audio, transcribe_part, waveform, preview])
        .run(tauri::generate_context!())
        .expect("error while running Magic Cut");
}
