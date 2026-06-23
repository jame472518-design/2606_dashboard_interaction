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
