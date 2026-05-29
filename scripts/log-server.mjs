import fs from "node:fs";
import http from "node:http";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

loadDotEnv(path.join(repoRoot, ".env"));

const PORT = Number(process.env.PERSO_LOG_PORT || 8787);
const DATABASE_URL = process.env.PERSO_DATABASE_URL || process.env.DATABASE_URL || "";
const pool = new Pool(
  DATABASE_URL
    ? { connectionString: DATABASE_URL }
    : {
        database: process.env.PGDATABASE || process.env.USER,
        host: process.env.PGHOST || "/var/run/postgresql",
        user: process.env.PGUSER || process.env.USER,
        password: process.env.PGPASSWORD
      }
);

let dbReady = false;
let dbInitPromise = null;

const server = http.createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);

    if (request.method === "POST" && url.pathname === "/log") {
      await handleLog(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/feedback") {
      await handleFeedback(request, response);
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/feedback") {
      await handleFeedbackList(url, response);
      return;
    }

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/feedback")) {
      sendHtml(response, renderFeedbackDashboard());
      return;
    }

    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "Not found" }));
  } catch (error) {
    console.error("[dev-server] request failed", error);
    response.writeHead(500, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "Server error" }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Perso XXL dev server listening at http://localhost:${PORT}`);
  console.log(`Logs: POST http://localhost:${PORT}/log`);
  console.log(`Feedback dashboard: http://localhost:${PORT}/feedback`);
  console.log(DATABASE_URL ? "Postgres: using configured connection URL." : "Postgres: using local socket defaults.");
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Start with PERSO_LOG_PORT=8788 npm run dev:server to use another port.`);
    process.exit(1);
  }
  throw error;
});

async function handleLog(request, response) {
  const body = await readBody(request);
  const entry = JSON.parse(body);
  printEntry(entry);
  response.writeHead(204);
  response.end();
}

async function handleFeedback(request, response) {
  await ensureDb();

  const body = await readBody(request);
  const payload = JSON.parse(body);
  const feedback = normalizeFeedback(payload);

  await pool.query(
    `insert into feedback_events (
      id, feedback, message_id, conversation_id, modification_id, prompt_text, assistant_text,
      site_url, site_title, page_hostname, page_pathname, install_id, extension_version, user_agent, metadata
    ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
    [
      randomUUID(),
      feedback.feedback,
      feedback.messageId,
      feedback.conversationId,
      feedback.modificationId,
      feedback.promptText,
      feedback.assistantText,
      feedback.siteUrl,
      feedback.siteTitle,
      feedback.pageHostname,
      feedback.pagePathname,
      feedback.installId,
      feedback.extensionVersion,
      request.headers["user-agent"] || "",
      feedback.metadata
    ]
  );

  response.writeHead(201, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ ok: true }));
}

async function handleFeedbackList(url, response) {
  await ensureDb();

  const limit = Math.max(1, Math.min(Number(url.searchParams.get("limit") || 100), 500));
  const { rows } = await pool.query(
    `select
      id, created_at, feedback, message_id, conversation_id, modification_id,
      prompt_text, assistant_text, site_url, site_title, page_hostname, page_pathname,
      install_id, extension_version
    from feedback_events
    order by created_at desc
    limit $1`,
    [limit]
  );
  const stats = await pool.query(
    `select
      count(*)::int as total,
      count(*) filter (where feedback = 'like')::int as likes,
      count(*) filter (where feedback = 'dislike')::int as dislikes
    from feedback_events`
  );

  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify({ ok: true, stats: stats.rows[0], events: rows }));
}

function normalizeFeedback(payload) {
  const feedback = String(payload.feedback || "").toLowerCase();
  if (!["like", "dislike"].includes(feedback)) {
    throw new Error("Invalid feedback value");
  }

  return {
    feedback,
    messageId: stringOrNull(payload.messageId),
    conversationId: stringOrNull(payload.conversationId),
    modificationId: stringOrNull(payload.modificationId),
    promptText: stringOrNull(payload.promptText),
    assistantText: stringOrNull(payload.assistantText),
    siteUrl: stringOrNull(payload.siteUrl),
    siteTitle: stringOrNull(payload.siteTitle),
    pageHostname: stringOrNull(payload.pageHostname),
    pagePathname: stringOrNull(payload.pagePathname),
    installId: stringOrNull(payload.installId),
    extensionVersion: stringOrNull(payload.extensionVersion),
    metadata: payload.metadata && typeof payload.metadata === "object" ? payload.metadata : {}
  };
}

function stringOrNull(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, 4000) : null;
}

