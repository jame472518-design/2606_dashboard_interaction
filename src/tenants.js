import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function listTenants() {
  const dir = path.join(REPO, 'tenants');
  let names = [];
  try {
    names = (await readdir(dir, { withFileTypes: true }))
      .filter(d => d.isDirectory() && !d.name.startsWith('_')).map(d => d.name);
  } catch { return []; }
  const out = [];
  for (const name of names) {
    let display = name;
    try {
      display = yaml.load(await readFile(path.join(dir, name, 'tenant.yaml'), 'utf8'))?.display_name || name;
    } catch { /* ignore */ }
    out.push({ name, display_name: display });
  }
  return out;
}
