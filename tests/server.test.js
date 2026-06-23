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

test('POST /api/chat 缺 message → 400', async () => {
  const res = await fetch(base + '/api/chat', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tenant: 'project1_cute_dragon' }),
  });
  assert.equal(res.status, 400);
});
