window.PersoOpenRouter = (() => {
  const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

  function buildReasoningConfig() {
    if (window.PersoEnv?.OPENROUTER_REASONING_ENABLED === false) {
      return undefined;
    }

    const effort = window.PersoEnv?.OPENROUTER_REASONING_EFFORT || "low";
    const exclude = window.PersoEnv?.OPENROUTER_REASONING_EXCLUDE !== false;

    return {
      enabled: true,
      effort,
      exclude
    };
  }

  function buildChatCompletionBody({ model, messages, temperature, responseFormat }) {
    const body = {
      model,
      messages,
      temperature
    };

    if (responseFormat) {
      body.response_format = responseFormat;
    }

    const reasoning = buildReasoningConfig();
    if (reasoning) {
      body.reasoning = reasoning;
    }

    return body;
  }

  function extractAssistantContent(message) {
    if (!message) return null;

    const content = typeof message.content === "string"
      ? message.content
      : Array.isArray(message.content)
        ? message.content
          .filter((part) => part?.type === "text" && typeof part.text === "string")
          .map((part) => part.text)
          .join("\n")
        : null;

    return stripJsonMarkdown(content);
  }

  function extractAssistantReasoning(message) {
    if (!message?.reasoning) return null;

    return typeof message.reasoning === "string"
      ? message.reasoning
      : JSON.stringify(message.reasoning);
  }

  function stripJsonMarkdown(value) {
    if (typeof value !== "string") return value;

    const trimmed = value.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
    return fenced ? fenced[1].trim() : trimmed;
  }

  async function chatCompletion({
    apiKey,
    model,
    messages,
    temperature,
    responseFormat,
    referer = "chrome-extension://perso-xxl",
    title = "Perso XXL"
  }) {
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": referer,
        "X-Title": title
      },
      body: JSON.stringify(buildChatCompletionBody({
        model,
        messages,
        temperature,
        responseFormat
      }))
    });

    const payload = await response.json().catch(() => null);
    const message = payload?.choices?.[0]?.message || null;

    return {
      ok: response.ok,
      status: response.status,
      payload,
      message,
      content: extractAssistantContent(message),
      reasoning: extractAssistantReasoning(message),
      reasoningConfig: buildReasoningConfig() || null,
      error: payload?.error?.message || payload?.message || null
    };
  }

  return {
    chatCompletion,
    buildReasoningConfig,
    extractAssistantContent,
    extractAssistantReasoning
  };
})();
