import { test } from 'node:test';
import assert from 'node:assert';
import { buildPrompt, decideGrounded, fallbackReply } from '../src/orchestrator.js';

test('grounding：最高分低於門檻 → 不 grounded', () => {
  assert.equal(decideGrounded([{ score: 0.2 }], 0.35), false);
  assert.equal(decideGrounded([{ score: 0.5 }], 0.35), true);
  assert.equal(decideGrounded([], 0.35), false);
});

test('buildPrompt 含人設、ip_rules、檢索內容、使用者問題', () => {
  const msgs = buildPrompt({
    persona: '你是小恐龍。', ipRules: ['自稱固定用「小恐龍」'],
    contexts: [{ title: '營業時間', text: '09:00–18:00' }],
    history: [{ role: 'user', content: '嗨' }, { role: 'assistant', content: '哈囉' }],
    userText: '幾點開門？', lang: 'zh-TW',
  });
  const sys = msgs[0].content;
  assert.equal(msgs[0].role, 'system');
  assert.match(sys, /小恐龍/);
  assert.match(sys, /自稱固定用/);
  assert.match(sys, /09:00–18:00/);
  assert.equal(msgs.at(-1).content, '幾點開門？');
  assert.equal(msgs.length, 1 + 2 + 1);
});

test('fallbackReply 依語言回不同句', () => {
  assert.match(fallbackReply('zh-TW'), /服務台|不太確定/);
  assert.match(fallbackReply('en'), /front desk|not sure/i);
});
