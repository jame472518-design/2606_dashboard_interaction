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

// 沒命中知識時的「寒暄/自我介紹」模式：用人設親切回應，但嚴禁編造館方事實
export function buildChitchatPrompt({ persona, ipRules, history, userText, lang }) {
  const langLine = lang === 'en' ? 'Reply in English.' : '用繁體中文、口語、親切地回答。';
  const rules = (ipRules || []).map(r => `- ${r}`).join('\n');
  const system = [
    persona,
    rules && `角色底線：\n${rules}`,
    '你現在手邊沒有任何館方資料。你可以親切地打招呼、自我介紹、閒聊、引導對方詢問樂園的事。' +
    '但你不知道任何具體的營業時間、票價、地點或展品細節——若被問到這類館方資訊，就坦白說你不確定、' +
    '請對方問服務台，絕對不可以自己編造任何數字或事實。回答簡短、帶童趣。',
    langLine,
  ].filter(Boolean).join('\n\n');
  return [
    { role: 'system', content: system },
    ...history,
    { role: 'user', content: userText },
  ];
}

// 主入口：回傳 { reply, grounded, sources }
// 命中知識 → 依資料回答；沒命中 → 用人設寒暄/引導（不編造事實）。
export async function answer({ tenantName, message, history = [], lang }) {
  const cfg = await resolveConfig(tenantName);
  const useLang = lang || cfg.server.default_lang;
  const persona = await loadPersona(cfg);
  const index = await loadIndex(cfg.tenantDir);
  const qvec = await embed(message, { model: cfg.embedding.model, baseUrl: cfg.llm.base_url });
  const hits = retrieve(index, qvec, { lang: useLang, k: cfg.retrieval.top_k });
  const grounded = decideGrounded(hits, cfg.retrieval.min_score);
  const recent = history.slice(-6);
  const messages = grounded
    ? buildPrompt({ persona: persona.body, ipRules: persona.ipRules, contexts: hits, history: recent, userText: message, lang: useLang })
    : buildChitchatPrompt({ persona: persona.body, ipRules: persona.ipRules, history: recent, userText: message, lang: useLang });
  let reply;
  try {
    reply = await chat({ messages, model: cfg.llm.model, baseUrl: cfg.llm.base_url });
  } catch {
    reply = fallbackReply(useLang);   // LLM 出錯時的兜底
  }
  return { reply, grounded, sources: grounded ? hits.map(h => ({ id: h.id, title: h.title, score: h.score })) : [] };
}
