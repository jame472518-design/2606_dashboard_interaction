import { test } from 'node:test';
import assert from 'node:assert';
import { cosine, retrieve } from '../src/retriever.js';

test('cosine 相同向量=1，正交=0', () => {
  assert.ok(Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-9);
  assert.ok(Math.abs(cosine([1, 0], [0, 1])) < 1e-9);
});

test('retrieve 取對應語言的 top-k 並依分數排序', () => {
  const index = [
    { id: 'a', lang: 'zh-TW', vec: [1, 0] },
    { id: 'b', lang: 'zh-TW', vec: [0.8, 0.2] },
    { id: 'c', lang: 'en', vec: [1, 0] },
  ];
  const hits = retrieve(index, [1, 0], { lang: 'zh-TW', k: 2 });
  assert.deepEqual(hits.map(h => h.id), ['a', 'b']);
  assert.ok(hits[0].score >= hits[1].score);
});
