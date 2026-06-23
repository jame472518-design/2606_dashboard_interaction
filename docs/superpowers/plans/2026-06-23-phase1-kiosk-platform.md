# Phase 1 多租戶 RAG Kiosk 平台 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在本機（Windows、Node.js、現有 Ollama）做出一個多租戶、可抽換、RAG-grounded 的文字導覽 kiosk，第一個租戶是小恐龍，開發完成後改設定即可移植到 Halo。

**Architecture:** 純 Node.js（ESM）後端：設定載入（global + tenant 覆寫）→ 知識庫載入（Markdown + frontmatter）→ Ollama 產生 embedding 建本地向量索引（JSON）→ 查詢時做 cosine 檢索 top-k → 組 prompt（人設 + ip_rules + 檢索內容 + 短期記憶）→ 呼叫 Ollama chat → grounding 不足則回 fallback。HTTP server 提供 `/api/tenants`、`/api/chat` 與靜態前端（hub 首頁切換 / single 鎖定）。模型與路徑全寫在設定檔，移植 Halo 只改 `config/global.yaml`。

**Tech Stack:** Node.js 24 (ESM)、內建 `node:http`、內建 `node:test`、`fetch`（呼叫 Ollama HTTP API）、`js-yaml`（唯一外部相依，解析 YAML 設定與 frontmatter）。對話模型 `qwen2.5vl:3b`、embedding `nomic-embed-text`（皆 Ollama 本機）。

**慣例：** 平台程式碼在 repo 根目錄；租戶資料在 `tenants/<name>/`；每個 task 結束 commit；測試以 `node --test` 跑；純函式單元測試不需 Ollama，Ollama client 與 e2e 為整合測試（需本機 Ollama 在跑）。

---

### Task 0: 專案骨架與相依

**Files:**
- Create: `package.json`
- Create: `config/global.yaml`
- Create: `tests/.gitkeep`

- [ ] **Step 1: 建立 package.json**

```json
{
  "name": "halo-ip-platform",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "start": "node src/server.js",
    "index": "node src/indexer.js",
    "test": "node --test"
  },
  "dependencies": {
    "js-yaml": "^4.1.0"
  }
}
```

- [ ] **Step 2: 安裝相依**

Run: `npm install`
Expected: 建立 `node_modules/`、`package-lock.json`，無錯誤。（`node_modules/` 已被 `.gitignore` 排除）

- [ ] **Step 3: 建立全域設定 config/global.yaml**

```yaml
# 平台預設；移植 Halo 只改這裡
mode: hub                 # hub=首頁可切換 / single=鎖定一個租戶
active_tenant: project1_cute_dragon   # single 模式時生效
llm:
  provider: ollama
  model: qwen2.5vl:3b     # 開發用現有模型；Halo 改 qwen2.5:14b
  base_url: http://localhost:11434
embedding:
  model: nomic-embed-text # 開發用；Halo 改 bge-m3
server:
  port: 8080
  default_lang: zh-TW
retrieval:
  top_k: 4
  min_score: 0.35         # 低於此視為「沒命中」→ grounding fallback
```

- [ ] **Step 4: 建立 tests 佔位並 commit**

```bash
mkdir -p tests && touch tests/.gitkeep
git add package.json package-lock.json config/global.yaml tests/.gitkeep
git commit -m "chore: scaffold node platform + global config"
```

---

### Task 1: 設定載入（global + tenant 覆寫合併）

**Files:**
- Create: `src/config.js`
- Test: `tests/config.test.js`
- Create (fixture): `tests/fixtures/tenants/t_demo/tenant.yaml`

- [ ] **Step 1: 建立測試 fixture**

`tests/fixtures/tenants/t_demo/tenant.yaml`:
```yaml
display_name: "示範館"
persona_file: persona/guide.md
languages: [zh-TW, en]
llm:
  model: override-model
```

- [ ] **Step 2: 寫失敗測試 tests/config.test.js**

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { resolveConfig } from '../src/config.js';

const ROOT = new URL('./fixtures/', import.meta.url).pathname;

