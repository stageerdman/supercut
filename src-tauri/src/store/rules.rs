//! The library's rules, without I/O (design/project-store.md "The rules"). Times are ms since the epoch.

use super::doc::ProjectFile;
use std::hash::{BuildHasher, Hasher};
use std::path::Path;

/// Thirty days unused, then a project deletes itself.
pub const KEEP_MS: u64 = 30 * 24 * 60 * 60 * 1000;

/// When an unused project goes; never while locked.
pub fn deletes_at(used_at: u64, locked: bool) -> Option<u64> {
    (!locked).then(|| used_at.saturating_add(KEEP_MS))
}

/// Is it time for the sweep to delete it? Never the open project.
pub fn expired(id: &str, used_at: u64, locked: bool, now: u64, open: Option<&str>) -> bool {
    open != Some(id) && deletes_at(used_at, locked).is_some_and(|at| at <= now)
}

/// The project was started from this video: dropping it again reopens the project instead of making a twin.
pub fn same_video(project: &ProjectFile, path: &Path) -> bool {
    project.parts.first().is_some_and(|p| p.path == path)
}

const BASE32: &[u8; 32] = b"abcdefghijklmnopqrstuvwxyz234567";

/// 12 random base32 characters (60 bits): unique without a counter, and ids.rs-plain.
pub fn new_id() -> String {
    // RandomState is seeded from the OS; the clock separates two ids made by one seed.
    let mut h = std::collections::hash_map::RandomState::new().build_hasher();
    h.write_u128(std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_nanos());
    let bits = h.finish();
    (0..12).map(|i| BASE32[(bits >> (i * 5) & 31) as usize] as char).collect()
}

/// Now, in ms since the epoch.
pub fn now_ms() -> u64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_millis() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::project::Part;

    #[test]
    fn a_project_goes_30_days_after_its_last_use_unless_locked() {
        assert_eq!(deletes_at(1_000, false), Some(1_000 + KEEP_MS));
        assert_eq!(deletes_at(1_000, true), None);
    }

    #[test]
    fn expiry_is_due_at_exactly_30_days_never_locked_never_open() {
        let used = 5_000;
        assert!(!expired("a", used, false, used + KEEP_MS - 1, None), "a millisecond early");
        assert!(expired("a", used, false, used + KEEP_MS, None), "exactly 30 days");
        assert!(!expired("a", used, true, used + 10 * KEEP_MS, None), "locked");
        assert!(!expired("a", used, false, used + 10 * KEEP_MS, Some("a")), "the open one");
        assert!(expired("a", used, false, used + KEEP_MS, Some("b")), "another one is open");
    }

    #[test]
    fn the_same_video_is_its_first_part() {
        let part = |id, path: &str| Part { id, path: path.into(), name: String::new(), swap: None };
        let p = ProjectFile { parts: vec![part(1, "/v/a.mov"), part(2, "/v/b.mov")], ..ProjectFile::new("x".into(), 0) };
        assert!(same_video(&p, Path::new("/v/a.mov")));
        assert!(!same_video(&p, Path::new("/v/b.mov")), "only the first part counts");
        assert!(!same_video(&ProjectFile::new("y".into(), 0), Path::new("/v/a.mov")), "no parts");
    }

    #[test]
    fn new_ids_are_plain_and_differ() {
        let (a, b) = (new_id(), new_id());
        assert!(a.len() == 12 && crate::ids::is_plain(&a), "{a}");
        assert_ne!(a, b);
    }
}
