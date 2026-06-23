import { test } from 'node:test';
import assert from 'node:assert';
import { rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex } from '../src/indexer.js';

const DIR = fileURLToPath(new URL('./fixtures/tenants/t_demo', import.meta.url));
const up = await fetch('http://localhost:11434/api/tags').then(r => r.ok).catch(() => false);

test('buildIndex 產生 vectors.json，每條含 vec', { skip: !up && 'Ollama 未啟動' }, async () => {
  await rm(path.join(DIR, 'index'), { recursive: true, force: true });
  const res = await buildIndex(DIR, { model: 'nomic-embed-text', baseUrl: 'http://localhost:11434' });
  assert.equal(res.count, 2);
  const idx = JSON.parse(await readFile(path.join(DIR, 'index', 'vectors.json'), 'utf8'));
  assert.equal(idx.length, 2);
  assert.ok(Array.isArray(idx[0].vec) && idx[0].vec.length > 10);
});
