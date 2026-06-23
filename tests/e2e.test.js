import { test } from 'node:test';
import assert from 'node:assert';
import { answer } from '../src/orchestrator.js';

const up = await fetch('http://localhost:11434/api/tags').then(r => r.ok).catch(() => false);

test('問營業時間 → grounded 且回答含時間', { skip: !up && 'Ollama 未啟動' }, async () => {
  const r = await answer({ tenantName: 'project1_cute_dragon', message: '你們幾點開門？', lang: 'zh-TW' });
  assert.equal(r.grounded, true);
  assert.match(r.reply, /09|9|九/);   // LLM 可能回阿拉伯數字或中文「九點」
});

test('問無關問題 → 不 grounded，走 fallback', { skip: !up && 'Ollama 未啟動' }, async () => {
  const r = await answer({ tenantName: 'project1_cute_dragon', message: '今天台積電股價多少？', lang: 'zh-TW' });
  assert.equal(r.grounded, false);
  assert.match(r.reply, /服務台|不太確定/);
});
