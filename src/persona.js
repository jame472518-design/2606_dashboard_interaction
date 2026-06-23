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
