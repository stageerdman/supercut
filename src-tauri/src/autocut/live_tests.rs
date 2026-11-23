//! Magic on a real recording with re-takes (`npm run sample-retakes`): real Parakeet, and for the
//! last test this Mac's Claude. Skipped when the model, the sample or Claude Code is missing.

use super::lines::{split, Line, PartWords};
use super::similar::groups;
use crate::claude::locate;
use crate::transcribe::{fake::ffmpeg, transcribe_file};
use crate::{parakeet, words::Word};
use std::path::Path;
use std::sync::OnceLock;

/// Each bad take (false start, earlier take, fumble) and words only its last take has.
const RETAKES: [(&str, &str); 3] = [("how to", "five minutes"), ("after a minute", "usually"), ("keeps the", "best one")];
/// Lines said once: they must stay.
const SAID_ONCE: [&str; 4] = ["welcome back", "drop your recording", "press the magic", "thanks for watching"];

fn words() -> Option<&'static Vec<Word>> {
    static WORDS: OnceLock<Option<Vec<Word>>> = OnceLock::new();
    WORDS
        .get_or_init(|| {
            let wav = Path::new(env!("CARGO_MANIFEST_DIR")).join("../models/retakes.wav");
            let model = parakeet::model_dir();
            (parakeet::model_ready(&model) && wav.is_file())
                .then(|| transcribe_file(&model, &ffmpeg(), &wav, "live-autocut", |_, _| {}).unwrap().words)
        })
        .as_ref()
}

fn lines_of(words: &[Word]) -> Vec<Line> {
    let lines = split(&[PartWords { id: 1, words: words.to_vec() }]);
    for l in &lines {
        println!("# {:>2} [{:5.1}–{:5.1}] {}", l.id, l.s, l.e, l.text);
    }
    lines
}

fn has(line: &Line, words: &str) -> bool {
    line.text.to_lowercase().contains(words)
}

/// The bad take and the last take of each re-recorded line.
fn pairs(lines: &[Line]) -> Vec<(u32, u32)> {
    let find = |p: &dyn Fn(&Line) -> bool| lines.iter().find(|l| p(l)).map(|l| l.id).expect("line in transcript");
    RETAKES.iter().map(|(both, last)| (find(&|l| has(l, both) && !has(l, last)), find(&|l| has(l, last)))).collect()
}

#[test]
fn live_repeated_takes_are_found_in_a_real_recording() {
    let Some(words) = words() else { return println!("# skipped: run npm run fetch-model and npm run sample-retakes") };
    let lines = lines_of(words);
    let found = groups(&lines);
    println!("# groups: {found:?}");
    for (bad, last) in pairs(&lines) {
        assert!(found.iter().any(|g| g.ends_with(&[bad, last])), "lines {bad} and {last} grouped: {found:?}");
    }
    let once: Vec<u32> = lines.iter().filter(|l| SAID_ONCE.iter().any(|w| has(l, w))).map(|l| l.id).collect();
    assert!(found.iter().flatten().all(|id| !once.contains(id)), "a line said once was grouped: {found:?}");
}

#[test]
fn live_claude_cuts_the_earlier_takes_and_keeps_the_rest() {
    let Some(words) = words() else { return println!("# skipped: run npm run fetch-model and npm run sample-retakes") };
    let Ok(bin) = locate() else { return println!("# skipped: Claude Code not installed") };
    let lines = lines_of(words);
    let t0 = std::time::Instant::now();
    let proposal = super::run(&bin, &[PartWords { id: 1, words: words.clone() }], &[], "live-autocut").unwrap();
    println!("# claude answered in {:.1} s: {}", t0.elapsed().as_secs_f64(), serde_json::to_string(&proposal).unwrap());
    assert!(proposal.notes.len() <= super::notes::MAX, "Magic's notes are rare");
    let cuts = proposal.cuts;
    let cut = |id: u32| {
        let l = &lines[id as usize - 1];
        cuts.iter().any(|c| c.from == l.from && c.to == l.to)
    };
    for (bad, last) in pairs(&lines) {
        assert!(cut(bad), "bad take {bad} cut");
        assert!(!cut(last), "last take {last} kept");
    }
    for l in lines.iter().filter(|l| SAID_ONCE.iter().any(|w| has(l, w))) {
        assert!(!cut(l.id), "kept line said once: {}", l.text);
    }
    assert!(cuts.iter().all(|c| !c.reason.trim().is_empty() && c.s < c.e), "every cut has a reason and a time span");
}
