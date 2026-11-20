//! Claude's keep/drop → cuts. The built-in rule lives here, in code: Claude decides how many
//! takes of a re-recorded line stay; which ones is ours — the last.

use super::lines::Line;
use crate::claude::picks::{Dropped, Picks};
use serde::Serialize;

pub const EARLIER_TAKE: &str = "Earlier take; the last take is kept";

/// A proposed cut: words `from..to` of part `part`, `s`–`e` seconds in that part's own time.
#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct Cut {
    pub part: u32,
    pub from: usize,
    pub to: usize,
    pub s: f64,
    pub e: f64,
    pub reason: String,
}

/// In a group where Claude kept some take but not the last one, its latest kept take
/// hands the keep to the last take.
pub fn keep_last_takes(mut picks: Picks, groups: &[Vec<u32>]) -> Picks {
    for group in groups {
        let last = *group.last().expect("groups have two or more takes");
        let Some(&latest_kept) = group.iter().rev().find(|id| picks.keep.contains(id)) else { continue };
        if latest_kept == last {
            continue;
        }
        picks.keep.retain(|&id| id != latest_kept);
        picks.keep.push(last);
        picks.drop.retain(|d| d.id != last);
        picks.drop.push(Dropped { id: latest_kept, reason: EARLIER_TAKE.into() });
    }
    picks
}

/// One cut per dropped line, in line order. Times come from the words, never from Claude.
pub fn cuts(lines: &[Line], dropped: &[Dropped]) -> Vec<Cut> {
    lines
        .iter()
        .filter_map(|l| dropped.iter().find(|d| d.id == l.id).map(|d| (l, d)))
        .map(|(l, d)| Cut { part: l.part, from: l.from, to: l.to, s: l.s, e: l.e, reason: d.reason.clone() })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::super::lines::{sample::part, split};
    use super::*;

    fn picks(keep: &[u32], drop: &[u32]) -> Picks {
        Picks { keep: keep.to_vec(), drop: drop.iter().map(|&id| Dropped { id, reason: "claude".into() }).collect() }
    }

    fn sorted(p: &Picks) -> (Vec<u32>, Vec<u32>) {
        let mut keep = p.keep.clone();
        let mut drop: Vec<u32> = p.drop.iter().map(|d| d.id).collect();
        keep.sort_unstable();
        drop.sort_unstable();
        (keep, drop)
    }

    #[test]
    fn an_earlier_take_kept_over_the_last_is_swapped() {
        let p = keep_last_takes(picks(&[1, 2, 4], &[3]), &[vec![2, 3]]);
        assert_eq!(sorted(&p), (vec![1, 3, 4], vec![2]));
        assert_eq!(p.drop[0].reason, EARLIER_TAKE);
    }

    #[test]
    fn claudes_choice_stands_when_it_kept_the_last_take() {
        assert_eq!(sorted(&keep_last_takes(picks(&[3], &[1, 2]), &[vec![1, 2, 3]])), (vec![3], vec![1, 2]));
    }

    #[test]
    fn claude_may_keep_both_when_they_only_sound_alike() {
        assert_eq!(sorted(&keep_last_takes(picks(&[1, 2], &[]), &[vec![1, 2]])), (vec![1, 2], vec![]));
    }

    #[test]
    fn claude_may_drop_every_take() {
        assert_eq!(sorted(&keep_last_takes(picks(&[], &[1, 2]), &[vec![1, 2]])), (vec![], vec![1, 2]));
    }

    #[test]
    fn of_three_takes_the_latest_kept_one_moves_to_the_last() {
        // Claude kept takes 1 and 2: it wanted two lines; the rule keeps 1 and 3.
        assert_eq!(sorted(&keep_last_takes(picks(&[1, 2], &[3]), &[vec![1, 2, 3]])), (vec![1, 3], vec![2]));
    }

    #[test]
    fn dropped_lines_become_cuts_with_word_ranges_and_times() {
        let lines = split(&[part(1, "Take one. Take two."), part(2, "Bye now.")]);
        let dropped = [Dropped { id: 3, reason: "fumble".into() }, Dropped { id: 1, reason: "earlier take".into() }];
        assert_eq!(
            cuts(&lines, &dropped),
            [
                Cut { part: 1, from: 0, to: 2, s: 0.0, e: 0.9, reason: "earlier take".into() },
                Cut { part: 2, from: 0, to: 2, s: 0.0, e: 0.9, reason: "fumble".into() },
            ]
        );
    }
}
