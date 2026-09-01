(() => {
  const original = window.PersoOpenRouter;
  if (!original?.chatCompletion) return;

  async function chatCompletion({ messages, temperature, responseFormat, signal }) {
    const endpoint = window.PersoEnv?.PLAN_PROXY_ENDPOINT || "/api/plan";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, temperature, responseFormat }),
      signal
    });

    const payload = await response.json().catch(() => null);
    const message = payload?.choices?.[0]?.message || null;

    return {
      ok: response.ok,
      status: response.status,
      payload,
      message,
      content: original.extractAssistantContent(message),
      reasoning: original.extractAssistantReasoning(message),
      error: payload?.error?.message || payload?.message || null
    };
  }

  window.PersoOpenRouter = Object.assign({}, original, { chatCompletion });
})();
