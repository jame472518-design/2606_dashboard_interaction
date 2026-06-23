import { test } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { loadKnowledge } from '../src/knowledge.js';

const DIR = fileURLToPath(new URL('./fixtures/tenants/t_demo', import.meta.url));

test('載入並解析 frontmatter + 內文', async () => {
  const entries = await loadKnowledge(DIR);
  const byId = Object.fromEntries(entries.map(e => [e.id + ':' + e.lang, e]));
  assert.equal(entries.length, 2);
  const h = byId['info-hours:zh-TW'];
  assert.equal(h.type, 'info');
  assert.equal(h.title, '營業時間');
  assert.match(h.text, /09:00/);
  assert.equal(byId['exhibit-001:en'].lang, 'en');
});
