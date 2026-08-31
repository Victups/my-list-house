// GET  /api/state  -> estado salvo (ou null)
// PUT  /api/state  -> recebe o estado do aparelho, mescla com o do servidor, devolve o resultado
//
// Env vars necessárias:
//   REDIS_URL   (injetada pela integração Redis do Vercel)
//   APP_PIN     (opcional, mas recomendado)

import { createClient } from "redis";

const REDIS_KEY = "mudanca:state";

// Reaproveita a conexão entre invocações na mesma instância — evita abrir
// um socket novo a cada request.
let client;
async function getClient() {
  if (client && client.isOpen) return client;
  client = createClient({ url: process.env.REDIS_URL });
  client.on("error", (e) => console.error("redis:", e.message));
  await client.connect();
  return client;
}

// Cada entrada carrega um timestamp. Vence a mais recente — assim dois
// aparelhos editando offline não apagam o trabalho um do outro.
function merge(a, b) {
  const out = { done: {}, custom: {} };
  for (const src of [a, b]) {
    if (!src) continue;
    for (const field of ["done", "custom"]) {
      for (const [k, v] of Object.entries(src[field] || {})) {
        const cur = out[field][k];
        if (!cur || (v.t || 0) > (cur.t || 0)) out[field][k] = v;
      }
    }
  }
  return out;
}

export default async function handler(req, res) {
  const pin = process.env.APP_PIN;
  if (pin && req.headers["x-pin"] !== pin) {
    return res.status(401).json({ error: "PIN incorreto." });
  }

  if (!process.env.REDIS_URL) {
    return res.status(500).json({
      error: "Redis não configurado. Falta REDIS_URL nas variáveis do projeto.",
    });
  }

  try {
    const redis = await getClient();

    if (req.method === "GET") {
      const raw = await redis.get(REDIS_KEY);
      return res.status(200).json(raw ? JSON.parse(raw) : null);
    }

    if (req.method === "PUT" || req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body || "{}");
      if (!body || typeof body !== "object") body = {};

      const raw = await redis.get(REDIS_KEY);
      const merged = merge(raw ? JSON.parse(raw) : null, {
        done: body.done,
        custom: body.custom,
      });
      await redis.set(REDIS_KEY, JSON.stringify(merged));
      return res.status(200).json(merged);
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Método não permitido." });
  } catch (e) {
    console.error(e);
    return res.status(502).json({ error: "Falha ao falar com o Redis: " + e.message });
  }
}