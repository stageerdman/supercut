//! Which lines are takes of the same line. Two lines match when most of the shorter one's words
//! come back in the same order in the other: that catches a full retake and a false start (the
//! retake begins with it). Only nearby lines are compared: people retake right away.

use super::lines::Line;

/// Share of the shorter line's words, in order, needed to call two lines takes of one line.
const SAME_LINE: f64 = 0.6;
/// One shared word ("the") is never enough.
const MIN_SHARED: usize = 2;
/// How many lines back a retake may start.
const WINDOW: usize = 6;

/// Lower-case words without punctuation: "Today," and "today" are the same word.
pub fn tokens(text: &str) -> Vec<String> {
    text.split_whitespace()
        .map(|w| w.chars().filter(|c| c.is_alphanumeric() || *c == '\'').collect::<String>().to_lowercase())
        .filter(|w| !w.is_empty())
        .collect()
}

/// Length of the longest common subsequence of words.
fn shared_in_order(a: &[String], b: &[String]) -> usize {
    let mut row = vec![0; b.len() + 1];
    for x in a {
        let mut diag = 0;
        for (j, y) in b.iter().enumerate() {
            let up = row[j + 1];
            row[j + 1] = if x == y { diag + 1 } else { up.max(row[j]) };
            diag = up;
        }
    }
    row[b.len()]
}

pub fn same_line(a: &[String], b: &[String]) -> bool {
    let shared = shared_in_order(a, b);
    let shorter = a.len().min(b.len());
    shared >= MIN_SHARED && shared as f64 >= SAME_LINE * shorter as f64
}

/// Groups of line ids (two or more, ascending) that are takes of one line, in order of the first take.
/// A line joins the group of the nearest earlier line it matches.
pub fn groups(lines: &[Line]) -> Vec<Vec<u32>> {
    let words: Vec<Vec<String>> = lines.iter().map(|l| tokens(&l.text)).collect();
    let mut group_of: Vec<Option<usize>> = vec![None; lines.len()];
    let mut groups: Vec<Vec<u32>> = Vec::new();
    for j in 0..lines.len() {
        let Some(i) = (j.saturating_sub(WINDOW)..j).rev().find(|&i| same_line(&words[i], &words[j])) else { continue };
        let g = *group_of[i].get_or_insert_with(|| {
            groups.push(vec![lines[i].id]);
            groups.len() - 1
        });
        groups[g].push(lines[j].id);
        group_of[j] = Some(g);
    }
    groups
}

#[cfg(test)]
mod tests {
    use super::super::lines::{sample::part, split};
    use super::*;

    fn groups_in(text: &str) -> Vec<Vec<u32>> {
        groups(&split(&[part(1, text)]))
    }

    #[test]
    fn punctuation_and_case_dont_count() {
        assert_eq!(tokens("So, today I'm — here."), ["so", "today", "i'm", "here"]);
    }

    #[test]
    fn a_full_retake_is_found() {
        assert_eq!(groups_in("Hello there. This is my new video. This is my brand new video. Let's go."), [[2, 3]]);
    }

    #[test]
    fn a_false_start_matches_its_retake() {
        assert_eq!(groups_in("So today I want to, um, | So today I want to show you SuperCut. It is fast."), [[1, 2]]);
    }

    #[test]
    fn three_takes_make_one_group() {
        let text = "Welcome to the show. Welcome to the, uh, | Welcome to the show everyone. Now the news.";
        assert_eq!(groups_in(text), [[1, 2, 3]]);
    }

    #[test]
    fn different_lines_dont_match() {
        let text = "First, open the app and drop your recording in. The transcript shows up on the right. Okay. Okay.";
        assert!(groups_in(text).is_empty(), "one shared word is never enough");
    }

    #[test]
    fn far_apart_lines_are_not_takes() {
        let filler: String = (0..WINDOW).map(|i| format!("Filler line number {i}x here. ")).collect();
        let text = format!("This is the same sentence. {filler}This is the same sentence.");
        // the fillers match each other ("filler line number … here"), but the far pair must not
        assert!(groups_in(&text).iter().all(|g| !g.contains(&1)), "{:?}", groups_in(&text));
    }

    #[test]
    fn retakes_can_cross_parts() {
        let lines = split(&[part(1, "Intro here. The end of part one."), part(2, "The end of part one, again. Bye.")]);
        assert_eq!(groups(&lines), [[2, 3]]);
    }
}
