import { afterEach, describe, expect, it, vi } from "vitest";
import plan from "../netlify/functions/plan.mjs";

function request(body, options = {}) {
  return new Request("https://playground.test/api/plan", {
    method: options.method || "POST",
    headers: {
      "content-type": "application/json",
      "x-nf-client-connection-ip": options.ip || crypto.randomUUID(),
      ...(options.headers || {})
    },
    body: options.method === "GET" ? undefined : body
  });
}

describe("Playground planning function", () => {
  const originalKey = process.env.OPENROUTER_API_KEY;
  const originalModel = process.env.OPENROUTER_MODEL;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = originalModel;
  });

  it("rejects unsupported methods, invalid JSON, and empty messages", async () => {
    expect((await plan(request(undefined, { method: "GET" }))).status).toBe(405);
    expect((await plan(request("not json"))).status).toBe(400);
    expect((await plan(request(JSON.stringify({ messages: [] })))).status).toBe(400);
  });

  it("fails calmly when the planning service is not configured", async () => {
    delete process.env.OPENROUTER_API_KEY;
    const response = await plan(request(JSON.stringify({ messages: [{ role: "user", content: "hello" }] })));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: { message: "Planning service is not configured." } });
  });

  it("forwards allowed inputs and returns the upstream response", async () => {
    process.env.OPENROUTER_API_KEY = "secret-test-key";
    process.env.OPENROUTER_MODEL = "test/model";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await plan(request(JSON.stringify({
      messages: [{ role: "user", content: "hello" }],
      temperature: 0.2,
      responseFormat: { type: "json_object" }
    })));

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    const payload = JSON.parse(init.body);
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer secret-test-key");
    expect(payload).toMatchObject({
      model: "test/model",
      messages: [{ role: "user", content: "hello" }],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });
  });

  it("maps an upstream network failure to a useful 502", async () => {
    process.env.OPENROUTER_API_KEY = "secret-test-key";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));

    const response = await plan(request(JSON.stringify({ messages: [{ role: "user", content: "hello" }] })));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({ error: { message: "Could not reach the planning service." } });
  });
});