test('tenant 覆寫 llm.model，未覆寫的吃 global', async () => {
  const cfg = await resolveConfig('t_demo', {
    globalPath: new URL('./fixtures/global.yaml', import.meta.url).pathname,
    tenantsDir: ROOT + 'tenants',
  });
  assert.equal(cfg.llm.model, 'override-model');       // tenant 覆寫
  assert.equal(cfg.llm.base_url, 'http://localhost:11434'); // global 保留
  assert.equal(cfg.display_name, '示範館');
  assert.deepEqual(cfg.languages, ['zh-TW', 'en']);
});
```

- [ ] **Step 3: 建立 fixture global**

`tests/fixtures/global.yaml`:
```yaml
mode: hub
llm: { provider: ollama, model: base-model, base_url: http://localhost:11434 }
embedding: { model: nomic-embed-text }
server: { port: 8080, default_lang: zh-TW }
retrieval: { top_k: 4, min_score: 0.35 }
```

- [ ] **Step 4: 跑測試確認失敗**

Run: `node --test tests/config.test.js`
Expected: FAIL（`resolveConfig` 尚未定義 / 模組找不到）

- [ ] **Step 5: 實作 src/config.js**

```js
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);

async function readYaml(p) {
  return yaml.load(await readFile(p, 'utf8')) ?? {};
}

// 淺層合併，但對 llm/embedding/server/retrieval 物件做一層深合併
function merge(base, over) {
  const out = { ...base, ...over };
  for (const k of ['llm', 'embedding', 'server', 'retrieval', 'ui']) {
    if (base[k] || over[k]) out[k] = { ...(base[k] || {}), ...(over[k] || {}) };
  }
  return out;
}

export async function resolveConfig(tenantName, opts = {}) {
  const globalPath = opts.globalPath || path.join(REPO, 'config', 'global.yaml');
  const tenantsDir = opts.tenantsDir || path.join(REPO, 'tenants');
  const global = await readYaml(globalPath);
  const tenant = await readYaml(path.join(tenantsDir, tenantName, 'tenant.yaml'));
  const cfg = merge(global, tenant);
  cfg.tenantName = tenantName;
  cfg.tenantDir = path.join(tenantsDir, tenantName);
  return cfg;
}

export async function loadGlobal(opts = {}) {
  return readYaml(opts.globalPath || path.join(REPO, 'config', 'global.yaml'));
}
```

- [ ] **Step 6: 跑測試確認通過**

Run: `node --test tests/config.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/config.js tests/config.test.js tests/fixtures
git commit -m "feat: config loader with global+tenant merge"
```

---

### Task 2: 知識庫載入（Markdown + frontmatter）

**Files:**
- Create: `src/knowledge.js`
- Test: `tests/knowledge.test.js`
- Create (fixture): `tests/fixtures/tenants/t_demo/knowledge/info-hours.md`, `.../exhibit-001.en.md`

- [ ] **Step 1: 建立兩個 fixture 知識條目**

`tests/fixtures/tenants/t_demo/knowledge/info-hours.md`:
```markdown
---
id: info-hours
type: info
title: 營業時間
lang: zh-TW
tags: [時間, 開放]
---
本館每日 09:00–18:00 開放，最後入場 17:30。
```

`tests/fixtures/tenants/t_demo/knowledge/exhibit-001.en.md`:
```markdown
---
id: exhibit-001
type: exhibit
title: Deep Sea Zone
lang: en
---
The deep sea zone shows glowing creatures.
```

- [ ] **Step 2: 寫失敗測試 tests/knowledge.test.js**

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { loadKnowledge } from '../src/knowledge.js';

const DIR = new URL('./fixtures/tenants/t_demo', import.meta.url).pathname;

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
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `node --test tests/knowledge.test.js`
Expected: FAIL（`loadKnowledge` 未定義）

- [ ] **Step 4: 實作 src/knowledge.js**

```js
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

// 解析 ---frontmatter--- 與內文
export function parseFrontmatter(raw) {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw.trim() };
  return { meta: yaml.load(m[1]) ?? {}, body: m[2].trim() };
}

