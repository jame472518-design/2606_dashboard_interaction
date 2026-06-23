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
