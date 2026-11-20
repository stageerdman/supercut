# SuperCut — visual system

Small on purpose. Every value in the app comes from this file. Dark only in v1.
The feel: a quiet, dark editing room where the video is the brightest thing on screen and one warm colour means "cut".

## Type — one font
**SF Pro** (system font) only. Times and counters use `.monospacedDigit()` instead of a second font.

| Token | Size / weight | Use |
|---|---|---|
| `title` | 20 / semibold | Empty-state headline |
| `body` | 13 / regular | Labels, buttons, banner, transcript |
| `bodyStrong` | 13 / semibold | Primary button, project name |
| `caption` | 11 / medium | Clip badges, time ruler, hints |

Transcript text uses `body` at 15 / regular with 1.5 line height (reading, not scanning) — the one exception, and only there.

## Colour
| Token | Value | Use |
|---|---|---|
| `bg` | #0E0F11 | Window background, timeline |
| `surface` | #17181B | Toolbar, transport row, panels |
| `raised` | #212328 | Clips, banner, chips, skeletons |
| `hairline` | white 8 % | Dividers, dashed drop zone |
| `text` | #F2F2F3 | Primary text (≈ 17:1 on `bg`) |
| `textSecondary` | #9EA1A8 | Hints, times, secondary labels (≈ 7:1) |
| `accent` | #FF6A3D (warm coral) | Magic button, playhead, selection, AI cuts, focus ring |
| `onAccent` | #0E0F11 | Text on accent (≈ 7:1) — never white on coral |
| `danger` | #FF5A5F | Only for destructive confirmations (rare) |
| `player` | #000000 | Behind the video only |

Rules: accent appears in at most three places at once. User cuts are neutral (`textSecondary` hatch at 35 %); AI cuts are accent hatch at 45 %. No gradients, no shadows except the system window shadow.

Why coral, not CapCut's cyan or OpenCut's blue: our own look, warm against the cool dark, and it reads as "cut" (scissors, red-ish) without being an error red.

## Spacing — 4 pt grid
`4 · 8 · 12 · 16 · 24 · 32 · 48`. Toolbar 52, transport row 40, timeline track 72 tall, clip gap 8, panel padding 16.

## Shape
Radius: `6` (chips, small buttons) · `10` (clips, buttons, banner) · `16` (drop zone). Hairlines 1 pt; dashed drop zone 1.5 pt, dash 6 / gap 6.

## Motion
120 ms ease-out for hover/drag feedback, 180–200 ms ease-in-out for things that move (panels, clip reorder). Nothing bounces. Reduce Motion → cross-fades only.

## Icons
SF Symbols only, `regular` weight, 15 pt in toolbar, 13 pt elsewhere. Magic = `sparkle`. Play = `play.fill` / `pause.fill`.
