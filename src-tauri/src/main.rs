//! Magic Cut: the Tauri shell. The web UI in ../src calls the commands below.
//! Video and audio never leave the Mac. Network use: the one-time speech model download,
//! transcript text sent to Claude through the user's own Claude Code CLI, and update checks (updates/).

mod atomic;
mod audio;
mod autocut;
mod claude;
mod confirm;
mod error;
mod export;
mod ids;
mod keep_awake;
mod learning;
mod learning_clip;
mod log;
mod media;
mod onnx;
mod parakeet;
mod paths;
mod project;
mod recognizer;
mod report;
mod pieces;
mod preview;
mod rules;
mod speech;
mod store;
mod swap;
#[cfg(test)]
mod testkit;
mod transcribe;
mod updates;
mod usage;
mod vad;
mod waveform;
mod words;

use error::AppError;
use project::Part;
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use store::doc::{Cover, Opened, Summary};
use store::rules::now_ms;
use store::session::{Edit, Session};
use store::{thumb, Library};
use tauri::{Emitter, State};

/// The open project (store/session.rs): what every part command works on.
type Shared = Mutex<Session>;

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

/// Opens Terminal to install Claude and/or sign in, then come back here (claude/terminal.rs).
#[tauri::command]
async fn claude_setup() -> Result<(), AppError> {
    let opened = tauri::async_runtime::spawn_blocking(claude::open_setup).await;
    let result = opened.unwrap_or_else(|e| Err(AppError::ClaudeSetup(e.to_string())));
    if let Err(e) = &result {
        log::error("claude", "setup", &e.to_string());
    }
    result
}

/// Settings' "Send debug report": the fixed bundle to the Magic Cut server, answering its id (report/).
#[tauri::command]
async fn send_debug_report() -> Result<report::Sent, AppError> {
    let sent = tauri::async_runtime::spawn_blocking(|| report::send_now("debug-report")).await;
    sent.unwrap_or_else(|e| Err(AppError::Report(e.to_string())))
}

/// The self-test with its call recorded in the usage ledger (outside any project: never counted).
fn self_test(lib: &Library, tracker: &usage::Tracker, trace: &str) -> Result<claude::picks::Picks, AppError> {
    let passed = claude::self_test::run(&claude::locate()?, trace)?;
    tracker.call(lib, None, passed.model, passed.usage, trace);
    Ok(passed.picks)
}

/// Records Magic's Claude call, if one was made (no `run`: nothing was sent). `project` is the project it ran for.
fn record_magic(lib: &Library, tracker: &usage::Tracker, project: Option<&str>, proposal: &autocut::Proposal, trace: &str) {
    if let Some(run) = &proposal.run {
        tracker.call(lib, project, run.model.clone(), proposal.usage.clone(), trace);
    }
}

/// One real Claude call on a sample transcript: proves Magic will work on this Mac.
#[tauri::command]
async fn claude_self_test(app: tauri::AppHandle) -> Result<claude::picks::Picks, AppError> {
    use tauri::Manager;
    tauri::async_runtime::spawn_blocking(move || self_test(&app.state::<Library>(), &app.state::<usage::Tracker>(), "self-test"))
        .await
        .map_err(|e| AppError::ClaudeFailed(e.to_string()))?
}

/// Magic: the parts' transcripts (play order) → proposed cuts and notes, chosen by the user's Claude
/// with the user's saved editing rules (read fresh each run, so a save applies at once). Its tokens go on the
/// project open when it started.
#[tauri::command]
async fn auto_cut(session: State<'_, Shared>, library: State<'_, Library>, tracker: State<'_, usage::Tracker>, parts: Vec<autocut::lines::PartWords>) -> Result<autocut::Proposal, AppError> {
    let open = session.lock().unwrap().open_id().map(String::from);
    let proposal = tauri::async_runtime::spawn_blocking(move || autocut::run(&claude::locate()?, &parts, &rules::load(&rules::path())?, "magic"))
        .await
        .map_err(|e| AppError::ClaudeFailed(e.to_string()))??;
    let _one_at_a_time = session.lock().unwrap(); // the tally rewrites project.json
    record_magic(&library, &tracker, open.as_deref(), &proposal, "magic");
    Ok(proposal)
}

/// Every exported project's Claude tokens, and the total (only exported projects count).
#[tauri::command]
fn token_usage(tracker: State<usage::Tracker>) -> Result<usage::report::Report, AppError> {
    tracker.report()
}

