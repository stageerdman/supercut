//! A registry of running child processes, by pid, so they can all be killed at once when the app goes.

use std::collections::HashSet;
use std::sync::Mutex;

pub struct Children(Mutex<Option<HashSet<u32>>>);

/// The app's own children: every `Job` that isn't given another registry.
pub static RUNNING: Children = Children::new();

impl Children {
    pub const fn new() -> Self {
        Self(Mutex::new(None))
    }

    fn with<T>(&self, f: impl FnOnce(&mut HashSet<u32>) -> T) -> T {
        // A poisoned lock still holds the right pids: killing them matters more than the panic.
        let mut set = self.0.lock().unwrap_or_else(|e| e.into_inner());
        f(set.get_or_insert_with(HashSet::new))
    }

    pub fn add(&self, pid: u32) {
        self.with(|s| s.insert(pid));
    }

    pub fn remove(&self, pid: u32) {
        self.with(|s| s.remove(&pid));
    }

    #[cfg(test)]
    pub fn count(&self) -> usize {
        self.with(|s| s.len())
    }

    /// Kills every registered child (SIGKILL: ffmpeg must not linger writing a file nobody reads).
    pub fn kill_all(&self) {
        let pids: Vec<u32> = self.with(|s| s.drain().collect());
        super::kill_pids(&pids);
    }
}
