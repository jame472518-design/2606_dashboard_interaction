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