/// The usage ledger's raw lines and where it lives.
#[tauri::command]
fn token_usage_notes(tracker: State<usage::Tracker>) -> Result<usage::Notes, AppError> {
    tracker.notes()
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
async fn save_learning_clip(session: State<'_, Shared>, id: String, spans: Vec<PartSpan>) -> Result<(), AppError> {
    let spans = {
        let p = &session.lock().unwrap().project;
        spans.iter().map(|x| Ok(learning_clip::Span { path: p.get(x.part)?.media().to_path_buf(), s: x.s, e: x.e })).collect::<Result<Vec<_>, AppError>>()?
    };
    let file = tauri::async_runtime::spawn_blocking(move || learning_clip::save(&audio::bundled_ffmpeg(), &learning::dir(), &id, &spans))
        .await
        .map_err(|e| AppError::Learning(e.to_string()))??;
    log::info("learning", "clip", format!("saved {}", file.display()));
    Ok(())
}

/// The kept spans with each part's media (its swapped sound included), from the open project.
fn kept_spans(session: &Shared, spans: &[PartSpan]) -> Result<Vec<preview::Span>, AppError> {
    let p = &session.lock().unwrap().project;
    spans.iter().map(|x| Ok(preview::Span { part: x.part, path: p.get(x.part)?.media().to_path_buf(), s: x.s, e: x.e })).collect()
}

/// The edit's preview (preview/mod.rs): the kept spans, in play order, rendered into one file that plays over every
/// cut without a seek. A newer call makes an older one stop early (`PreviewStale`: expected, so not logged).
#[tauri::command]
async fn preview(session: State<'_, Shared>, spans: Vec<PartSpan>, width: u32, height: u32) -> Result<preview::Preview, AppError> {
    let spans = kept_spans(&session, &spans)?;
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

/// What `export://progress` carries: frames done and in all (`done == total` while the join runs).
#[derive(Serialize, Clone)]
struct ExportProgress {
    done: u64,
    total: u64,
}

/// The Export button (export/mod.rs): the kept spans, in play order, rendered at source quality into `out`, which
/// appears only when complete. Contract: updates/2026-11-25 EXPORT - OPEN/update v1.md. A finished export makes
/// the project open when it started count in the token-usage totals.
#[tauri::command]
async fn export_video(app: tauri::AppHandle, session: State<'_, Shared>, library: State<'_, Library>, tracker: State<'_, usage::Tracker>, spans: Vec<PartSpan>, out: PathBuf, format: export::plan::Format) -> Result<export::Exported, AppError> {
    let spans = kept_spans(&session, &spans)?;
    let open = session.lock().unwrap().open_id().map(String::from);
    let trace = format!("export-{}", now_ms());
    let made = render_export(app, spans, out, format, trace.clone()).await?;
    if let Some(id) = open {
        let _one_at_a_time = session.lock().unwrap(); // marking rewrites project.json
        tracker.export(&library, &id, &trace);
    }
    Ok(made)
}

async fn render_export(app: tauri::AppHandle, spans: Vec<preview::Span>, out: PathBuf, format: export::plan::Format, trace: String) -> Result<export::Exported, AppError> {
    use tauri::Manager;
    tauri::async_runtime::spawn_blocking(move || {
        let _awake = keep_awake::KeepAwake::start(); // a sleeping Mac would stop it
        let job = export::Job { ffmpeg: &audio::bundled_ffmpeg(), spans: &spans, out: &out, format };
        let progress = |done, total| {
            let _ = app.emit("export://progress", ExportProgress { done, total });
        };
        let made = app.state::<export::Exports>().run(&job, &export::dir(), &progress, &trace);
        // A page that went Home meanwhile lost this promise: the event tells the new page how it ended.
        let _ = app.emit("export://done", made.as_ref().map(|x| x.file.display().to_string()).ok());
        made
    })
    .await
    .map_err(|e| AppError::Export(e.to_string()))?
}

/// What the Export popover shows (export/target.rs): where the file goes, its name (never one that exists), the
/// folder's free space, and the first part's picture. `folder` is the user's remembered choice, if any.
#[tauri::command]
async fn export_target(session: State<'_, Shared>, folder: Option<PathBuf>, format: export::plan::Format) -> Result<export::target::Target, AppError> {
    let first = session.lock().unwrap().project.parts().first().map(|p| p.path.clone()).ok_or(AppError::Export("there's no video to export".into()))?;
    tauri::async_runtime::spawn_blocking(move || {
        use export::target;
        let shape = export::probe(&audio::bundled_ffmpeg(), &first)?;
        let movies = Path::new(&std::env::var_os("HOME").unwrap_or_default()).join("Movies");
        let dir = target::folder(folder.as_deref(), &first, &movies);
        Ok(target::Target {
            name: target::name(&dir, &first, format),
            free: target::free(&dir),
            folder_name: target::folder_name(&dir),
            folder: dir,
            width: shape.width,
            height: shape.height,
            fps: shape.rate.fps(),
        })
    })
    .await
    .map_err(|e| AppError::Export(e.to_string()))?
}

/// Show in Finder: a Finder window with the file selected.
#[tauri::command]
fn export_reveal(path: PathBuf) -> Result<(), AppError> {
    std::process::Command::new("/usr/bin/open").arg("-R").arg(&path).spawn().map(|_| ()).map_err(|e| AppError::Export(format!("{}: {e}", path.display())))
}

/// Stops the running export: `export_video` then rejects with `ExportCancelled` and leaves nothing at `out`.
#[tauri::command]
fn export_cancel(exports: State<export::Exports>) {
    exports.cancel()
}

#[tauri::command]
fn add_video(session: State<Shared>, path: PathBuf) -> Result<Part, AppError> {
    media::require_file(&path)?;
    let part = session.lock().unwrap().project.add(&path)?;
    log::info("project", &format!("part-{}", part.id), format!("added {}", part.path.display()));
    Ok(part)
}

#[tauri::command]
fn remove_part(session: State<Shared>, id: u32) -> Result<(), AppError> {
    session.lock().unwrap().project.remove(id)
}

/// Better audio: `recording` becomes part `id`'s sound, lined up with the video's own sound, or at `offset` s when
/// given (a voice-over, a nudge, an undo putting a swap back). Returns the part, now playing `swap.media`. Its
/// waveform and transcript are then stale: ask for them again.
#[tauri::command]
async fn swap_audio(session: State<'_, Shared>, library: State<'_, Library>, id: u32, recording: PathBuf, offset: Option<f64>) -> Result<Part, AppError> {
    media::require_sound(&recording)?;
    media::require_file(&recording)?;
    let (video, dir, open) = {
        let s = session.lock().unwrap();
        (s.project.get(id)?.path.clone(), s.audio_dir(&library, swap::dir())?, s.open_id().map(String::from))
    };
    let trace = format!("part-{id}");
    let made = tauri::async_runtime::spawn_blocking(move || {
        let made = swap::make(&audio::bundled_ffmpeg(), &dir, &video, &recording, offset, &trace);
        if let Err(e) = &made {
            log::error("swap", &trace, e.to_string());
        }
        made
    });
    let swap = made.await.map_err(|e| AppError::Swap(e.to_string()))??;
    let mut s = session.lock().unwrap();
    // Lining up takes seconds: the user may have gone Home meanwhile, and part ids repeat across projects.
    if s.open_id() != open.as_deref() {
        return Err(AppError::NotOpen);
    }
    s.project.set_swap(id, Some(swap))
}

/// "Use camera audio": part `id` plays its video's own sound again (the remux stays cached for ⌘Z).
#[tauri::command]
fn use_camera_audio(session: State<Shared>, id: u32) -> Result<Part, AppError> {
    session.lock().unwrap().project.set_swap(id, None)
}

/// The timeline's waveform for one part, from what it plays (its new sound once swapped).
#[tauri::command]
async fn waveform(session: State<'_, Shared>, id: u32) -> Result<waveform::Waveform, AppError> {
    let path = session.lock().unwrap().project.get(id)?.media().to_path_buf();
    tauri::async_runtime::spawn_blocking(move || waveform::of_file(&audio::bundled_ffmpeg(), &path))
        .await
        .map_err(|e| AppError::Unreadable { file: String::new(), why: e.to_string() })?
}

/// Only when asked (nothing transcribes on load). Reads what the part plays now, so asking again after a swap
/// regenerates the words from the new sound. Downloads the model first if needed. Emits `progress` (see `Progress`).
#[tauri::command]
async fn transcribe_part(app: tauri::AppHandle, session: State<'_, Shared>, id: u32) -> Result<transcribe::Transcript, AppError> {
    let path = session.lock().unwrap().project.get(id)?.media().to_path_buf();
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

/// Home's cards: every saved project, newest use first.
#[tauri::command]
fn list_projects(library: State<Library>) -> Vec<Summary> {
    library.list()
}

/// A project for these videos (or the one already made from the first), now the open one.
#[tauri::command]
fn new_project(session: State<Shared>, library: State<Library>, paths: Vec<PathBuf>) -> Result<Opened, AppError> {
    session.lock().unwrap().new_project(&library, &paths, now_ms())
}

#[tauri::command]
fn open_project(session: State<Shared>, library: State<Library>, id: String) -> Result<Opened, AppError> {
    session.lock().unwrap().open(&library, &id, now_ms())
}

/// The open project, written whole. A thumbnail that needs remaking is made in the background; a failure there is
/// only logged (the card shows its plain tile).
#[tauri::command]
fn save_project(session: State<Shared>, library: State<Library>, id: String, name: String, length: f64, cover: Option<Cover>, ui: serde_json::Value) -> Result<(), AppError> {
    let job = session.lock().unwrap().save(&library, &id, Edit { name, length, cover, ui }, now_ms())?;
    if let Some(job) = job {
        tauri::async_runtime::spawn_blocking(move || {
            if let Err(e) = thumb::make(&audio::bundled_ffmpeg(), &job) {
                log::error("thumb", &id, e.to_string());
            }
        });
    }
    Ok(())
}

/// Going Home: the UI has saved. Previews still rendering stop; a transcription still running finishes unheard.
#[tauri::command]
fn close_project(session: State<Shared>) {
    preview::ticket();
    session.lock().unwrap().close();
}

// Library changes take the session lock too, so two writes of one project.json never interleave.
#[tauri::command]
fn set_locked(session: State<Shared>, library: State<Library>, id: String, locked: bool) -> Result<Summary, AppError> {
    let _one_at_a_time = session.lock().unwrap();
    library.set_locked(&id, locked)
}

#[tauri::command]
fn delete_project(session: State<Shared>, library: State<Library>, id: String) -> Result<(), AppError> {
    let s = session.lock().unwrap();
    library.delete(&id, s.open_id())
}

/// Home's "Delete “name”?" alert, Cancel the default (confirm.rs). True only when Delete was pressed.
/// Async, so the wait runs off the main thread the alert needs.
#[tauri::command]
async fn confirm_delete(app: tauri::AppHandle, title: String, message: String) -> bool {
    use tauri_plugin_dialog::DialogExt;
    let answer = app
        .dialog()
        .message(message)
        .title(title)
        .kind(confirm::KIND)
        .buttons(confirm::buttons())
        .blocking_show_with_result();
    confirm::deletes(&answer)
}

/// Once at start, before the first list: projects unused for 30 days (and not locked) go. How many went.
#[tauri::command]
fn sweep_projects(session: State<Shared>, library: State<Library>) -> u32 {
    let s = session.lock().unwrap();
    library.sweep(now_ms(), s.open_id())
}

/// The web view's own lines in the app's log (src/boot-log.js): which screen launch showed, and any uncaught error,
/// so what the real window did can be read without seeing it.
#[tauri::command]
fn ui_log(error: bool, msg: String) {
    if error {
        log::error("ui", "window", msg)
    } else {
        log::info("ui", "window", msg)
    }
}

/// The update pill's one question per page (updates/): a newer version, or null. Never rejects.
#[tauri::command]
async fn update_check(app: tauri::AppHandle) -> Option<updates::Found> {
    tauri::async_runtime::spawn_blocking(move || updates::check(&app)).await.ok().flatten()
}

/// The pill's click: resolves once the update is installed (joins the background download, retries a failed one).
#[tauri::command]
async fn update_install(app: tauri::AppHandle) -> Result<(), AppError> {
    tauri::async_runtime::spawn_blocking(move || updates::install(&app))
        .await
        .map_err(|e| AppError::Update(e.to_string()))?
}

/// Relaunch into the installed update. The UI saves the project first.
#[tauri::command]
fn update_restart(app: tauri::AppHandle) {
    updates::restart(&app)
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
    let proposal = autocut::run(&claude::locate()?, &parts, &rules::load(&rules::path())?, "cli")?;
    record_magic(&Library::at_home(), &usage::Tracker::at_home(), None, &proposal, "cli");
    Ok(proposal)
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
        [_, "--claude-test"] => print_and_exit(self_test(&Library::at_home(), &usage::Tracker::at_home(), "cli")),
        [_, "--auto-cut", file] => print_and_exit(auto_cut_file(Path::new(file))),
        [_, "--token-usage"] => print_and_exit(usage::Tracker::at_home().report()),
        _ => {}
    }

    preview::clear(&preview::dir());
    swap::clear(&swap::dir());
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Shared::default())
        .manage(Library::at_home())
        .manage(updates::Updates::default())
        .manage(export::Exports::default())
        .manage(usage::Tracker::at_home())
        .setup(|app| {
            updates::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            claude_status, claude_setup, send_debug_report,claude_self_test, auto_cut, get_rules, save_rules, save_learning_log, save_learning_clip,
            add_video, remove_part, swap_audio, use_camera_audio, transcribe_part, waveform, preview, export_video, export_cancel, export_target, export_reveal,
            list_projects, new_project, open_project, save_project, close_project, set_locked, delete_project, confirm_delete, sweep_projects,
            ui_log, update_check, update_install, update_restart, token_usage, token_usage_notes
        ])
        .run(tauri::generate_context!())
        .expect("error while running Magic Cut");
}
