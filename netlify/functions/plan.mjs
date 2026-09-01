const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MAX_BODY_BYTES = 200 * 1024;
const RATE_LIMIT = 12;
const RATE_WINDOW_MS = 60_000;
const hitsByIp = new Map();

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function clientIp(req) {
  const direct = req.headers.get("x-nf-client-connection-ip");
  if (direct) return direct.trim();
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return "unknown";
}

function allowRequest(ip) {
  const now = Date.now();
  const recent = (hitsByIp.get(ip) || []).filter((stamp) => now - stamp < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    hitsByIp.set(ip, recent);
    return false;
  }
  recent.push(now);
  hitsByIp.set(ip, recent);
  return true;
}

export default async (req) => {
  if (req.method !== "POST") {
    return jsonResponse(405, { error: { message: "Use POST." } });
  }

  if (!allowRequest(clientIp(req))) {
    return jsonResponse(429, {
      error: {
        message: "This playground is a bit busy — wait a minute and try again."
      }
    });
  }

  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: { message: "Request is too large." } });
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: { message: "Request is too large." } });
  }

  let body;
  try {
    body = JSON.parse(raw);
  } catch (_error) {
    return jsonResponse(400, { error: { message: "Body must be JSON." } });
  }

  const messages = body?.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonResponse(400, {
      error: { message: "messages must be a non-empty array." }
    });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, {
      error: { message: "Planning service is not configured." }
    });
  }

  const payload = {
    model: process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash",
    messages,
    reasoning: { enabled: true, effort: "low", exclude: true }
  };

  if (body.temperature !== undefined) payload.temperature = body.temperature;
  if (body.responseFormat) payload.response_format = body.responseFormat;

  let upstream;
  try {
    upstream = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": req.headers.get("origin") || "https://perso-xxl.playground",
        "X-Title": "Perso XXL Playground"
      },
      body: JSON.stringify(payload)
    });
  } catch (_error) {
    return jsonResponse(502, {
      error: { message: "Could not reach the planning service." }
    });
  }

  const text = await upstream.text();
  return new Response(text, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "application/json"
    }
  });
};

export const config = {
  path: "/api/plan"
};
