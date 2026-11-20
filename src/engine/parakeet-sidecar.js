// Parakeet sidecar: a separate process so a long transcription never blocks the app.
// Usage: node parakeet-sidecar.js <modelDir> <file.wav>  -> prints one JSON line.
const path = require('node:path');
const sherpa = require('sherpa-onnx-node');

const [modelDir, wavPath] = process.argv.slice(2);
const m = (f) => path.join(modelDir, f);

const recognizer = new sherpa.OfflineRecognizer({
  featConfig: { sampleRate: 16000, featureDim: 80 },
  modelConfig: {
    transducer: { encoder: m('encoder.int8.onnx'), decoder: m('decoder.int8.onnx'), joiner: m('joiner.int8.onnx') },
    tokens: m('tokens.txt'),
    modelType: 'nemo_transducer',
    numThreads: 4,
    provider: 'cpu',
    debug: 0,
  },
});

// false: Electron's V8 memory cage forbids external buffers.
const wave = sherpa.readWave(wavPath, false);
const stream = recognizer.createStream();
stream.acceptWaveform({ sampleRate: wave.sampleRate, samples: wave.samples });
recognizer.decode(stream);
const r = recognizer.getResult(stream);
process.stdout.write(JSON.stringify({ text: r.text, tokens: r.tokens, timestamps: r.timestamps, durations: r.durations }) + '\n');
