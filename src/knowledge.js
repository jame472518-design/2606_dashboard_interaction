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
