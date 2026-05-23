import { ALLOWED_TARGETS, TRANSFORM_SCHEMA_HINT } from "./schema.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";

export async function generateTransformPlan({ apiKey, model, profileNotes, domSummary }) {
  const response = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "chrome-extension://perso-xxl",
      "X-Title": "Perso XXL"
    },
    body: JSON.stringify({
      model: model || DEFAULT_MODEL,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "You generate safe declarative website transform plans.",
            "Return only valid JSON.",
            "Never include JavaScript, event handlers, external URLs, network requests, or selectors.",
            "Rules must target only the allowed semantic YouTube targets.",
            "Keep the first plan conservative and reversible."
          ].join(" ")
        },
        {
          role: "user",
          content: JSON.stringify({
            task: "Create a YouTube layout transform plan matching this user's personality and preferences.",
            allowedTargets: ALLOWED_TARGETS,
            allowedRuleTypes: ["css", "style", "visibility", "attribute"],
            schemaExample: TRANSFORM_SCHEMA_HINT,
            profileNotes,
            domSummary
          })
        }
      ]
    })
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message = payload?.error?.message || payload?.message || `OpenRouter request failed with ${response.status}`;
    throw new Error(message);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter returned no plan content.");
  }

  return JSON.parse(content);
}
