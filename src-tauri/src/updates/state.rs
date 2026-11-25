//! What the app knows about updates, and what each question from the UI gets told. Pure: the checker thread changes
//! it, the commands read it.

use crate::error::AppError;
use serde::Serialize;

/// A newer version from the manifest: what `update_check` returns.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Found {
    pub version: String,
    pub notes: String,
    pub date: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Phase {
    /// A look is under way (the first one starts at launch).
    Checking,
    /// Not looking: up to date, offline before anything was found, nowhere to look, or a dev build.
    Idle,
    Downloading,
    /// Installed on disk; the next launch runs it.
    Ready,
    /// The download of `found` failed; a click on the pill tries again.
    Failed(String),
}

#[derive(Clone, Debug, PartialEq)]
pub struct State {
    pub phase: Phase,
    pub found: Option<Found>,
}

impl Default for State {
    fn default() -> Self {
        Self { phase: Phase::Checking, found: None }
    }
}

impl State {
    /// `update_check`'s answer, or None while the look is still running.
    pub fn check_answer(&self) -> Option<Option<Found>> {
        (self.phase != Phase::Checking).then(|| self.found.clone())
    }

    /// `update_install`'s answer, or None while it should keep waiting.
    pub fn install_answer(&self) -> Option<Result<(), AppError>> {
        match (&self.phase, &self.found) {
            (Phase::Ready, _) => Some(Ok(())),
            (Phase::Failed(why), _) => Some(Err(AppError::Update(why.clone()))),
            (Phase::Idle, None) => Some(Err(AppError::NoUpdate)),
            _ => None,
        }
    }

    /// Whether `update_install` must start a look itself: the last download failed, nothing is running.
    pub fn needs_retry(&self) -> bool {
        matches!(self.phase, Phase::Failed(_))
    }

    /// A look ended in an error. With an update already found, the click must hear why; without one, stay quiet.
    pub fn failed(&mut self, why: String) {
        self.phase = if self.found.is_some() { Phase::Failed(why) } else { Phase::Idle };
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn found() -> Found {
        Found { version: "0.1.1".into(), notes: "Faster".into(), date: None }
    }

    #[test]
    fn check_waits_for_the_first_look_then_names_any_newer_version() {
        let mut s = State::default();
        assert_eq!(s.check_answer(), None);
        s.phase = Phase::Idle;
        assert_eq!(s.check_answer(), Some(None));
        s = State { phase: Phase::Downloading, found: Some(found()) };
        assert_eq!(s.check_answer(), Some(Some(found())));
    }

    #[test]
    fn install_joins_a_running_download_and_resolves_once_ready() {
        let mut s = State { phase: Phase::Downloading, found: Some(found()) };
        assert!(s.install_answer().is_none());
        s.phase = Phase::Ready;
        assert_eq!(s.install_answer(), Some(Ok(())));
    }

    #[test]
    fn a_failed_download_rejects_the_waiting_install_and_is_retried_by_the_next() {
        let mut s = State { phase: Phase::Downloading, found: Some(found()) };
        s.failed("offline".into());
        assert_eq!(s.install_answer(), Some(Err(AppError::Update("offline".into()))));
        assert!(s.needs_retry());
    }

    #[test]
    fn offline_before_anything_was_found_is_quiet() {
        let mut s = State::default();
        s.failed("offline".into());
        assert_eq!(s.phase, Phase::Idle);
        assert_eq!(s.check_answer(), Some(None));
        assert_eq!(s.install_answer(), Some(Err(AppError::NoUpdate)));
    }
}
