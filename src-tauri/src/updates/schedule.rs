//! When to look for an update next. Pure, so the policy is tested without a network or a clock.

use std::time::Duration;

/// How one look for an update ended.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Outcome {
    /// The manifest says this is the newest version.
    UpToDate,
    /// Offline, the server down, a bad download: try again soon.
    Failed,
    /// Nothing more to do this run: an update is installed (the next launch runs it) or there is nowhere to look.
    Stop,
}

pub const AFTER_UP_TO_DATE: Duration = Duration::from_secs(6 * 60 * 60);
pub const AFTER_FAILED: Duration = Duration::from_secs(15 * 60);

pub fn next_check(outcome: Outcome) -> Option<Duration> {
    match outcome {
        Outcome::UpToDate => Some(AFTER_UP_TO_DATE),
        Outcome::Failed => Some(AFTER_FAILED),
        Outcome::Stop => None,
    }
}

/// Looks now, then again after each wait, until a look says stop.
pub fn run(mut look: impl FnMut() -> Outcome, mut wait: impl FnMut(Duration)) {
    while let Some(pause) = next_check(look()) {
        wait(pause);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn looks_at_once_retries_soon_when_offline_and_stops_once_installed() {
        let mut outcomes = vec![Outcome::Failed, Outcome::UpToDate, Outcome::Stop].into_iter();
        let mut waits = Vec::new();
        run(|| outcomes.next().unwrap(), |d| waits.push(d));
        assert_eq!(waits, vec![AFTER_FAILED, AFTER_UP_TO_DATE]);
    }

    #[test]
    fn nowhere_to_look_never_waits() {
        let mut looks = 0;
        run(|| { looks += 1; Outcome::Stop }, |_| panic!("waited"));
        assert_eq!(looks, 1);
    }
}
