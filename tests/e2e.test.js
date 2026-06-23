import { test } from 'node:test';
import assert from 'node:assert';
import { answer } from '../src/orchestrator.js';

const up = await fetch('http://localhost:11434/api/tags').then(r => r.ok).catch(() => false);

test('問營業時間 → grounded 且回答含時間', { skip: !up && 'Ollama 未啟動' }, async () => {
  const r = await answer({ tenantName: 'project1_cute_dragon', message: '你們幾點開門？', lang: 'zh-TW' });
  assert.equal(r.grounded, true);
  assert.match(r.reply, /09|9|九/);   // LLM 可能回阿拉伯數字或中文「九點」
});

test('問無關問題 → 不 grounded（不編造），但仍給友善回應', { skip: !up && 'Ollama 未啟動' }, async () => {
  const r = await answer({ tenantName: 'project1_cute_dragon', message: '今天台積電股價多少？', lang: 'zh-TW' });
  assert.equal(r.grounded, false);          // 沒命中知識
  assert.ok(r.reply && r.reply.length > 0); // 但小恐龍仍會回應（寒暄/引導），不是空
  assert.deepEqual(r.sources, []);
});

test('寒暄/自我介紹 → 不 grounded，但小恐龍用人設回應', { skip: !up && 'Ollama 未啟動' }, async () => {
  const r = await answer({ tenantName: 'project1_cute_dragon', message: '你好，你是誰？', lang: 'zh-TW' });
  assert.equal(r.grounded, false);
  assert.ok(r.reply && r.reply.length > 0);
});
