import http from "node:http";

const PORT = Number(process.env.PERSO_LOG_PORT || 8787);

const server = http.createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method !== "POST" || request.url !== "/log") {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false, error: "Not found" }));
    return;
  }

  try {
    const body = await readBody(request);
    const entry = JSON.parse(body);
    printEntry(entry);
    response.writeHead(204);
    response.end();
  } catch (error) {
    console.error("[log-server] failed to read log entry", error);
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ok: false }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Perso XXL log server listening at http://localhost:${PORT}/log`);
});

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
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
