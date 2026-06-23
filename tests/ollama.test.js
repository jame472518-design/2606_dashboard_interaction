import { test } from 'node:test';
import assert from 'node:assert';
import { embed, chat } from '../src/ollama.js';

const BASE = 'http://localhost:11434';
const up = await fetch(BASE + '/api/tags').then(r => r.ok).catch(() => false);

test('embed 回傳數字向量', { skip: !up && 'Ollama 未啟動' }, async () => {
  const v = await embed('你好', { model: 'nomic-embed-text', baseUrl: BASE });
  assert.ok(Array.isArray(v) && v.length > 10);
  assert.equal(typeof v[0], 'number');
});

test('chat 回傳文字', { skip: !up && 'Ollama 未啟動' }, async () => {
  const r = await chat({
    messages: [{ role: 'user', content: '只回「OK」兩個字。' }],
    model: 'qwen2.5vl:3b', baseUrl: BASE,
  });
  assert.equal(typeof r, 'string');
  assert.ok(r.length > 0);
});