export async function loadKnowledge(tenantDir) {
  const kdir = path.join(tenantDir, 'knowledge');
  let files = [];
  try { files = (await readdir(kdir)).filter(f => f.endsWith('.md')); }
  catch { return []; }
  const out = [];
  for (const f of files) {
    const { meta, body } = parseFrontmatter(await readFile(path.join(kdir, f), 'utf8'));
    out.push({
      id: meta.id || f.replace(/\.md$/, ''),
      type: meta.type || 'info',
      title: meta.title || '',
      lang: meta.lang || 'zh-TW',
      tags: meta.tags || [],
      zone: meta.zone || null,
      text: body,
      file: f,
    });
  }
  return out;
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `node --test tests/knowledge.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/knowledge.js tests/knowledge.test.js tests/fixtures
git commit -m "feat: knowledge loader (markdown + frontmatter)"
```

---

### Task 3: Ollama client（embedding + chat）

**Files:**
- Create: `src/ollama.js`
- Test: `tests/ollama.test.js`（整合測試，需本機 Ollama 在跑）

- [ ] **Step 1: 寫整合測試 tests/ollama.test.js**

```js
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
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test tests/ollama.test.js`
Expected: FAIL（`embed`/`chat` 未定義）

- [ ] **Step 3: 實作 src/ollama.js**

```js
export async function embed(text, { model, baseUrl }) {
  const res = await fetch(`${baseUrl}/api/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, prompt: text }),
  });
  if (!res.ok) throw new Error(`embed failed: ${res.status}`);
  const data = await res.json();
  return data.embedding;
}

export async function chat({ messages, model, baseUrl, options }) {
  const res = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false, options: options || {} }),
  });
  if (!res.ok) throw new Error(`chat failed: ${res.status}`);
  const data = await res.json();
  return data.message?.content ?? '';
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test tests/ollama.test.js`
Expected: PASS（Ollama 在跑時）

- [ ] **Step 5: Commit**

```bash
git add src/ollama.js tests/ollama.test.js
git commit -m "feat: ollama client (embeddings + chat)"
```

---

### Task 4: 向量數學與檢索器

**Files:**
- Create: `src/retriever.js`
- Test: `tests/retriever.test.js`

- [ ] **Step 1: 寫失敗測試 tests/retriever.test.js**

```js
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
  assert.deepEqual(hits.map(h => h.id), ['a', 'b']);   // c 被語言過濾掉
  assert.ok(hits[0].score >= hits[1].score);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test tests/retriever.test.js`
Expected: FAIL（未定義）

- [ ] **Step 3: 實作 src/retriever.js**

```js
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function retrieve(index, queryVec, { lang, k = 4 } = {}) {
  return index
    .filter(e => !lang || e.lang === lang)
    .map(e => ({ ...e, score: cosine(queryVec, e.vec) }))
    .sort((x, y) => y.score - x.score)
    .slice(0, k);
}

export async function loadIndex(tenantDir) {
  const p = path.join(tenantDir, 'index', 'vectors.json');
  return JSON.parse(await readFile(p, 'utf8'));
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test tests/retriever.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/retriever.js tests/retriever.test.js
git commit -m "feat: vector cosine retrieval"
```

---

### Task 5: 索引建置 CLI

**Files:**
- Create: `src/indexer.js`
- Test: `tests/indexer.test.js`（整合測試，需 Ollama）

- [ ] **Step 1: 寫整合測試 tests/indexer.test.js**

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { rm, readFile } from 'node:fs/promises';
import path from 'node:path';
import { buildIndex } from '../src/indexer.js';

const DIR = new URL('./fixtures/tenants/t_demo', import.meta.url).pathname;
const up = await fetch('http://localhost:11434/api/tags').then(r => r.ok).catch(() => false);

test('buildIndex 產生 vectors.json，每條含 vec', { skip: !up && 'Ollama 未啟動' }, async () => {
  await rm(path.join(DIR, 'index'), { recursive: true, force: true });
  const res = await buildIndex(DIR, { model: 'nomic-embed-text', baseUrl: 'http://localhost:11434' });
  assert.equal(res.count, 2);
  const idx = JSON.parse(await readFile(path.join(DIR, 'index', 'vectors.json'), 'utf8'));
  assert.equal(idx.length, 2);
  assert.ok(Array.isArray(idx[0].vec) && idx[0].vec.length > 10);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test tests/indexer.test.js`
Expected: FAIL（`buildIndex` 未定義）

- [ ] **Step 3: 實作 src/indexer.js**

```js
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { loadKnowledge } from './knowledge.js';
import { embed } from './ollama.js';
import { resolveConfig } from './config.js';

export async function buildIndex(tenantDir, { model, baseUrl }) {
  const entries = await loadKnowledge(tenantDir);
  const index = [];
  for (const e of entries) {
    const vec = await embed(`${e.title}\n${e.text}`, { model, baseUrl });
    index.push({ id: e.id, lang: e.lang, type: e.type, title: e.title, text: e.text, vec });
  }
  await mkdir(path.join(tenantDir, 'index'), { recursive: true });
  await writeFile(path.join(tenantDir, 'index', 'vectors.json'), JSON.stringify(index));
  return { count: index.length };
}

// CLI: node src/indexer.js <tenantName>
if (import.meta.url === `file://${process.argv[1]}`) {
  const name = process.argv[2];
  if (!name) { console.error('用法: node src/indexer.js <tenantName>'); process.exit(1); }
  const cfg = await resolveConfig(name);
  const res = await buildIndex(cfg.tenantDir, { model: cfg.embedding.model, baseUrl: cfg.llm.base_url });
  console.log(`已索引 ${res.count} 條知識 → ${name}/index/vectors.json`);
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node --test tests/indexer.test.js`
Expected: PASS（Ollama 在跑時）

- [ ] **Step 5: Commit**

```bash
git add src/indexer.js tests/indexer.test.js
git commit -m "feat: index builder CLI (embeddings -> vectors.json)"
```

---

### Task 6: Orchestrator（人設 + 檢索 + grounding + prompt 組裝）

**Files:**
- Create: `src/persona.js`
- Create: `src/orchestrator.js`
- Test: `tests/orchestrator.test.js`

- [ ] **Step 1: 寫失敗測試（純函式：prompt 組裝 + grounding 判斷）tests/orchestrator.test.js**

```js
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
  assert.equal(msgs.length, 1 + 2 + 1); // system + 2 history + user
});

