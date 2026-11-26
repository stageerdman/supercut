//! A project's card picture: one frame of what the cover part plays, at the cover second, 480 px wide, JPEG.
//! Made in the background after a save; a failure is logged and the card shows its plain tile.

use crate::error::AppError;
use std::path::{Path, PathBuf};
use std::process::Command;

pub const WIDTH: u32 = 480;

/// One thumbnail to make.
#[derive(Debug, Clone, PartialEq)]
pub struct Job {
    pub media: PathBuf,
    pub t: f64,
    pub file: PathBuf,
}

fn args(job: &Job, out: &Path) -> Vec<String> {
    let s = |x: &str| x.to_string();
    vec![
        s("-hide_banner"), s("-loglevel"), s("error"), s("-nostdin"), s("-y"),
        s("-ss"), format!("{:.3}", job.t.max(0.0)),
        s("-i"), job.media.display().to_string(),
        s("-frames:v"), s("1"), s("-vf"), format!("scale={WIDTH}:-2"), s("-q:v"), s("4"),
        out.display().to_string(),
    ]
}

/// Writes `job.file` through a temp beside it, so a card never shows half a picture.
pub fn make(ffmpeg: &Path, job: &Job) -> Result<(), AppError> {
    let tmp = job.file.with_extension("tmp.jpg");
    let out = crate::jobs::output(Command::new(ffmpeg).args(args(job, &tmp)))
        .map_err(|e| AppError::FfmpegStart { ffmpeg: ffmpeg.display().to_string(), why: e.to_string() })?;
    // ffmpeg succeeds with no frame when `t` is past the end: no file is a failure too.
    let made = if !out.status.success() {
        Err(AppError::Thumb(String::from_utf8_lossy(&out.stderr).trim().to_string()))
    } else if !tmp.is_file() {
        Err(AppError::Thumb(format!("no frame at {:.3} s of {}", job.t, job.media.display())))
    } else {
        std::fs::rename(&tmp, &job.file).map_err(|e| AppError::Thumb(format!("{}: {e}", job.file.display())))
    };
    if made.is_err() {
        let _ = std::fs::remove_file(&tmp);
    }
    made
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testkit;

    #[test]
    fn a_video_makes_a_jpeg_480_wide() {
        let Some(ff) = testkit::ffmpeg() else { return };
        let d = testkit::temp_dir("thumb");
        let video = d.join("cam.mp4");
        testkit::ffmpeg_ok(&ff, &["-f", "lavfi", "-i", "testsrc=duration=4:size=1280x720:rate=30", "-c:v", "libx264", "-preset", "ultrafast", video.to_str().unwrap()]);
        let job = Job { media: video.clone(), t: 1.5, file: d.join("thumb.jpg") };
        make(&ff, &job).unwrap();
        let jpeg = std::fs::read(&job.file).unwrap();
        assert_eq!(&jpeg[..2], [0xFF, 0xD8], "a JPEG");
        let probe = Command::new(&ff).args(["-hide_banner", "-i"]).arg(&job.file).output().unwrap();
        assert!(String::from_utf8_lossy(&probe.stderr).contains("480x270"), "{}", String::from_utf8_lossy(&probe.stderr));

        let late = Job { t: 60.0, file: d.join("late.jpg"), ..job };
        assert!(matches!(make(&ff, &late), Err(AppError::Thumb(_))));
        assert!(!late.file.exists() && !late.file.with_extension("tmp.jpg").exists(), "nothing left behind");
    }

    #[test]
    fn a_missing_video_fails_without_a_file() {
        let Some(ff) = testkit::ffmpeg() else { return };
        let d = testkit::temp_dir("thumb-missing");
        std::fs::create_dir_all(&d).unwrap();
        let job = Job { media: d.join("gone.mov"), t: 0.0, file: d.join("thumb.jpg") };
        assert!(matches!(make(&ff, &job), Err(AppError::Thumb(_))));
        assert!(!job.file.exists());
    }
}
