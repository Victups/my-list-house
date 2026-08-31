// GET  /api/state  -> estado salvo (ou null)
// PUT  /api/state  -> recebe o estado do aparelho, mescla com o do servidor, devolve o resultado
//
// Env vars necessárias:
//   KV_REST_API_URL / KV_REST_API_TOKEN   (injetadas pela integração Upstash do Vercel)
//   APP_PIN                                (opcional, mas recomendado)

const REDIS_KEY = "mudanca:state";

function creds() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return { url, token };
}

async function redisGet() {
  const { url, token } = creds();
  const r = await fetch(`${url}/get/${REDIS_KEY}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!r.ok) throw new Error(`redis get ${r.status}`);
  const j = await r.json();
  if (!j.result) return null;
  try { return JSON.parse(j.result); } catch { return null; }
}

async function redisSet(value) {
  const { url, token } = creds();
  const r = await fetch(`${url}/set/${REDIS_KEY}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "text/plain" },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error(`redis set ${r.status}`);
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

  const { url, token } = creds();
  if (!url || !token) {
    return res.status(500).json({
      error: "Redis não configurado. Falta KV_REST_API_URL / KV_REST_API_TOKEN nas variáveis do projeto.",
    });
  }

  try {
    if (req.method === "GET") {
      return res.status(200).json(await redisGet());
    }

    if (req.method === "PUT" || req.method === "POST") {
      let body = req.body;
      if (typeof body === "string") body = JSON.parse(body || "{}");
      if (!body || typeof body !== "object") body = {};

      const merged = merge(await redisGet(), { done: body.done, custom: body.custom });
      await redisSet(merged);
      return res.status(200).json(merged);
    }

    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Método não permitido." });
  } catch (e) {
    return res.status(502).json({ error: "Falha ao falar com o Redis: " + e.message });
  }
}
