//! The export's plan, pure: the source's frame grid read from ffmpeg's report, each kept span snapped to it, the
//! ffmpeg arguments of a span's segment (picture only, exactly its frames, top quality) and of the join (picture
//! copied, sound cut fresh and faded at every join), and the progress lines ffmpeg writes.
//! Why each rule: updates/2026-11-25 EXPORT - OPEN/update v1.md.

use crate::preview::plan::{cut_sound, sources, Cut, QUIET};
pub use crate::preview::Span;
use std::path::Path;

/// Each side of every join fades over this long: no click where two waves meet, too short to hear as a dip.
pub const FADE: f64 = 0.005;

/// What the export is written as (the UI's `format`).
#[derive(serde::Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Format {
    /// H.264 at CRF 14, AAC 320 kb/s: visually lossless, plays everywhere.
    Mp4,
    /// ProRes 422 HQ, PCM 24-bit: for handing on to another editor.
    Prores,
}

impl Format {
    pub fn ext(self) -> &'static str {
        match self {
            Self::Mp4 => "mp4",
            Self::Prores => "mov",
        }
    }

    fn muxer(self) -> &'static str {
        match self {
            Self::Mp4 => "mp4",
            Self::Prores => "mov",
        }
    }

    fn pixels(self) -> &'static str {
        match self {
            Self::Mp4 => "yuv420p",
            Self::Prores => "yuv422p10le",
        }
    }

    fn picture(self) -> &'static [&'static str] {
        match self {
            Self::Mp4 => &["-c:v", "libx264", "-preset", "slow", "-crf", "14", "-profile:v", "high"],
            Self::Prores => &["-c:v", "prores_ks", "-profile:v", "3", "-vendor", "apl0"],
        }
    }

    fn sound(self) -> &'static [&'static str] {
        match self {
            Self::Mp4 => &["-c:a", "aac", "-b:a", "320k", "-movflags", "+faststart"],
            Self::Prores => &["-c:a", "pcm_s24le"],
        }
    }
}

/// Does `out` carry the format's extension (any case)?
pub fn fits(out: &Path, format: Format) -> bool {
    out.extension().is_some_and(|e| e.eq_ignore_ascii_case(format.ext()))
}

/// A frame rate as ffmpeg wants it: 30000/1001, not 29.97.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rate {
    pub num: u32,
    pub den: u32,
}

impl Rate {
    pub fn fps(self) -> f64 {
        self.num as f64 / self.den as f64
    }

    pub fn arg(self) -> String {
        format!("{}/{}", self.num, self.den)
    }

    /// ffmpeg's rounded figure back to its exact rate: 29.97 is 30000/1001, 25 is 25/1.
    fn from_report(x: f64) -> Option<Rate> {
        if !(x > 0.0 && x < 1000.0) {
            return None;
        }
        let ntsc = x * 1.001;
        if (x - x.round()).abs() > 0.001 && (ntsc - ntsc.round()).abs() < 0.01 {
            return Some(Rate { num: ntsc.round() as u32 * 1000, den: 1001 });
        }
        if (x - x.round()).abs() < 0.001 {
            return Some(Rate { num: x.round() as u32, den: 1 });
        }
        Some(Rate { num: (x * 1000.0).round() as u32, den: 1000 })
    }
}

/// The export's frame: the first part's picture as it plays (turned upright) and its frame rate.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Shape {
    pub width: u32,
    pub height: u32,
    pub rate: Rate,
}

/// Reads the first video stream from ffmpeg's report (its stderr from `ffmpeg -i file`).
pub fn shape(report: &str) -> Option<Shape> {
    let lines: Vec<&str> = report.lines().collect();
    let at = lines.iter().position(|l| l.trim_start().starts_with("Stream #") && l.contains(": Video:"))?;
    let fields: Vec<&str> = lines[at].split(',').map(str::trim).collect();
    let (w, h) = fields.iter().find_map(|f| size(f.split_whitespace().next()?))?;
    let number_before = |unit: &str| fields.iter().find_map(|f| f.strip_suffix(unit)?.trim().parse::<f64>().ok());
    let rate = Rate::from_report(number_before(" fps").or_else(|| number_before(" tbr"))?)?;
    let turned = lines[at + 1..].iter().take_while(|l| !l.trim_start().starts_with("Stream #")).any(|l| quarter_turn(l));
    let (width, height) = if turned { (h, w) } else { (w, h) };
    Some(Shape { width, height, rate })
}

