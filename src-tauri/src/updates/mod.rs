//! Auto-updates. At launch, then every few hours (sooner after a failed look), the app reads `latest.json` from
//! `plugins.updater.endpoints` (the user's R2 bucket; scripts/release writes it). A newer, correctly signed version
//! downloads and replaces the app in the background at once; the next launch runs it.
//! The toolbar pill (src/ui/update.js) asks `check` once, and its click waits in `install`, which joins the running
//! download (or retries a failed one); `update://progress` events carry the download's running totals.

mod schedule;
mod state;

use crate::error::AppError;
use crate::log;
use schedule::Outcome;
use serde::Serialize;
use state::{Phase, State};
use std::sync::{Condvar, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

pub use state::Found;

const TRACE: &str = "updater";
/// How long `check` waits for a look under way before answering "nothing new".
const CHECK_WAIT: Duration = Duration::from_secs(30);
const INSTALL_WAIT: Duration = Duration::from_secs(60 * 60);
/// Progress events at most once per this many bytes (and at the end).
const PROGRESS_STEP: u64 = 256 * 1024;

#[derive(Default)]
pub struct Updates {
    state: Mutex<State>,
    changed: Condvar,
    /// Held for one look, so the periodic look and a click's retry never download twice.
    looking: Mutex<()>,
}

impl Updates {
    fn change(&self, f: impl FnOnce(&mut State)) {
        f(&mut self.state.lock().unwrap());
        self.changed.notify_all();
    }

    fn wait(&self, timeout: Duration, until: impl Fn(&State) -> bool) -> State {
        let guard = self.state.lock().unwrap();
        self.changed.wait_timeout_while(guard, timeout, |s| !until(s)).unwrap().0.clone()
    }
}

/// Starts the checker on its own thread. Release builds only: a dev binary is not an app bundle to replace.
pub fn start(app: AppHandle) {
    if cfg!(debug_assertions) {
        app.state::<Updates>().change(|s| s.phase = Phase::Idle);
        return;
    }
    std::thread::spawn(move || schedule::run(|| look(&app), std::thread::sleep));
}

/// A newer version, if one is known; waits for a look under way. Blocking.
pub fn check(app: &AppHandle) -> Option<Found> {
    app.state::<Updates>().wait(CHECK_WAIT, |s| s.check_answer().is_some()).check_answer().flatten()
}

/// Resolves once the update is installed. Joins the running download; retries a failed one. Blocking.
pub fn install(app: &AppHandle) -> Result<(), AppError> {
    let updates = app.state::<Updates>();
    if updates.state.lock().unwrap().needs_retry() {
        look(app);
    }
    let s = updates.wait(INSTALL_WAIT, |s| s.install_answer().is_some());
    s.install_answer().unwrap_or_else(|| Err(AppError::Update("the download took over an hour".into())))
}

fn look(app: &AppHandle) -> Outcome {
    let updates = app.state::<Updates>();
    if updates.state.lock().unwrap().phase == Phase::Ready {
        return Outcome::Stop;
    }
    let Ok(_one_look) = updates.looking.try_lock() else {
        return Outcome::Failed; // another look is running; look again later
    };
    updates.change(|s| s.phase = Phase::Checking);
    match tauri::async_runtime::block_on(check_and_install(app, &updates)) {
        Ok(outcome) => outcome,
        Err(tauri_plugin_updater::Error::EmptyEndpoints) => {
            log::info("updates", TRACE, "no update address set (npm run updates:setup); not checking");
            updates.change(|s| s.phase = Phase::Idle);
            Outcome::Stop
        }
        Err(e) => {
            log::error("updates", TRACE, format!("look failed, trying again later: {e}"));
            updates.change(|s| s.failed(e.to_string()));
            Outcome::Failed
        }
    }
}

async fn check_and_install(app: &AppHandle, updates: &Updates) -> Result<Outcome, tauri_plugin_updater::Error> {
    let Some(update) = app.updater()?.check().await? else {
        log::info("updates", TRACE, "up to date");
        updates.change(|s| *s = State { phase: Phase::Idle, found: None });
        return Ok(Outcome::UpToDate);
    };
    let found = Found {
        version: update.version.clone(),
        notes: update.body.clone().unwrap_or_default(),
        date: update.raw_json.get("pub_date").and_then(|d| d.as_str()).map(String::from),
    };
    log::info("updates", TRACE, format!("found {}, downloading", found.version));
    updates.change(|s| *s = State { phase: Phase::Downloading, found: Some(found.clone()) });
    let mut progress = Progress::default();
    update.download_and_install(|chunk, total| progress.add(app, chunk, total), || {}).await?;
    log::info("updates", TRACE, format!("update ready {}", found.version));
    updates.change(|s| s.phase = Phase::Ready);
    Ok(Outcome::Stop)
}

#[derive(Serialize, Clone, Default)]
struct Progress {
    downloaded: u64,
    total: Option<u64>,
    #[serde(skip)]
    emitted: u64,
}

impl Progress {
    fn add(&mut self, app: &AppHandle, chunk: usize, total: Option<u64>) {
        self.downloaded += chunk as u64;
        self.total = total;
        if self.downloaded - self.emitted >= PROGRESS_STEP || total == Some(self.downloaded) {
            self.emitted = self.downloaded;
            let _ = app.emit("update://progress", self.clone());
        }
    }
}
