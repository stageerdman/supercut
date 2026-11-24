//! The preview's plan, pure: which clips make it, how long each is to the frame, where each starts in the preview,
//! and the ffmpeg arguments for a clip and for the join. Every clip has a whole number of frames at `FPS` and the
//! sound of each kept span is cut to that same length, so picture and sound stay in step to the frame however many
//! cuts there are.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

pub const FPS: u32 = 30;
/// The short side of the preview's frame (never upscaled): sharp enough to judge a cut, quick to render.
const SHORT_SIDE: u32 = 720;
/// Bumped when the clip settings change, so an old cached clip is never reused.
const VERSION: u32 = 1;

/// One kept span of a part, in that part's own seconds.
#[derive(Debug, Clone, PartialEq)]
pub struct Span {
    pub part: u32,
    pub path: PathBuf,
    pub s: f64,
    pub e: f64,
}

/// Where a kept span plays in the preview: from `at`, for `e - s` seconds (whole frames).
#[derive(serde::Serialize, Debug, Clone, PartialEq)]
pub struct Placed {
    pub part: u32,
    pub s: f64,
    pub e: f64,
    pub at: f64,
}

/// The preview's frame: the first part's shape, short side at most SHORT_SIDE, even sides (H.264 needs them).
pub fn frame(width: u32, height: u32) -> (u32, u32) {
    let short = width.min(height).max(2);
    let scale = (SHORT_SIDE as f64 / short as f64).min(1.0);
    let even = |x: u32| ((x as f64 * scale / 2.0).round() as u32 * 2).max(2);
    (even(width), even(height))
}

pub fn frames(span: &Span) -> u32 {
    (((span.e - span.s) * FPS as f64).round() as u32).max(1)
}

pub fn seconds(span: &Span) -> f64 {
    frames(span) as f64 / FPS as f64
}

/// The spans laid end to end, each the length its clip really has.
pub fn placed(spans: &[Span]) -> Vec<Placed> {
    let mut at = 0.0;
    spans
        .iter()
        .map(|x| {
            let p = Placed { part: x.part, s: x.s, e: x.s + seconds(x), at };
            at += seconds(x);
            p
        })
        .collect()
}

