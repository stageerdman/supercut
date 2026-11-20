# INIT — decisions & lessons

Durable knowledge from this update. Status lives in `update v1.md`.

## Lessons
- **One screen that changes state beats many screens.** The empty state is the onboarding; panels appear only when they have content (no empty transcript panel before Phase 3). (Jony, `design/main-screen.md`)
- **Exactly one filled button at a time,** and it moves with the journey: Choose Video → Magic → Review → Export.
- **Removed parts stay visible** (collapsed hatched slivers; grey = yours, coral = AI). Trust comes from seeing what was cut.
- **No signing budget shapes distribution:** ad-hoc sign (`codesign -s -`) or Apple Silicon calls the download "damaged"; on macOS 15+ right-click → Open no longer works, so first launch goes through Privacy & Security → Open Anyway. No Sparkle auto-update either.
- **Merge waits:** Magic can be queued during transcription, and the Claude sign-in check runs at load, so the user waits once and learns about problems while there's time to fix them.