fn size(token: &str) -> Option<(u32, u32)> {
    let (w, h) = token.split_once('x')?;
    Some((w.parse().ok()?, h.parse().ok()?))
}

/// "displaymatrix: rotation of -90.00 degrees": a phone held upright; ffmpeg turns it when decoding.
fn quarter_turn(line: &str) -> bool {
    let Some((_, rest)) = line.split_once("rotation of ") else { return false };
    let deg: f64 = rest.split_whitespace().next().and_then(|x| x.parse().ok()).unwrap_or(0.0);
    (deg.abs().round() as i64) % 180 == 90
}

/// The span's first frame on the export's grid: the frame nearest its start.
pub fn first(span: &Span, rate: Rate) -> u64 {
    (span.s.max(0.0) * rate.fps()).round() as u64
}

/// How many frames the span keeps: up to the frame nearest its end, at least one. An edge at time t lands on the
/// same frame whichever span it belongs to.
pub fn frames(span: &Span, rate: Rate) -> u64 {
    ((span.e * rate.fps()).round() as u64).saturating_sub(first(span, rate)).max(1)
}

pub fn total_frames(spans: &[Span], rate: Rate) -> u64 {
    spans.iter().map(|x| frames(x, rate)).sum()
}

/// Frames as seconds, exact on the grid.
pub fn seconds(frames: u64, rate: Rate) -> f64 {
    frames as f64 * rate.den as f64 / rate.num as f64
}

/// One kept span, picture only, exactly its frames from its first one, fitted into the export's frame.
/// Progress goes to stdout (`frame=N` lines, see `progress_frame`).
pub fn segment_args(span: &Span, shape: Shape, format: Format, out: &Path) -> Vec<String> {
    let Shape { width: w, height: h, rate } = shape;
    // A quarter frame early: an accurate seek keeps the frame at k/fps and drops k-1, whatever the float rounding.
    let seek = (first(span, rate) as f64 - 0.25).max(0.0) / rate.fps();
    // tpad: a span that runs to the part's very end still gets its last frame (the source may stop a hair short).
    let vf = format!(
        "fps={},scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1,format={},tpad=stop_mode=clone:stop_duration=0.5",
        rate.arg(),
        format.pixels()
    );
    let mut a: Vec<String> = QUIET.map(String::from).to_vec();
    a.extend(["-nostats", "-progress", "pipe:1"].map(String::from));
    a.extend(["-ss".into(), format!("{seek:.6}"), "-i".into(), span.path.display().to_string(), "-an".into()]);
    a.extend(["-vf".into(), vf, "-frames:v".into(), frames(span, rate).to_string()]);
    a.extend(format.picture().iter().map(|x| x.to_string()));
    a.extend(["-f".into(), format.muxer().into(), out.display().to_string()]);
    a
}

/// The sound under the export: each span cut from its part's sound to exactly its segment's length from the same
/// first frame, faded at both sides.
pub fn sound_graph(spans: &[Span], rate: Rate) -> String {
    let cuts: Vec<Cut> = spans
        .iter()
        .map(|x| Cut { path: &x.path, start: seconds(first(x, rate), rate), seconds: seconds(frames(x, rate), rate) })
        .collect();
    cut_sound(&cuts, FADE)
}