fn hex(h: impl Hash) -> String {
    let mut hasher = DefaultHasher::new();
    h.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

/// A clip's cache name: the same span at the same frame size is rendered once.
pub fn clip_name(span: &Span, size: (u32, u32)) -> String {
    let ms = (span.s * 1000.0).round() as i64;
    format!("clip-{}.mp4", hex((VERSION, &span.path, ms, frames(span), size)))
}

/// The preview's name: the same edit (the same clips in the same order) is joined once.
pub fn preview_name(spans: &[Span], size: (u32, u32)) -> String {
    let clips: Vec<String> = spans.iter().map(|x| clip_name(x, size)).collect();
    format!("preview-{}.mp4", hex(clips))
}

const QUIET: [&str; 5] = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y"];

/// One kept span, picture only, exactly `frames` frames, boxed into the preview's frame.
pub fn clip_args(span: &Span, size: (u32, u32), out: &Path) -> Vec<String> {
    let (w, h) = size;
    // tpad: a span that runs to the part's very end still gets its last frame (the source may stop a hair short).
    let vf = format!(
        "fps={FPS},scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,tpad=stop_mode=clone:stop_duration=0.2"
    );
    let mut a: Vec<String> = QUIET.map(String::from).to_vec();
    // Several clips render at once (preview/mod.rs): a couple of decoder threads each shares the cores best.
    a.extend(["-threads".into(), "2".into()]);
    a.extend(["-ss".into(), format!("{:.3}", span.s), "-i".into(), span.path.display().to_string(), "-an".into()]);
    a.extend(["-vf".into(), vf, "-frames:v".into(), frames(span).to_string()]);
    a.extend(["-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-g", "30", "-f", "mp4"].map(String::from));
    a.push(out.display().to_string());
    a
}

/// The files the join reads, in order (the concat demuxer's list).
pub fn concat_list(clips: &[PathBuf]) -> String {
    clips.iter().map(|c| format!("file '{}'\n", c.display().to_string().replace('\'', "'\\''"))).collect()
}

/// The sources the sound is cut from, each once, in first-use order.
pub fn sources(spans: &[Span]) -> Vec<PathBuf> {
    let mut out: Vec<PathBuf> = Vec::new();
    for x in spans {
        if !out.contains(&x.path) {
            out.push(x.path.clone());
        }
    }
    out
}

/// The sound: every kept span cut from its source (input 1 + its index in `sources`) to its clip's exact length,
/// padded with silence if the source ends early, then joined in order.
pub fn sound_graph(spans: &[Span]) -> String {
    let srcs = sources(spans);
    let mut g = String::new();
    for (k, src) in srcs.iter().enumerate() {
        let uses: Vec<usize> = (0..spans.len()).filter(|&j| &spans[j].path == src).collect();
        let outs: String = uses.iter().map(|j| format!("[u{j}]")).collect();
        g += &format!("[{}:a]aresample=48000,aformat=channel_layouts=stereo,asplit={}{outs};", k + 1, uses.len());
    }
    for (j, x) in spans.iter().enumerate() {
        let d = seconds(x);
        g += &format!("[u{j}]atrim=start={:.6}:duration={d:.6},asetpts=PTS-STARTPTS,apad=whole_dur={d:.6}[a{j}];", x.s);
    }
    let all: String = (0..spans.len()).map(|j| format!("[a{j}]")).collect();
    g + &format!("{all}concat=n={}:v=0:a=1[a]", spans.len())
}

/// The join: the clips' picture copied as is (no re-encode), the sound from `graph_file`, into `out`.
pub fn join_args(list: &Path, spans: &[Span], graph_file: &Path, out: &Path) -> Vec<String> {
    let mut a: Vec<String> = QUIET.map(String::from).to_vec();
    a.extend(["-f", "concat", "-safe", "0", "-i"].map(String::from));
    a.push(list.display().to_string());
    for src in sources(spans) {
        a.extend(["-i".into(), src.display().to_string()]);
    }
    a.extend(["-filter_complex_script".into(), graph_file.display().to_string()]);
    a.extend(["-map", "0:v", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-f", "mp4"].map(String::from));
    a.push(out.display().to_string());
    a
}

#[cfg(test)]
mod tests {
    use super::*;

    fn span(part: u32, path: &str, s: f64, e: f64) -> Span {
        Span { part, path: PathBuf::from(path), s, e }
    }

    #[test]
    fn spans_are_whole_frames_laid_end_to_end() {
        let spans = [span(1, "/a.mov", 0.0, 2.01), span(1, "/a.mov", 3.0, 3.5), span(2, "/b.mov", 1.0, 1.01)];
        assert_eq!(spans.iter().map(frames).collect::<Vec<_>>(), [60, 15, 1], "a hair of a span is still one frame");
        let p = placed(&spans);
        assert_eq!(p[0], Placed { part: 1, s: 0.0, e: 2.0, at: 0.0 });
        assert_eq!(p[1].at, 2.0);
        assert!((p[2].at - 2.5).abs() < 1e-9 && (p[2].e - (1.0 + 1.0 / 30.0)).abs() < 1e-9);
    }

    #[test]
    fn the_frame_keeps_the_shape_short_side_720_even_never_upscaled() {
        assert_eq!(frame(1920, 1080), (1280, 720));
        assert_eq!(frame(1080, 1920), (720, 1280));
        assert_eq!(frame(3840, 2160), (1280, 720));
        assert_eq!(frame(640, 360), (640, 360));
        assert_eq!(frame(641, 361), (642, 362));
    }

    #[test]
    fn a_clip_name_changes_with_the_span_and_the_frame_only() {
        let a = span(1, "/a.mov", 1.0, 2.0);
        assert_eq!(clip_name(&a, (1280, 720)), clip_name(&span(9, "/a.mov", 1.0, 2.0), (1280, 720)), "the part id is not in it");
        assert_ne!(clip_name(&a, (1280, 720)), clip_name(&span(1, "/a.mov", 1.0, 2.1), (1280, 720)));
        assert_ne!(clip_name(&a, (1280, 720)), clip_name(&a, (640, 360)));
        assert_ne!(preview_name(&[a.clone()], (640, 360)), preview_name(&[a.clone(), a], (640, 360)));
    }

    #[test]
    fn the_sound_cuts_each_span_to_its_clip_length_from_its_own_source() {
        let g = sound_graph(&[span(1, "/a.mov", 0.0, 1.0), span(2, "/b.mov", 0.5, 1.0), span(1, "/a.mov", 2.0, 2.01)]);
        assert!(g.contains("[1:a]aresample=48000,aformat=channel_layouts=stereo,asplit=2[u0][u2];"), "{g}");
        assert!(g.contains("[2:a]aresample=48000,aformat=channel_layouts=stereo,asplit=1[u1];"), "{g}");
        assert!(g.contains("[u2]atrim=start=2.000000:duration=0.033333,asetpts=PTS-STARTPTS,apad=whole_dur=0.033333[a2]"), "{g}");
        assert!(g.ends_with("[a0][a1][a2]concat=n=3:v=0:a=1[a]"), "{g}");
    }

    #[test]
    fn the_join_copies_the_picture_and_lists_each_source_once() {
        let spans = [span(1, "/a.mov", 0.0, 1.0), span(1, "/a.mov", 2.0, 3.0)];
        let s = join_args(Path::new("/c/l.txt"), &spans, Path::new("/c/g.txt"), Path::new("/c/p.mp4")).join(" ");
        assert!(s.contains("-f concat -safe 0 -i /c/l.txt -i /a.mov -filter_complex_script /c/g.txt"), "{s}");
        assert!(s.contains("-c:v copy"), "{s}");
        assert_eq!(concat_list(&[PathBuf::from("/c/it's.mp4")]), "file '/c/it'\\''s.mp4'\n");
    }
}
