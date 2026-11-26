//! Where Magic Cut keeps its own files on this Mac.

use std::path::{Path, PathBuf};

/// The user's home folder ($HOME).
pub fn home() -> PathBuf {
    PathBuf::from(std::env::var_os("HOME").unwrap_or_default())
}

/// `~/Library/Application Support/xyz.supercut.editor/<sub>`: what the app keeps (projects, rules, logs…).
pub fn data(sub: impl AsRef<Path>) -> PathBuf {
    home().join("Library/Application Support/xyz.supercut.editor").join(sub)
}
