import { test } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from '../src/config.js';

const ROOT = fileURLToPath(new URL('./fixtures/', import.meta.url));

test('tenant 覆寫 llm.model，未覆寫的吃 global', async () => {
  const cfg = await resolveConfig('t_demo', {
    globalPath: fileURLToPath(new URL('./fixtures/global.yaml', import.meta.url)),
    tenantsDir: ROOT + 'tenants',
  });
  assert.equal(cfg.llm.model, 'override-model');
  assert.equal(cfg.llm.base_url, 'http://localhost:11434');
  assert.equal(cfg.display_name, '示範館');
  assert.deepEqual(cfg.languages, ['zh-TW', 'en']);
});
