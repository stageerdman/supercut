//! Words → lines: the unit a take is made of. A line ends at a sentence mark or where the
//! speaker paused, so a false start ("So today I want to, um…" + pause) is a line of its own.

use crate::words::Word;
use serde::Deserialize;

/// A pause this long ends a line even without punctuation.
const PAUSE_S: f64 = 1.0;

/// One part's transcript, as the UI sends it.
#[derive(Deserialize, Debug, Clone)]
pub struct PartWords {
    pub id: u32,
    pub words: Vec<Word>,
}

/// Words `from..to` of part `part`. Ids run 1, 2, … across all parts in play order.
#[derive(Debug, Clone, PartialEq)]
pub struct Line {
    pub id: u32,
    pub part: u32,
    pub from: usize,
    pub to: usize,
    pub text: String,
    pub s: f64,
    pub e: f64,
}

pub fn split(parts: &[PartWords]) -> Vec<Line> {
    let mut lines = Vec::new();
    for part in parts {
        let mut from = 0;
        for (i, word) in part.words.iter().enumerate() {
            let next = part.words.get(i + 1);
            if next.map_or(true, |n| ends_line(word, n)) {
                lines.push(line(lines.len() as u32 + 1, part, from, i + 1));
                from = i + 1;
            }
        }
    }
    lines
}

fn ends_line(word: &Word, next: &Word) -> bool {
    word.w.ends_with(['.', '?', '!']) || next.s - word.e >= PAUSE_S
}

fn line(id: u32, part: &PartWords, from: usize, to: usize) -> Line {
    let words = &part.words[from..to];
    let text = words.iter().map(|w| w.w.as_str()).collect::<Vec<_>>().join(" ");
    Line { id, part: part.id, from, to, text, s: words[0].s, e: words[words.len() - 1].e }
}

#[cfg(test)]
pub mod sample {
    use super::*;

    /// A part from text: one word per 0.5 s; "|" in the text is a 2 s pause.
    pub fn part(id: u32, text: &str) -> PartWords {
        let mut t = 0.0;
        let mut words = Vec::new();
        for w in text.split_whitespace() {
            if w == "|" {
                t += 2.0;
                continue;
            }
            words.push(Word { w: w.into(), s: t, e: t + 0.4 });
            t += 0.5;
        }
        PartWords { id, words }
    }
}

#[cfg(test)]
mod tests {
    use super::sample::part;
    use super::*;

    fn texts(lines: &[Line]) -> Vec<&str> {
        lines.iter().map(|l| l.text.as_str()).collect()
    }

    #[test]
    fn sentence_marks_end_lines() {
        let lines = split(&[part(1, "Hi there. How are you? Great! Bye")]);
        assert_eq!(texts(&lines), ["Hi there.", "How are you?", "Great!", "Bye"]);
    }

    #[test]
    fn a_pause_ends_a_line_without_punctuation() {
        let lines = split(&[part(1, "So today I want, um, | So today I want to show you.")]);
        assert_eq!(texts(&lines), ["So today I want, um,", "So today I want to show you."]);
    }

    #[test]
    fn lines_carry_their_word_range_and_times() {
        let lines = split(&[part(1, "One two. Three four five.")]);
        assert_eq!(lines[1], Line { id: 2, part: 1, from: 2, to: 5, text: "Three four five.".into(), s: 1.0, e: 2.4 });
    }

    #[test]
    fn ids_run_across_parts_and_ranges_restart_per_part() {
        let lines = split(&[part(7, "A b. C d."), part(9, "E f.")]);
        let got: Vec<_> = lines.iter().map(|l| (l.id, l.part, l.from, l.to)).collect();
        assert_eq!(got, [(1, 7, 0, 2), (2, 7, 2, 4), (3, 9, 0, 2)]);
    }

    #[test]
    fn no_words_no_lines() {
        assert!(split(&[part(1, "")]).is_empty());
        assert!(split(&[]).is_empty());
    }
}
