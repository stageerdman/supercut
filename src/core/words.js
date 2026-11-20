// Merge Parakeet sub-word tokens into words with start/end times (seconds).
// A token that starts with a space or "▁" begins a new word.
function mergeTokens({ tokens = [], timestamps = [], durations = [] }) {
  const words = [];
  tokens.forEach((tok, i) => {
    const start = timestamps[i];
    const end = durations[i] != null ? start + durations[i] : (timestamps[i + 1] ?? start);
    const startsWord = /^[\s▁]/.test(tok) || words.length === 0;
    const text = tok.replace(/^[\s▁]+/, '');
    if (startsWord) {
      if (text) words.push({ text, start, end });
    } else {
      const last = words[words.length - 1];
      last.text += text;
      last.end = end;
    }
  });
  return words.map((w) => ({ ...w, start: round(w.start), end: round(w.end) }));
}

const round = (s) => Math.round(s * 1000) / 1000;

module.exports = { mergeTokens };
