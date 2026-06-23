import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readYaml(p) {
  return yaml.load(await readFile(p, 'utf8')) ?? {};
}

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
