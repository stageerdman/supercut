const test = require('node:test');
const assert = require('node:assert');
const { mergeTokens } = require('../src/core/words');

test('merges sub-word tokens into words with start/end', () => {
  const words = mergeTokens({
    tokens: [' Hel', 'lo', ' world', '.'],
    timestamps: [0.0, 0.16, 0.48, 0.8],
    durations: [0.16, 0.16, 0.32, 0.08],
  });
  assert.deepStrictEqual(words, [
    { text: 'Hello', start: 0, end: 0.32 },
    { text: 'world.', start: 0.48, end: 0.88 },
  ]);
});

test('without durations a word ends where the next token starts', () => {
  const words = mergeTokens({ tokens: ['▁a', '▁b'], timestamps: [1, 2] });
  assert.deepStrictEqual(words, [{ text: 'a', start: 1, end: 2 }, { text: 'b', start: 2, end: 2 }]);
});

test('empty input gives no words', () => {
  assert.deepStrictEqual(mergeTokens({}), []);
});