function ensureDb() {
  if (dbReady) return Promise.resolve();
  if (!dbInitPromise) {
    dbInitPromise = pool.query(`
      create table if not exists feedback_events (
        id uuid primary key,
        created_at timestamptz not null default now(),
        feedback text not null check (feedback in ('like', 'dislike')),
        message_id text,
        conversation_id text,
        modification_id text,
        prompt_text text,
        assistant_text text,
        site_url text,
        site_title text,
        page_hostname text,
        page_pathname text,
        install_id text,
        extension_version text,
        user_agent text,
        metadata jsonb not null default '{}'::jsonb
      );

      create index if not exists feedback_events_created_at_idx on feedback_events (created_at desc);
      create index if not exists feedback_events_feedback_idx on feedback_events (feedback);
      create index if not exists feedback_events_message_id_idx on feedback_events (message_id);
    `).then(() => {
      dbReady = true;
    });
  }
  return dbInitPromise;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body is too large"));
        request.destroy();
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendHtml(response, html) {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
}

function printEntry(entry) {
  const time = entry.timestamp || new Date().toISOString();
  const level = String(entry.level || "info").toUpperCase().padEnd(5);
  const event = entry.event || "unknown";
  const url = entry.context?.url || "";

  console.log(`\n[${time}] ${level} ${event}`);
  if (url) console.log(`  url: ${url}`);

  if (entry.data && Object.keys(entry.data).length > 0) {
    console.log(formatData(entry.data));
  }
}

function formatData(data) {
  return JSON.stringify(data, null, 2)
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
}

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const contents = fs.readFileSync(filePath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

function renderFeedbackDashboard() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Perso XXL Feedback</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; background: #f6f2ec; color: #201b18; }
    main { max-width: 1180px; margin: 0 auto; padding: 32px 20px 48px; }
    header { display: flex; align-items: end; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
    h1 { margin: 0; font-size: 32px; letter-spacing: 0; }
    button { border: 1px solid #d8cbc0; background: #fff; color: inherit; border-radius: 8px; padding: 9px 13px; font: inherit; cursor: pointer; }
    .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
    .stat, .event { background: #fff; border: 1px solid #e0d5cb; border-radius: 8px; box-shadow: 0 1px 2px rgba(32, 27, 24, .05); }
    .stat { padding: 16px; }
    .stat span { display: block; color: #76695f; font-size: 13px; }
    .stat strong { display: block; margin-top: 6px; font-size: 28px; }
    .event { padding: 16px; margin-bottom: 12px; }
    .event-head { display: flex; justify-content: space-between; gap: 12px; margin-bottom: 10px; }
    .pill { display: inline-flex; align-items: center; border-radius: 999px; padding: 4px 9px; font-size: 13px; font-weight: 700; }
    .like { background: #dff4e8; color: #17613a; }
    .dislike { background: #ffe1df; color: #8a241c; }
    .meta { color: #76695f; font-size: 13px; }
    .url { overflow-wrap: anywhere; }
    .text { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 12px; }
    .box { background: #faf7f2; border: 1px solid #eee3da; border-radius: 8px; padding: 12px; min-width: 0; }
    .box h2 { margin: 0 0 7px; font-size: 13px; color: #76695f; }
    .box p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.45; }
    .empty { padding: 28px; text-align: center; color: #76695f; background: #fff; border-radius: 8px; border: 1px solid #e0d5cb; }
    @media (max-width: 720px) { header, .event-head { align-items: start; flex-direction: column; } .stats, .text { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <h1>Feedback</h1>
        <div class="meta">Perso XXL developer dashboard</div>
      </div>
      <button type="button" id="refresh">Refresh</button>
    </header>
    <section class="stats" aria-label="Feedback totals">
      <div class="stat"><span>Total</span><strong id="total">0</strong></div>
      <div class="stat"><span>Likes</span><strong id="likes">0</strong></div>
      <div class="stat"><span>Dislikes</span><strong id="dislikes">0</strong></div>
    </section>
    <section id="events"></section>
  </main>
  <script>
    const eventsEl = document.getElementById("events");
    const refreshBtn = document.getElementById("refresh");
    refreshBtn.addEventListener("click", loadFeedback);
    loadFeedback();

    async function loadFeedback() {
      const response = await fetch("/api/feedback?limit=100");
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "Could not load feedback");
      document.getElementById("total").textContent = data.stats.total || 0;
      document.getElementById("likes").textContent = data.stats.likes || 0;
      document.getElementById("dislikes").textContent = data.stats.dislikes || 0;
      eventsEl.innerHTML = data.events.length ? data.events.map(renderEvent).join("") : '<div class="empty">No feedback yet.</div>';
    }

    function renderEvent(event) {
      const feedback = escapeHtml(event.feedback || "");
      return '<article class="event">' +
        '<div class="event-head">' +
          '<div><span class="pill ' + feedback + '">' + feedback + '</span> <span class="meta">' + escapeHtml(formatDate(event.created_at)) + '</span></div>' +
          '<div class="meta">' + escapeHtml(event.extension_version || "") + '</div>' +
        '</div>' +
        '<div class="url">' + escapeHtml(event.site_title || event.page_hostname || "Unknown page") + '</div>' +
        '<div class="meta url">' + escapeHtml(event.site_url || "") + '</div>' +
        '<div class="text">' +
          '<div class="box"><h2>Prompt</h2><p>' + escapeHtml(event.prompt_text || "") + '</p></div>' +
          '<div class="box"><h2>Assistant</h2><p>' + escapeHtml(event.assistant_text || "") + '</p></div>' +
        '</div>' +
      '</article>';
    }

    function formatDate(value) {
      return value ? new Date(value).toLocaleString() : "";
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char]));
    }
  </script>
</body>
</html>`;
}
