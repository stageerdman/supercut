//! Keeps the Mac from idle-sleeping during a long job (like Pensieve's caffeinate).
//! `-w <pid>` makes caffeinate quit by itself if we crash.

use std::process::{Child, Command};

pub struct KeepAwake(Option<Child>);

impl KeepAwake {
    pub fn start() -> Self {
        let pid = std::process::id().to_string();
        Self(Command::new("/usr/bin/caffeinate").args(["-i", "-w", &pid]).spawn().ok())
    }
}

impl Drop for KeepAwake {
    fn drop(&mut self) {
        if let Some(child) = self.0.as_mut() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
