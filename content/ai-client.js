window.PersoAiClient = (() => {
  const log = window.PersoLogger;
  const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
  const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
  const ALLOWED_TARGETS = [
    "app",
    "masthead",
    "sidebar",
    "homeFeed",
    "videoCard",
    "videoTitle",
    "thumbnail",
    "chips",
    "shortsShelf",
    "watchPage",
    "player",
    "recommendations",
    "comments"
  ];
  const ALLOWED_RULE_TYPES = new Set(["style", "visibility", "attribute", "css"]);
  const ALLOWED_STYLE_KEYS = new Set([
    "background",
    "backgroundColor",
    "border",
    "borderBottom",
    "borderColor",
    "borderTop",
    "borderRadius",
    "boxShadow",
    "color",
    "display",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "gap",
    "lineHeight",
    "margin",
    "marginBottom",
    "marginLeft",
    "marginRight",
    "marginTop",
    "maxWidth",
    "opacity",
    "outline",
    "overflow",
    "padding",
    "paddingBottom",
    "paddingLeft",
    "paddingRight",
    "paddingTop",
    "transform",
    "aspectRatio"
  ]);

  const TRANSFORM_SCHEMA_HINT = {
    version: "1.0",
    site: "youtube.com",
    theme: {
      colors: {
        background: "#111111",
        surface: "#1F1F1F",
        surfaceElevated: "#2A2A2A",
        text: "#F5F5F5",
        textMuted: "#B8B8B8",
        accent: "#D99A4E"
      },
      typography: {
        fontFamily: "Inter, Arial, system-ui, sans-serif",
        baseFontSize: "15px"
      },
      radius: "12px",
      density: "comfortable"
    },
    rules: [
      {
        id: "video-card-style",
        type: "style",
        target: "videoCard",
        styles: {
          backgroundColor: "var(--perso-surface)",
          borderRadius: "var(--perso-radius)",
          padding: "10px"
        }
      }
    ]
  };

  async function generateTransformPlan({ profileNotes, domSummary, previousPlan = null, validationErrors = [] }) {
    const apiKey = window.PersoEnv?.OPENROUTER_API_KEY;
    const model = window.PersoEnv?.OPENROUTER_MODEL || DEFAULT_MODEL;

    if (!apiKey) {
      throw new Error("Missing OpenRouter key in config/env.js.");
    }

    log.info("openrouter.request.started", {
      model,
      profileNotesLength: profileNotes?.length || 0,
      pageType: domSummary?.pageType,
      targetCount: domSummary?.targets?.length || 0,
      isRepair: Boolean(previousPlan)
    });

    const startedAt = performance.now();
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "chrome-extension://perso-xxl",
        "X-Title": "Perso XXL"
      },
      body: JSON.stringify({
        model,
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
              "Keep the first plan conservative and reversible.",
              "If the user asks for one specific change, return only the minimal rules needed for that change.",
              "For broad personality or theme requests, create 4 to 8 rules that visibly change the page theme, masthead, feed, cards, and optional distraction controls.",
              "For thumbnail shape changes, target thumbnail and include borderRadius plus overflow hidden.",
              "Prefer CSS properties from this list only: backgroundColor, color, border, borderColor, borderRadius, boxShadow, fontFamily, fontSize, fontWeight, margin, padding, opacity, overflow, aspectRatio."
            ].join(" ")
          },
          {
            role: "user",
            content: JSON.stringify({
              task: previousPlan
                ? "Repair this YouTube layout transform plan so it passes validation. Return the full corrected plan."
                : "Create a YouTube layout transform plan matching this user's personality and preferences.",
              allowedTargets: ALLOWED_TARGETS,
              allowedRuleTypes: ["css", "style", "visibility", "attribute"],
              schemaExample: TRANSFORM_SCHEMA_HINT,
              profileNotes,
              domSummary,
              previousPlan,
              validationErrors
            })
          }
        ]
      })
    });

    const payload = await response.json().catch(() => null);
    const durationMs = Math.round(performance.now() - startedAt);

    log.info("openrouter.response.received", {
      ok: response.ok,
      status: response.status,
      durationMs,
      hasChoices: Boolean(payload?.choices?.length),
      error: payload?.error?.message || payload?.message || null
    });

    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || `OpenRouter request failed with ${response.status}`;
      throw new Error(message);
    }

    const content = payload?.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenRouter returned no plan content.");

    log.debug("openrouter.content.received", {
      contentLength: content.length,
      preview: content.slice(0, 500)
    });

    return JSON.parse(content);
  }

  function validateTransformPlan(input) {
    const errors = [];
    log.info("plan.validation.started", {
      site: input?.site,
      ruleCount: Array.isArray(input?.rules) ? input.rules.length : null
    });

    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return { ok: false, errors: ["Plan must be a JSON object."] };
    }

    if (input.site !== "youtube.com") errors.push("Plan site must be youtube.com.");
    if (!input.theme || typeof input.theme !== "object") errors.push("Plan must include a theme object.");

    if (!Array.isArray(input.rules)) {
      errors.push("Plan must include a rules array.");
    } else if (input.rules.length > 30) {
      errors.push("Plan cannot contain more than 30 rules.");
    } else {
      input.rules.forEach((rule, index) => validateRule(rule, index, errors));
    }

    const result = { ok: errors.length === 0, errors };
    log.info("plan.validation.finished", result);
    return result;
  }

  function validateRule(rule, index, errors) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      errors.push(`Rule ${index} must be an object.`);
      return;
    }

    if (!ALLOWED_RULE_TYPES.has(rule.type)) errors.push(`Rule ${index} has unsupported type.`);
    if (rule.selector) errors.push(`Rule ${index} uses a raw selector. Use semantic target instead.`);

    if (rule.type !== "css" && !ALLOWED_TARGETS.includes(rule.target)) {
      errors.push(`Rule ${index} has unsupported target.`);
    }

    if (rule.type === "style") {
      if (!rule.styles || typeof rule.styles !== "object" || Array.isArray(rule.styles)) {
        errors.push(`Rule ${index} style rule must include styles object.`);
        return;
      }

      Object.keys(rule.styles).forEach((key) => {
        if (!ALLOWED_STYLE_KEYS.has(key)) errors.push(`Rule ${index} uses unsupported style key ${key}.`);
      });
    }

    if (rule.type === "visibility" && !["hide", "show", "dim"].includes(rule.action)) {
      errors.push(`Rule ${index} has unsupported visibility action.`);
    }

    if (rule.type === "attribute" && !["theater", "mini-guide-visible", "guide-persistent-and-visible"].includes(rule.attribute)) {
      errors.push(`Rule ${index} has unsupported attribute.`);
    }

    if (rule.type === "css") {
      if (typeof rule.css !== "string" || rule.css.length > 5000) {
        errors.push(`Rule ${index} CSS must be a short string.`);
      } else if (/@import|url\s*\(|expression\s*\(|javascript:|position\s*:\s*fixed|z-index\s*:\s*9999/i.test(rule.css)) {
        errors.push(`Rule ${index} CSS contains a blocked pattern.`);
      }
    }
  }

  return { generateTransformPlan, validateTransformPlan };
})();