/// The join: the segments' picture copied as is (no second encode), the sound from `graph_file`, into `out`.
pub fn join_args(list: &Path, spans: &[Span], graph_file: &Path, format: Format, out: &Path) -> Vec<String> {
    let mut a: Vec<String> = QUIET.map(String::from).to_vec();
    a.extend(["-f", "concat", "-safe", "0", "-i"].map(String::from));
    a.push(list.display().to_string());
    for src in sources(spans) {
        a.extend(["-i".into(), src.display().to_string()]);
    }
    a.extend(["-filter_complex_script".into(), graph_file.display().to_string()]);
    a.extend(["-map", "0:v", "-map", "[a]", "-c:v", "copy"].map(String::from));
    a.extend(format.sound().iter().map(|x| x.to_string()));
    a.extend(["-f".into(), format.muxer().into(), out.display().to_string()]);
    a
}

/// The frames done so far, from one line of ffmpeg's `-progress` output.
pub fn progress_frame(line: &str) -> Option<u64> {
    line.trim().strip_prefix("frame=")?.trim().parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    const NTSC: Rate = Rate { num: 30000, den: 1001 };
    const THIRTY: Rate = Rate { num: 30, den: 1 };

    fn span(path: &str, s: f64, e: f64) -> Span {
        Span { part: 1, path: PathBuf::from(path), s, e }
    }

    fn shape30() -> Shape {
        Shape { width: 1920, height: 1080, rate: THIRTY }
    }

    #[test]
    fn spans_snap_to_the_nearest_frames_and_shared_edges_meet() {
        let a = span("/a.mov", 0.99, 2.01);
        assert_eq!((first(&a, THIRTY), frames(&a, THIRTY)), (30, 30));
        assert_eq!(frames(&span("/a.mov", 1.0, 1.001), THIRTY), 1, "a hair of a span is still one frame");
        let (x, y) = (span("/a.mov", 0.0, 1.017), span("/a.mov", 1.017, 2.0));
        assert_eq!(first(&x, THIRTY) + frames(&x, THIRTY), first(&y, THIRTY), "no frame lost or doubled at the edge");
        assert_eq!(total_frames(&[x, y], THIRTY), 60);
        assert_eq!(frames(&span("/a.mov", 0.0, 10.0), NTSC), 300);
        assert!((seconds(300, NTSC) - 10.01).abs() < 1e-9);
    }

    #[test]
    fn the_shape_is_read_from_ffmpegs_report_upright_at_its_exact_rate() {
        let video = "  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709), 1920x1080 [SAR 1:1 DAR 16:9], 15000 kb/s, 29.97 fps, 29.97 tbr, 30k tbn (default)";
        let report = format!("Input #0, mov, from 'a.mov':\n  Duration: 00:00:10.01, start: 0.000000\n{video}\n  Stream #0:1[0x2](und): Audio: aac (LC), 48000 Hz, stereo");
        assert_eq!(shape(&report), Some(Shape { width: 1920, height: 1080, rate: NTSC }));
        let phone = format!("{video}\n      Side data:\n        displaymatrix: rotation of -90.00 degrees\n  Stream #0:1: Audio: aac");
        assert_eq!(shape(&phone).map(|s| (s.width, s.height)), Some((1080, 1920)));
        let later_turn = format!("{video}\n  Stream #0:1: Audio: aac\n      displaymatrix: rotation of -90.00 degrees");
        assert_eq!(shape(&later_turn).map(|s| s.width), Some(1920), "only the video stream's own side data counts");
        let tbr_only = "  Stream #0:0: Video: h264, yuv420p, 640x360, 25 tbr, 12800 tbn";
        assert_eq!(shape(tbr_only), Some(Shape { width: 640, height: 360, rate: Rate { num: 25, den: 1 } }));
        assert_eq!(shape("  Stream #0:0: Video: h264, yuv420p, 640x360, 23.98 fps").unwrap().rate, Rate { num: 24000, den: 1001 });
        assert_eq!(shape("  Stream #0:0: Audio: aac, 48000 Hz"), None);
    }

    #[test]
    fn a_segment_seeks_a_quarter_frame_early_and_keeps_exactly_its_frames() {
        let a = span("/a.mov", 1.0, 2.0);
        let s = segment_args(&a, shape30(), Format::Mp4, Path::new("/t/0.mp4")).join(" ");
        assert!(s.contains("-progress pipe:1 -ss 0.991667 -i /a.mov -an"), "{s}");
        assert!(s.contains("-vf fps=30/1,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:"), "{s}");
        assert!(s.contains("format=yuv420p,") && s.contains("-frames:v 30 "), "{s}");
        assert!(s.ends_with("-c:v libx264 -preset slow -crf 14 -profile:v high -f mp4 /t/0.mp4"), "{s}");
        let start = segment_args(&span("/a.mov", 0.0, 1.0), shape30(), Format::Mp4, Path::new("/t/0.mp4")).join(" ");
        assert!(start.contains("-ss 0.000000 "), "{start}");
    }

    #[test]
    fn prores_is_422_hq_10_bit_in_a_mov_with_pcm_sound() {
        let a = span("/a.mov", 1.0, 2.0);
        let s = segment_args(&a, shape30(), Format::Prores, Path::new("/t/0.mov")).join(" ");
        assert!(s.contains("format=yuv422p10le,") && s.ends_with("-c:v prores_ks -profile:v 3 -vendor apl0 -f mov /t/0.mov"), "{s}");
        let j = join_args(Path::new("/t/l.txt"), &[a], Path::new("/t/g.txt"), Format::Prores, Path::new("/o.mov")).join(" ");
        assert!(j.ends_with("-c:v copy -c:a pcm_s24le -f mov /o.mov"), "{j}");
        assert!(fits(Path::new("/x/Talk.MOV"), Format::Prores) && !fits(Path::new("/x/Talk.mp4"), Format::Prores));
        assert!(fits(Path::new("/x/Talk.mp4"), Format::Mp4) && !fits(Path::new("/x/Talk"), Format::Mp4));
    }

    #[test]
    fn the_join_copies_the_picture_and_cuts_the_sound_from_each_source_once() {
        let spans = [span("/a.mov", 0.0, 1.0), span("/b.mov", 0.5, 1.0), span("/a.mov", 2.0, 3.0)];
        let j = join_args(Path::new("/t/l.txt"), &spans, Path::new("/t/g.txt"), Format::Mp4, Path::new("/o.mp4")).join(" ");
        assert!(j.contains("-f concat -safe 0 -i /t/l.txt -i /a.mov -i /b.mov -filter_complex_script /t/g.txt"), "{j}");
        assert!(j.ends_with("-map 0:v -map [a] -c:v copy -c:a aac -b:a 320k -movflags +faststart -f mp4 /o.mp4"), "{j}");
    }

    #[test]
    fn the_sound_starts_on_each_spans_first_frame_runs_its_length_and_fades_at_both_sides() {
        let g = sound_graph(&[span("/a.mov", 0.99, 2.01), span("/b.mov", 0.0, 0.5)], THIRTY);
        assert!(g.contains("[1:a]aresample=48000,aformat=channel_layouts=stereo,asplit=1[u0];"), "{g}");
        assert!(g.contains("[u0]atrim=start=1.000000:duration=1.000000,asetpts=PTS-STARTPTS,apad=whole_dur=1.000000,afade=t=in:d=0.005000,afade=t=out:st=0.995000:d=0.005000[a0];"), "{g}");
        assert!(g.contains("[u1]atrim=start=0.000000:duration=0.500000,"), "{g}");
        assert!(g.ends_with("[a0][a1]concat=n=2:v=0:a=1[a]"), "{g}");
    }

    #[test]
    fn progress_lines_give_the_frames_done() {
        assert_eq!(progress_frame("frame=42"), Some(42));
        assert_eq!(progress_frame("frame=  7\n"), Some(7));
        assert_eq!(progress_frame("fps=30.0"), None);
        assert_eq!(progress_frame("progress=end"), None);
    }
}
