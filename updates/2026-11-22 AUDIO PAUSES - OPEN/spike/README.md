# Audio pauses spike (throwaway)

From the repo root, after `npm ci && npm run prepare-bins`, a built binary (`npx tauri build --debug --no-bundle`)
and the model (`SUPERCUT_MODEL_DIR=$PWD/models/parakeet-tdt-0.6b-v3-int8 npm run fetch-model`):

```
npm install --prefix "updates/2026-11-22 AUDIO PAUSES - OPEN/spike"
node spike/fetch-vad.js models/vad                       # Silero VAD v5 → models/vad/silero_vad.onnx
node spike/make-audio.js models/pause-test               # generated clips + truth.json
node spike/run.js <bin> <model dir> models/pause-test models/vad/silero_vad.onnx            # compare.js on each
node spike/sweep.js models/pause-test models/vad/silero_vad.onnx                            # energy thresholds
SUPERCUT_BIN=<bin> SUPERCUT_MODEL_DIR=<model dir> node spike/run.js <bin> <model dir> models models/vad/silero_vad.onnx models/<take>.mov
SUPERCUT_BIN=<bin> SUPERCUT_MODEL_DIR=<model dir> node spike/segment.js models/<take>.wav models/vad/silero_vad.onnx 30
QUIET=1 SKIP_ENERGY=1 SILERO_UNHEARD=1 SUPERCUT_BIN=… SUPERCUT_MODEL_DIR=… node spike/inspect.js models/<take>.wav models/<take>.seg30.words.json - models/vad/silero_vad.onnx
```

`compare.js` scores against truth; `inspect.js` (real takes, no truth) shows where the methods disagree and
re-recognizes stretches the transcript missed; `segment.js` transcribes in ≤ N s silence-split pieces.
