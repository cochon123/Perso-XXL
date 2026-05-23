window.PersoAiClient = (() => {
  const log = window.PersoLogger;
  const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
  const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
  const ALLOWED_RULE_TYPES = new Set(["style", "visibility", "attribute", "css"]);
  const ALLOWED_STYLE_KEYS = new Set([
    "background",
    "backgroundColor",
    "backgroundImage",
    "backgroundSize",
    "backgroundPosition",
    "backgroundRepeat",
    "backgroundAttachment",
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

  const DISCOVERY_SCHEMA_HINT = {
    intent: "restyle_existing_elements",
    targetConcepts: ["thumbnail", "image"],
    candidateKinds: ["image", "media"],
    domCollectionStrategy: {
      includeSelectors: ["img", "a img", "[class*='thumbnail' i]"],
      includeAncestors: 3,
      includeVisibleOnly: true,
      maxCandidates: 80
    },
    expectedStyles: ["borderRadius", "overflow"]
  };

  const TRANSFORM_SCHEMA_HINT = {
    version: "1.1",
    site: {
      hostname: "example.com",
      adapter: "generic"
    },
    sourcePrompt: "Make thumbnails circular",
    targetMap: {
      thumbnail: {
        source: "focused-dom",
        selectors: ["img", "a img"],
        confidence: 0.75
      }
    },
    rules: [
      {
        id: "round-thumbnails",
        type: "style",
        targetRef: "thumbnail",
        styles: {
          borderRadius: "50%",
          overflow: "hidden"
        }
      }
    ]
  };

  async function discoverModificationScope({ prompt, pageContext, availableAssets = [] }) {
    const payload = await requestJson({
      taskName: "target-discovery",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: [
            "You are the target discovery stage for a browser extension.",
            "Given a user prompt and lightweight page context, decide which visible page elements matter.",
            "Do not create style rules.",
            "Return only valid JSON matching the provided schema shape.",
            "Prefer focused collection strategies over broad full-page collection."
          ].join(" ")
        },
        {
          role: "user",
          content: JSON.stringify({
            prompt,
            pageContext,
            availableAssets,
            schemaExample: DISCOVERY_SCHEMA_HINT,
            allowedCandidateKinds: ["image", "media", "card", "button", "control", "text", "layout", "region"]
          })
        }
      ]
    });

    return normalizeDiscovery(payload, prompt);
  }

  async function generateTransformPlan({ prompt, discovery, focusedDom, availableAssets = [], previousPlan = null, validationErrors = [] }) {
    const availableTargetRefs = Object.keys(focusedDom?.targetMap || {});
    const targetMap = focusedDom?.targetMap || {};
    const payload = await requestJson({
      taskName: previousPlan ? "plan-repair" : "plan-generation",
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content: [
            "You generate safe declarative website transform plans.",
            "Return only valid JSON.",
            "Never include JavaScript, event handlers, external URLs, network requests, or raw arbitrary selectors.",
            "Use targetRef values from availableTargetRefs whenever possible.",
            "If the user asks for one specific change, return only the minimal rules needed for that change.",
            "For broad theme requests, create 4 to 8 conservative rules.",
            "Use only allowed style properties.",
            "Do not invent targetRefs that are not in availableTargetRefs.",
            "If an attached image should be used, set backgroundImage to asset:<assetId>, for example asset:uploadedImage.",
            "Never use local filesystem paths in CSS."
          ].join(" ")
        },
        {
          role: "user",
          content: JSON.stringify({
            task: previousPlan
              ? "Repair this transform plan so it passes validation. Return the full corrected plan."
              : "Create a transform plan for the user's prompt using the focused DOM.",
            prompt,
            discovery,
            focusedDom,
            availableAssets,
            availableTargetRefs,
            targetMap,
            allowedRuleTypes: ["css", "style", "visibility", "attribute"],
            allowedStyleKeys: ALLOWED_STYLE_KEYS_LIST,
            schemaExample: TRANSFORM_SCHEMA_HINT,
            previousPlan,
            validationErrors
          })
        }
      ]
    });

    return {
      ...payload,
      version: payload.version || "1.1",
      sourcePrompt: payload.sourcePrompt || prompt,
      site: payload.site || {
        hostname: location.hostname,
        adapter: location.hostname.includes("youtube.com") ? "youtube" : "generic"
      },
      targetMap: payload.targetMap || targetMap
    };
  }

  async function requestJson({ taskName, messages, temperature }) {
    const apiKey = window.PersoEnv?.OPENROUTER_API_KEY;
    const model = window.PersoEnv?.OPENROUTER_MODEL || DEFAULT_MODEL;

    if (!apiKey) {
      throw new Error("Missing OpenRouter key in config/env.js.");
    }

    log.info("openrouter.request.started", {
      taskName,
      model,
      messageCount: messages.length
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
        temperature,
        response_format: { type: "json_object" },
        messages
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

  function validateTransformPlan(input, focusedDom = null) {
    const errors = [];
    const targetRefs = new Set(Object.keys(input?.targetMap || focusedDom?.targetMap || {}));
    log.info("plan.validation.started", {
      site: input?.site,
      ruleCount: Array.isArray(input?.rules) ? input.rules.length : null
    });

    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return { ok: false, errors: ["Plan must be a JSON object."] };
    }

    if (!input.site) errors.push("Plan must include site.");

    if (!Array.isArray(input.rules)) {
      errors.push("Plan must include a rules array.");
    } else if (input.rules.length > 30) {
      errors.push("Plan cannot contain more than 30 rules.");
    } else {
      input.rules.forEach((rule, index) => validateRule(rule, index, errors, targetRefs, input.assets || {}));
    }

    const result = { ok: errors.length === 0, errors };
    log.info("plan.validation.finished", result);
    return result;
  }

  function validateRule(rule, index, errors, targetRefs, assets) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      errors.push(`Rule ${index} must be an object.`);
      return;
    }

    if (!ALLOWED_RULE_TYPES.has(rule.type)) errors.push(`Rule ${index} has unsupported type.`);
    if (rule.selector) errors.push(`Rule ${index} uses a raw selector. Use targetRef instead.`);

    if (rule.type !== "css" && !rule.targetRef && !rule.target) {
      errors.push(`Rule ${index} must include targetRef.`);
    }

    if (rule.targetRef && !targetRefs.has(rule.targetRef)) {
      errors.push(`Rule ${index} references unknown targetRef ${rule.targetRef}.`);
    }

    if (rule.type === "style") {
      if (!rule.styles || typeof rule.styles !== "object" || Array.isArray(rule.styles)) {
        errors.push(`Rule ${index} style rule must include styles object.`);
        return;
      }

      Object.keys(rule.styles).forEach((key) => {
        if (!ALLOWED_STYLE_KEYS.has(key)) errors.push(`Rule ${index} uses unsupported style key ${key}.`);
      });

      if (rule.styles.backgroundImage) {
        const value = String(rule.styles.backgroundImage);
        if (value.startsWith("asset:")) {
          const assetId = value.slice("asset:".length);
          if (!assets[assetId]) errors.push(`Rule ${index} references missing asset ${assetId}.`);
        } else if (!/^none$/i.test(value)) {
          errors.push(`Rule ${index} backgroundImage must use asset:<assetId>.`);
        }
      }
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

  function normalizeDiscovery(payload, prompt) {
    const promptLower = prompt.toLowerCase();
    const fallbackConcepts = /background/.test(promptLower)
      ? ["background", "page"]
      : /thumb|image|photo|picture|avatar/.test(promptLower)
      ? ["thumbnail", "image"]
      : ["selection"];
    const fallbackKinds = /background/.test(promptLower) ? ["layout", "region"] : ["image", "media"];

    return {
      intent: payload.intent || "restyle_existing_elements",
      targetConcepts: Array.isArray(payload.targetConcepts) && payload.targetConcepts.length ? payload.targetConcepts : fallbackConcepts,
      candidateKinds: Array.isArray(payload.candidateKinds) && payload.candidateKinds.length ? payload.candidateKinds : fallbackKinds,
      domCollectionStrategy: {
        includeSelectors: getDiscoverySelectors(payload, promptLower),
        includeAncestors: payload.domCollectionStrategy?.includeAncestors ?? 3,
        includeVisibleOnly: payload.domCollectionStrategy?.includeVisibleOnly !== false,
        maxCandidates: payload.domCollectionStrategy?.maxCandidates || 80
      },
      expectedStyles: payload.expectedStyles || []
    };
  }

  const ALLOWED_STYLE_KEYS_LIST = Array.from(ALLOWED_STYLE_KEYS);

  function getDiscoverySelectors(payload, promptLower) {
    const selectors = payload.domCollectionStrategy?.includeSelectors || payload.includeSelectors || [];
    if (/background/.test(promptLower)) {
      return Array.from(new Set([
        "html",
        "body",
        "main",
        "#app",
        "#root",
        "ytd-app",
        "ytd-page-manager#page-manager",
        ...selectors
      ]));
    }

    return selectors;
  }

  return { discoverModificationScope, generateTransformPlan, validateTransformPlan };
})();
