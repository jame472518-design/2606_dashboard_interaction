import { test, after } from 'node:test';
import assert from 'node:assert';
import { createServer } from '../src/server.js';

const server = createServer();
await new Promise(r => server.listen(0, r));
const base = `http://localhost:${server.address().port}`;
after(() => server.close());

test('GET /api/tenants 回傳陣列', async () => {
  const res = await fetch(base + '/api/tenants');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.tenants));
});

test('GET /api/tenant-config 回傳 voice（tenant 覆寫全域）', async () => {
  const res = await fetch(base + '/api/tenant-config?tenant=project1_cute_dragon');
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.voice.pitch, 1.25);        // tenant 覆寫
  assert.equal(data.voice.enabled, true);      // 繼承全域
  assert.equal(data.display_name, '小恐龍樂園');
  assert.equal(data.character.render, 'rig');  // 形象渲染模式（小恐龍用占位 rig）
  assert.equal(data.llm, undefined);           // 不外洩 llm 設定
});

test('GET /api/tenant-config 非法 tenant → 400', async () => {
  const res = await fetch(base + '/api/tenant-config?tenant=../etc');
  assert.equal(res.status, 400);
});

test('POST /api/chat 缺 message → 400', async () => {
  const res = await fetch(base + '/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenant: 'project1_cute_dragon' }),
  });
  assert.equal(res.status, 400);
});
