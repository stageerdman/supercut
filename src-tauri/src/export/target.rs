//! Where an export goes and what it is called (design/export.md, "Save to"): the folder the recording is in unless
//! the user chose another, `~/Movies` when that one is gone or not writable; the name made from the first part's,
//! never one that exists (`… – cut.mp4`, `… – cut 2.mp4`). Also the folder's free space, for the "Not enough space"
//! check.

use super::plan::Format;
use std::path::{Path, PathBuf};
use std::process::Command;

/// What the Export popover shows before Export is pressed.
#[derive(serde::Serialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Target {
    pub folder: PathBuf,
    pub folder_name: String,
    pub name: String,
    /// Bytes free in `folder` (0 if unknown: the UI then skips the space check).
    pub free: u64,
    pub width: u32,
    pub height: u32,
    pub fps: f64,
}

/// The folder to save in: `wanted` (the user's choice) if it can take a file, else the recording's, else `~/Movies`.
pub fn folder(wanted: Option<&Path>, recording: &Path, movies: &Path) -> PathBuf {
    let beside = recording.parent().unwrap_or(Path::new(""));
    [wanted, Some(beside)].into_iter().flatten().find(|f| writable(f)).map_or_else(|| movies.to_path_buf(), Path::to_path_buf)
}

/// The first free name: `<stem> – cut.<ext>`, then ` – cut 2`, ` – cut 3`…
pub fn name(folder: &Path, recording: &Path, format: Format) -> String {
    let stem = recording.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_else(|| "Magic Cut".into());
    (1..)
        .map(|n| if n == 1 { format!("{stem} – cut.{}", format.ext()) } else { format!("{stem} – cut {n}.{}", format.ext()) })
        .find(|n| !folder.join(n).exists())
        .unwrap()
}

/// Can a file be made in `dir`? Tried for real: permissions alone don't tell (a locked or read-only volume).
pub fn writable(dir: &Path) -> bool {
    if !dir.is_dir() {
        return false;
    }
    let probe = dir.join(format!(".magiccut-{}.probe", std::process::id()));
    let ok = std::fs::write(&probe, b"").is_ok();
    let _ = std::fs::remove_file(&probe);
    ok
}

/// Bytes free on `dir`'s volume, from `df -Pk` (0 if it can't be read).
pub fn free(dir: &Path) -> u64 {
    Command::new("/bin/df").arg("-Pk").arg(dir).output().ok().map_or(0, |o| free_from_df(&String::from_utf8_lossy(&o.stdout)))
}

/// `df -P`'s second line, fourth column (1 K blocks available).
fn free_from_df(report: &str) -> u64 {
    report.lines().nth(1).and_then(|l| l.split_whitespace().nth(3)).and_then(|k| k.parse::<u64>().ok()).map_or(0, |k| k * 1024)
}

/// The folder's name as the popover shows it.
pub fn folder_name(dir: &Path) -> String {
    dir.file_name().map_or_else(|| dir.display().to_string(), |n| n.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(tag: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("magiccut-target-{tag}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn the_name_is_never_one_that_exists() {
        let d = temp("name");
        let rec = d.join("my video.mov");
        assert_eq!(name(&d, &rec, Format::Mp4), "my video – cut.mp4");
        std::fs::write(d.join("my video – cut.mp4"), b"").unwrap();
        assert_eq!(name(&d, &rec, Format::Mp4), "my video – cut 2.mp4");
        assert_eq!(name(&d, &rec, Format::Prores), "my video – cut.mov", "ProRes has its own extension");
        std::fs::write(d.join("my video – cut 2.mp4"), b"").unwrap();
        assert_eq!(name(&d, &rec, Format::Mp4), "my video – cut 3.mp4");
        std::fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn the_folder_is_the_choice_then_the_recordings_then_movies() {
        let (a, b) = (temp("a"), temp("b"));
        let movies = Path::new("/Movies");
        assert_eq!(folder(Some(&a), &b.join("x.mov"), movies), a);
        assert_eq!(folder(None, &b.join("x.mov"), movies), b);
        assert_eq!(folder(Some(Path::new("/gone/away")), &b.join("x.mov"), movies), b, "a chosen folder that's gone");
        assert_eq!(folder(None, Path::new("/gone/away/x.mov"), movies), movies);
        assert!(!writable(Path::new("/System")), "a read-only volume");
        std::fs::remove_dir_all(&a).unwrap();
        std::fs::remove_dir_all(&b).unwrap();
    }

    #[test]
    fn free_space_reads_df() {
        let df = "Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/disk3s5 971350180 500000000 409600 55% /System/Volumes/Data\n";
        assert_eq!(free_from_df(df), 409600 * 1024);
        assert_eq!(free_from_df(""), 0);
        assert!(free(&std::env::temp_dir()) > 0, "the real df answers");
        assert_eq!(folder_name(Path::new("/Users/me/Videos")), "Videos");
    }
}
