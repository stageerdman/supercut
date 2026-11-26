//! The bridge to the user's own Claude Code CLI.
//! `setup` finds it and checks the login, `ask` runs one structured question,
//! `stream` reads its output, `picks` is the keep/drop answer, `self_test` proves it end to end,
//! `terminal` installs it and signs in for the user.

pub mod ask;
pub mod picks;
pub mod self_test;
pub mod setup;
mod stream;
pub mod terminal;

pub use setup::{candidates, find, locate, status, Status};
pub use terminal::open_setup;
