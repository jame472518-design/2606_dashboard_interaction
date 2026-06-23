import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
// Windows-safe guard: fileURLToPath converts file:///C:/... to C:\..., then path.resolve normalises both sides
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const name = process.argv[2];
  if (!name) { console.error('用法: node src/indexer.js <tenantName>'); process.exit(1); }
  const cfg = await resolveConfig(name);
  const res = await buildIndex(cfg.tenantDir, { model: cfg.embedding.model, baseUrl: cfg.llm.base_url });
  console.log(`已索引 ${res.count} 條知識 → ${name}/index/vectors.json`);
}
