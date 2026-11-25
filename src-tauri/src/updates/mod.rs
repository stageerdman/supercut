//! Auto-updates. At launch, then every few hours (sooner after a failed look), the app reads `latest.json` from
//! `plugins.updater.endpoints` (the user's R2 bucket; scripts/release writes it). A newer, correctly signed version
//! downloads and replaces the app in the background; the next launch runs it. The UI hears every change as an
//! `update-status` event and may offer `restart_to_update` once it is `ready`.

mod schedule;

use crate::log;
use schedule::Outcome;
use serde::Serialize;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

const TRACE: &str = "updater";

#[derive(Serialize, Clone, Debug, PartialEq, Default)]
#[serde(tag = "state", rename_all = "lowercase")]
pub enum Status {
    #[default]
    Idle,
    Downloading { version: String },
    /// Installed; runs from the next launch.
    Ready { version: String, notes: Option<String> },
}

/// The app's update status, shared by the checker thread and the commands.
#[derive(Default)]
pub struct Updates(Mutex<Status>);

impl Updates {
    pub fn status(&self) -> Status {
        self.0.lock().unwrap().clone()
    }
}

/// Starts the checker on its own thread. Release builds only: a dev binary is not an app bundle to replace.
pub fn start(app: AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    std::thread::spawn(move || schedule::run(|| look(&app), std::thread::sleep));
}

fn look(app: &AppHandle) -> Outcome {
    match tauri::async_runtime::block_on(check_and_install(app)) {
        Ok(outcome) => outcome,
        Err(tauri_plugin_updater::Error::EmptyEndpoints) => {
            log::info("updates", TRACE, "no update address set (npm run updates:setup); not checking");
            Outcome::Stop
        }
        Err(e) => {
            log::error("updates", TRACE, format!("check failed, trying again later: {e}"));
            set(app, Status::Idle);
            Outcome::Failed
        }
    }
}

async fn check_and_install(app: &AppHandle) -> Result<Outcome, tauri_plugin_updater::Error> {
    let Some(update) = app.updater()?.check().await? else {
        log::info("updates", TRACE, "up to date");
        return Ok(Outcome::UpToDate);
    };
    let version = update.version.clone();
    log::info("updates", TRACE, format!("found {version}, downloading"));
    set(app, Status::Downloading { version: version.clone() });
    update.download_and_install(|_, _| {}, || {}).await?;
    log::info("updates", TRACE, format!("update ready {version}"));
    set(app, Status::Ready { version, notes: update.body.clone() });
    Ok(Outcome::Stop)
}

fn set(app: &AppHandle, status: Status) {
    *app.state::<Updates>().0.lock().unwrap() = status.clone();
    let _ = app.emit("update-status", status);
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The UI reads these shapes (`update-status` events, `update_status`); keep them stable.
    #[test]
    fn status_serializes_with_a_state_tag() {
        let ready = Status::Ready { version: "0.1.1".into(), notes: Some("Faster cuts".into()) };
        assert_eq!(serde_json::to_value(Status::Idle).unwrap(), serde_json::json!({ "state": "idle" }));
        assert_eq!(
            serde_json::to_value(ready).unwrap(),
            serde_json::json!({ "state": "ready", "version": "0.1.1", "notes": "Faster cuts" })
        );
    }
}