test('fallbackReply 依語言回不同句', () => {
  assert.match(fallbackReply('zh-TW'), /服務台|不太確定/);
  assert.match(fallbackReply('en'), /front desk|not sure/i);
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node --test tests/orchestrator.test.js`
Expected: FAIL（未定義）

- [ ] **Step 3: 實作 src/persona.js**

```js
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseFrontmatter } from './knowledge.js';

// 讀 persona/guide.md → { meta, body }；ip_rules 從 character.yaml（若有）
export async function loadPersona(cfg) {
  const pf = path.join(cfg.tenantDir, cfg.persona_file || 'persona/guide.md');
  const { meta, body } = parseFrontmatter(await readFile(pf, 'utf8'));
  let ipRules = [];
  try {
    const yaml = (await import('js-yaml')).default;
    const charRaw = await readFile(path.join(cfg.tenantDir, 'character', 'character.yaml'), 'utf8');
    ipRules = (yaml.load(charRaw)?.ip_rules) || [];
  } catch { /* character.yaml 可有可無 */ }
  return { meta, body, ipRules };
}
```

- [ ] **Step 4: 實作 src/orchestrator.js**

```js
import { resolveConfig } from './config.js';
import { loadPersona } from './persona.js';
import { loadIndex, retrieve } from './retriever.js';
import { embed, chat } from './ollama.js';

export function decideGrounded(hits, minScore) {
  return hits.length > 0 && hits[0].score >= minScore;
}

export function fallbackReply(lang) {
  return lang === 'en'
    ? "I'm not sure about that — please ask our front desk!"
    : '這我不太確定，可以問問服務台喔！';
}

export function buildPrompt({ persona, ipRules, contexts, history, userText, lang }) {
  const langLine = lang === 'en' ? 'Reply in English.' : '用繁體中文、口語、親切地回答。';
  const ctx = contexts.map((c, i) => `[#${i + 1}] ${c.title}\n${c.text}`).join('\n\n');
  const rules = (ipRules || []).map(r => `- ${r}`).join('\n');
  const system = [
    persona,
    rules && `角色底線：\n${rules}`,
    '只能根據下面「館方資料」回答；資料沒提到的，就說不知道、引導去服務台，絕不杜撰。',
    langLine,
    contexts.length ? `館方資料：\n${ctx}` : '（目前沒有相關館方資料）',
  ].filter(Boolean).join('\n\n');
  return [
    { role: 'system', content: system },
    ...history,
    { role: 'user', content: userText },
  ];
}

// 主入口：回傳 { reply, grounded, sources }
export async function answer({ tenantName, message, history = [], lang }) {
  const cfg = await resolveConfig(tenantName);
  const useLang = lang || cfg.server.default_lang;
  const persona = await loadPersona(cfg);
  const index = await loadIndex(cfg.tenantDir);
  const qvec = await embed(message, { model: cfg.embedding.model, baseUrl: cfg.llm.base_url });
  const hits = retrieve(index, qvec, { lang: useLang, k: cfg.retrieval.top_k });
  const grounded = decideGrounded(hits, cfg.retrieval.min_score);
  if (!grounded) return { reply: fallbackReply(useLang), grounded: false, sources: [] };
  const messages = buildPrompt({
    persona: persona.body, ipRules: persona.ipRules,
    contexts: hits, history: history.slice(-6), userText: message, lang: useLang,
  });
  const reply = await chat({ messages, model: cfg.llm.model, baseUrl: cfg.llm.base_url });
  return { reply, grounded: true, sources: hits.map(h => ({ id: h.id, title: h.title, score: h.score })) };
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `node --test tests/orchestrator.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/persona.js src/orchestrator.js tests/orchestrator.test.js
git commit -m "feat: orchestrator (persona+RAG+grounding prompt)"
```

---

### Task 7: HTTP server 與 API

**Files:**
- Create: `src/server.js`
- Create: `src/tenants.js`
- Test: `tests/server.test.js`

- [ ] **Step 1: 實作 src/tenants.js（列出租戶）**

```js
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import yaml from 'js-yaml';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);

export async function listTenants() {
  const dir = path.join(REPO, 'tenants');
  let names = [];
  try { names = (await readdir(dir, { withFileTypes: true }))
    .filter(d => d.isDirectory() && !d.name.startsWith('_')).map(d => d.name); }
  catch { return []; }
  const out = [];
  for (const name of names) {
    let display = name;
    try { display = yaml.load(await readFile(path.join(dir, name, 'tenant.yaml'), 'utf8'))?.display_name || name; }
    catch { /* ignore */ }
    out.push({ name, display_name: display });
  }
  return out;
}
```

- [ ] **Step 2: 寫整合測試 tests/server.test.js**

```js
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
```

- [ ] **Step 3: 跑測試確認失敗**

Run: `node --test tests/server.test.js`
Expected: FAIL（`createServer` 未定義）

- [ ] **Step 4: 實作 src/server.js**

```js
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { listTenants } from './tenants.js';
import { answer } from './orchestrator.js';
import { loadGlobal } from './config.js';

const REPO = path.resolve(new URL('..', import.meta.url).pathname);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.svg': 'image/svg+xml' };

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'content-type': type });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readBody(req) {
  const chunks = []; for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch { return {}; }
}

// 安全地把 URL 對映到實體檔（限制在 web/ 與 tenants/ 內）
async function serveStatic(res, urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  if (rel === '/') rel = '/web/home/index.html';
  if (rel.startsWith('/chat')) rel = '/web/chat/index.html';
  const full = path.normalize(path.join(REPO, rel));
  if (!full.startsWith(path.join(REPO, 'web')) && !full.startsWith(path.join(REPO, 'tenants'))) {
    return send(res, 403, { error: 'forbidden' });
  }
  try {
    if ((await stat(full)).isDirectory()) return send(res, 404, { error: 'not found' });
    const buf = await readFile(full);
    return send(res, 200, buf, MIME[path.extname(full)] || 'application/octet-stream');
  } catch { return send(res, 404, { error: 'not found' }); }
}

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (req.method === 'GET' && url.pathname === '/api/tenants') {
        const g = await loadGlobal();
        let tenants = await listTenants();
        if (g.mode === 'single' && g.active_tenant) tenants = tenants.filter(t => t.name === g.active_tenant);
        return send(res, 200, { mode: g.mode, active_tenant: g.active_tenant || null, tenants });
      }
      if (req.method === 'POST' && url.pathname === '/api/chat') {
        const { tenant, message, history, lang } = await readBody(req);
        if (!tenant || !message) return send(res, 400, { error: 'tenant 與 message 為必填' });
        const result = await answer({ tenantName: tenant, message, history, lang });
        return send(res, 200, result);
      }
      return serveStatic(res, url.pathname);
    } catch (e) {
      return send(res, 500, { error: String(e?.message || e) });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const g = await loadGlobal();
  const port = g.server?.port || 8080;
  createServer().listen(port, () => console.log(`Kiosk 平台啟動 → http://localhost:${port}  (mode=${g.mode})`));
}
```

- [ ] **Step 5: 跑測試確認通過**

Run: `node --test tests/server.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/server.js src/tenants.js tests/server.test.js
git commit -m "feat: http server with /api/tenants and /api/chat + static"
```

---

### Task 8: 前端（home 首頁切換 + chat 對話頁）

**Files:**
- Create: `web/home/index.html`
- Create: `web/chat/index.html`

- [ ] **Step 1: 建立 web/home/index.html（hub 列出租戶 / single 直接跳）**

```html
<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>互動 IP 平台</title>
<style>body{font-family:"PingFang TC","Microsoft JhengHei",sans-serif;background:#FBF3E2;color:#3b4a36;
text-align:center;padding:8vh 20px}h1{color:#4f8a45}.grid{display:flex;gap:18px;justify-content:center;flex-wrap:wrap;margin-top:30px}
a.card{display:block;background:#fff;border-radius:18px;padding:26px 34px;text-decoration:none;color:#3b4a36;
font-weight:800;font-size:1.3rem;box-shadow:0 8px 22px rgba(0,0,0,.08)}</style></head>
<body><h1>互動 IP 平台</h1><p>選擇一個角色開始</p><div class="grid" id="grid">載入中…</div>
<script>
fetch('/api/tenants').then(r=>r.json()).then(d=>{
  if(d.mode==='single' && d.active_tenant){ location.href='/chat?tenant='+encodeURIComponent(d.active_tenant); return; }
  document.getElementById('grid').innerHTML = d.tenants.map(t=>
    `<a class="card" href="/chat?tenant=${encodeURIComponent(t.name)}">${t.display_name}</a>`).join('') || '尚無租戶';
});
</script></body></html>
```

- [ ] **Step 2: 建立 web/chat/index.html（對話頁，可收縮雙狀態、雙語、串接 /api/chat）**

```html
<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0"><title>對話</title>
<style>
:root{--green:#7CB36A;--green-dark:#4f8a45;--cream:#FBF3E2}
*{box-sizing:border-box;margin:0;padding:0}html,body{height:100%}
body{font-family:"PingFang TC","Microsoft JhengHei",sans-serif;color:#3b4a36;
background:radial-gradient(120% 80% at 50% 0%,#fffaf0,#efe2c6);display:flex;flex-direction:column;height:100vh}
.top{display:flex;justify-content:space-between;align-items:center;padding:16px 22px}
.lang button{border:0;background:#fff;font-weight:800;padding:7px 14px;border-radius:999px;cursor:pointer;margin-left:6px}
.lang button.on{background:var(--green);color:#fff}
.char{flex:1;display:grid;place-items:center}.char img{max-height:42vh}
#log{max-height:34vh;overflow:auto;padding:0 22px;display:flex;flex-direction:column;gap:8px}
.msg{padding:10px 14px;border-radius:14px;max-width:72%;font-size:1.05rem}
.me{align-self:flex-end;background:var(--green);color:#fff}.bot{align-self:flex-start;background:#fff}
.bar{display:flex;gap:8px;padding:14px 22px}.bar input{flex:1;padding:14px;border:2px solid #d8c9a6;border-radius:14px;font-size:1.05rem}
.bar button{border:0;background:var(--green);color:#fff;font-weight:800;padding:0 22px;border-radius:14px;cursor:pointer}
.quick{display:flex;gap:8px;flex-wrap:wrap;padding:0 22px 6px}.quick button{border:0;background:#fff;border-radius:999px;padding:8px 14px;cursor:pointer;font-weight:700}
</style></head>
<body>
<div class="top"><b id="title"></b><div class="lang"><button id="zh" class="on">中文</button><button id="en">EN</button></div></div>
<div class="char"><img id="portrait" alt="" onerror="this.style.display='none'"></div>
<div id="log"></div>
<div class="quick" id="quick"></div>
<div class="bar"><input id="inp" placeholder="點我打字…"><button id="send">送出</button></div>
<script>
const tenant=new URLSearchParams(location.search).get('tenant');
let lang='zh-TW', history=[];
const $=id=>document.getElementById(id);
$('portrait').src = `/tenants/${tenant}/character/portrait/idle.png`;
$('title').textContent = tenant || '';
const QUICK={ 'zh-TW':['營業時間','票價','推薦動線'], 'en':['Hours','Tickets','Suggested route'] };
function renderQuick(){ $('quick').innerHTML = QUICK[lang].map(q=>`<button>${q}</button>`).join('');
  [...$('quick').children].forEach(b=>b.onclick=()=>{ $('inp').value=b.textContent; sendMsg(); }); }
function setLang(l){ lang=l; $('zh').classList.toggle('on',l==='zh-TW'); $('en').classList.toggle('on',l==='en');
  $('inp').placeholder = l==='en'?'Tap to type…':'點我打字…'; renderQuick(); }
$('zh').onclick=()=>setLang('zh-TW'); $('en').onclick=()=>setLang('en');
function add(role,text){ const d=document.createElement('div'); d.className='msg '+(role==='user'?'me':'bot');
  d.textContent=text; $('log').appendChild(d); $('log').scrollTop=$('log').scrollHeight; }
async function sendMsg(){ const text=$('inp').value.trim(); if(!text) return; $('inp').value='';
  add('user',text); history.push({role:'user',content:text});
  const res=await fetch('/api/chat',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({tenant,message:text,history,lang})}).then(r=>r.json());
  add('assistant',res.reply); history.push({role:'assistant',content:res.reply}); }
$('send').onclick=sendMsg; $('inp').addEventListener('keydown',e=>{ if(e.key==='Enter') sendMsg(); });
setLang('zh-TW');
</script></body></html>
```

- [ ] **Step 3: 啟動 server 手動驗證**

Run: `npm start`（另一個終端機）
然後 `curl -s http://localhost:8080/api/tenants`
Expected: 回傳 JSON，`tenants` 含 `project1_cute_dragon`（Task 9 建立後）。瀏覽器開 `http://localhost:8080` 應見首頁。

- [ ] **Step 4: Commit**

```bash
git add web/home/index.html web/chat/index.html
git commit -m "feat: home (tenant switch) + chat page (bilingual, RAG chat)"
```

---

### Task 9: 第一個租戶 project1_cute_dragon（內容 + 索引 + e2e）

**Files:**
- Create: `tenants/project1_cute_dragon/tenant.yaml`
- Create: `tenants/project1_cute_dragon/persona/guide.md`
- Create: `tenants/project1_cute_dragon/character/character.yaml`
- Create: `tenants/project1_cute_dragon/knowledge/info-hours.md`、`info-tickets.md`、`exhibit-dino.md`（+ 對應 `.en.md`）
- Copy: 從 `PORJECT/project1_cute_dragon/character/portrait/idle.png` 複製到 `tenants/project1_cute_dragon/character/portrait/idle.png`

- [ ] **Step 1: 建立 tenant.yaml**

```yaml
display_name: "小恐龍樂園"
persona_file: persona/guide.md
languages: [zh-TW, en]
ui:
  default_view: showcase
  voice_first: false
```

- [ ] **Step 2: 建立 persona/guide.md**

```markdown
---
name_zh: 小恐龍
name_en: Dino
voice: 親切、口語、適合小朋友
languages: [zh-TW, en]
---
你是「小恐龍」，小恐龍樂園的 AI 導覽夥伴，個性友善活潑、喜歡跟小朋友聊天。
講話簡短、用字淺白、帶點童趣。一次講一個重點，別長篇大論。
```

- [ ] **Step 3: 建立 character/character.yaml**

```yaml
name_zh: 小恐龍
brand:
  primary_color: "#7CB36A"
  accent_color:  "#FFD23F"
ip_rules:
  - 自稱固定用「小恐龍」，不可改名
  - 面對小朋友要溫和、不嚇人
```

- [ ] **Step 4: 建立知識條目（中英各一組）**

`knowledge/info-hours.md`:
```markdown
---
id: info-hours
type: info
title: 營業時間
lang: zh-TW
tags: [時間]
---
小恐龍樂園每日 09:00–18:00 開放，最後入場 17:30，週三公休。
```

`knowledge/info-hours.en.md`:
```markdown
---
id: info-hours
type: info
title: Opening Hours
lang: en
---
Little Dino Land opens daily 09:00–18:00, last entry 17:30, closed on Wednesdays.
```

`knowledge/info-tickets.md`:
```markdown
---
id: info-tickets
type: info
title: 票價
lang: zh-TW
tags: [票價, 門票]
---
全票 350 元，兒童票（3–12 歲）250 元，3 歲以下免費。
```

`knowledge/info-tickets.en.md`:
```markdown
---
id: info-tickets
type: info
title: Tickets
lang: en
---
Adult 350, child (3–12) 250, under 3 free.
```

`knowledge/exhibit-dino.md`:
```markdown
---
id: exhibit-dino
type: exhibit
title: 暴龍互動區
lang: zh-TW
zone: 1F
tags: [暴龍, 互動]
---
暴龍互動區在 1 樓，有等比例的暴龍模型，每整點會「吼叫」一次，小朋友可以拍照。
```

`knowledge/exhibit-dino.en.md`:
```markdown
---
id: exhibit-dino
type: exhibit
title: T-Rex Interactive Zone
lang: en
zone: 1F
---
The T-Rex zone on 1F has a life-size T-Rex that roars on every hour. Great for photos.
```

- [ ] **Step 5: 複製小恐龍頭像**

```bash
mkdir -p tenants/project1_cute_dragon/character/portrait
cp PORJECT/project1_cute_dragon/character/portrait/idle.png tenants/project1_cute_dragon/character/portrait/idle.png
```

- [ ] **Step 6: 建立索引**

Run: `node src/indexer.js project1_cute_dragon`
Expected: 印出「已索引 6 條知識 → project1_cute_dragon/index/vectors.json」

- [ ] **Step 7: 寫 e2e 整合測試 tests/e2e.test.js**

```js
import { test } from 'node:test';
import assert from 'node:assert';
import { answer } from '../src/orchestrator.js';

const up = await fetch('http://localhost:11434/api/tags').then(r => r.ok).catch(() => false);

test('問營業時間 → grounded 且回答含時間', { skip: !up && 'Ollama 未啟動' }, async () => {
  const r = await answer({ tenantName: 'project1_cute_dragon', message: '你們幾點開門？', lang: 'zh-TW' });
  assert.equal(r.grounded, true);
  assert.match(r.reply, /09|9/);
});

test('問無關問題 → 不 grounded，走 fallback', { skip: !up && 'Ollama 未啟動' }, async () => {
  const r = await answer({ tenantName: 'project1_cute_dragon', message: '今天台積電股價多少？', lang: 'zh-TW' });
  assert.equal(r.grounded, false);
  assert.match(r.reply, /服務台|不太確定/);
});
```

- [ ] **Step 8: 跑 e2e 確認通過**

Run: `node --test tests/e2e.test.js`
Expected: PASS（Ollama 在跑時）

- [ ] **Step 9: 全測試 + 啟動驗證**

Run: `node --test`
Expected: 全 PASS（Ollama 未啟動時整合測試 skip）
Run: `npm start`，瀏覽器開 `http://localhost:8080` → 進小恐龍 → 問「幾點開門」得到含 09:00 的回答；問「票價」得到 350/250。

- [ ] **Step 10: Commit**

```bash
git add tenants/project1_cute_dragon tests/e2e.test.js
git commit -m "feat: first tenant project1_cute_dragon (content+index+e2e)"
```

---

## 移植到 Halo（開發完成後）

1. 複製整個 repo 到 Halo。
2. Halo 上 `ollama pull qwen2.5:14b` 與 `ollama pull bge-m3`。
3. 改 `config/global.yaml`：`llm.model: qwen2.5:14b`、`embedding.model: bge-m3`、視場域設 `mode: single` + `active_tenant`。
4. 重建索引：`node src/indexer.js project1_cute_dragon`（換了 embedding 模型一定要重建）。
5. `npm start`，瀏覽器全螢幕 kiosk 指向 `http://localhost:8080`。

---

## Self-Review 紀錄

- **Spec 覆蓋**：多租戶資料夾 ✓(Task 4,7,9)、設定外置+模型可換 ✓(Task 0,1+移植段)、hub/single 模式 ✓(Task 7,8)、知識庫一條一檔+中英分檔 ✓(Task 2,9)、RAG 向量檢索 ✓(Task 4,5)、grounding 不亂編 ✓(Task 6)、雙語 ✓(Task 6,8)、人設+ip_rules ✓(Task 6,9)、短期記憶（history.slice(-6)）✓(Task 6)、可收縮雙狀態畫面（chat 頁基礎版）✓(Task 8，進階形象/語音/Live2D 屬 P2/P3 不在本計畫)。
- **Placeholder 掃描**：各步驟皆含實際程式碼/指令，無 TBD。
- **型別一致**：`resolveConfig`→`cfg.tenantDir/llm/embedding/retrieval`；`loadKnowledge`→`{id,type,title,lang,text}`；`buildIndex`寫`{id,lang,type,title,text,vec}`；`retrieve`讀同欄位並加`score`；`answer`簽名 `{tenantName,message,history,lang}` 前後一致；`createServer` 於 Task 7 定義、Task 8 使用。
- **範圍**：聚焦 Phase 1 文字 kiosk；語音(P2)、Live2D rig(P3)、手機 QR(P4) 不在此計畫。Live2D rig 引擎已在 `PORJECT/project1_cute_dragon/rig-engine.html` 原型化，P3 再整合進 chat 頁。
