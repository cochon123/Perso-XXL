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

  const TRANSFORM_SCHEMA_HINT = {
    version: "2.0",
    site: {
      hostname: "example.com",
      pathname: "/",
      urlPattern: "example.com/*"
    },
    sourcePrompt: "Make the selected chip label red",
    selections: [{
      id: "sel_1",
      tag: "div",
      classes: ["ytSpecTouchFeedbackShapeFill"],
      elementKind: "decorative",
      semanticTarget: {
        levelsUp: 2,
        tag: "div",
        classes: ["ytChipShapeChip"],
        text: "Tous",
        reason: "Clicked node looks decorative; parent 2 level(s) up contains the visible label or control."
      }
    }],
    targetMap: {
      chip_label: {
        source: "selection",
        selectionRef: "sel_1",
        selectors: ["yt-chip-cloud-chip-renderer.iron-selected .ytChipShapeChip div"],
        fallbackSelectors: ["button.ytChipShapeButtonReset .ytChipShapeChip div"]
      }
    },
    rules: [
      {
        id: "red-chip-label",
        type: "style",
        targetRef: "chip_label",
        styles: { color: "red" }
      }
    ]
  };

  async function generateTransformPlan({
    prompt,
    pageContext,
    pageDom,
    selections = [],
    availableAssets = [],
    previousPlan = null,
    validationErrors = []
  }) {
    const payload = await requestJson({
      taskName: previousPlan ? "plan-repair" : "plan-generation",
      temperature: 0.35,
      messages: [
        {
          role: "system",
          content: [
            "You generate safe declarative website transform plans for a browser extension.",
            "Return only valid JSON.",
            "Never include JavaScript, event handlers, external URLs, network requests, or arbitrary executable code.",
            "Use the page DOM summary and user-selected elements as grounding.",
            "User selections mark what the user pointed at, but clicks often land on inner decorative nodes such as touch feedback, overlays, icons, or empty wrappers.",
            "When the user says modify this element, they usually mean the visible control or label, often the parent or grandparent of the clicked node.",
            "Each selection includes hierarchyCandidates and semanticTarget. Walk up the hierarchy when needed and prefer the ancestor that contains the visible text, label, or interactive control.",
            "Do not target empty decorative layers when the prompt is about text color, labels, buttons, chips, tabs, links, or visible content.",
            "For text styling, target the element that actually owns the visible text, or a parent wrapper whose children include that text.",
            "Prefer specific scoped selectors from hierarchyCandidates or selectorHints over broad shared classes that match many unrelated elements.",
            "User selections mark what the user pointed at. Infer broader targets when the prompt implies a class of elements, such as all video titles.",
            "Build targetMap entries with CSS selectors that match the intended elements on this page.",
            "Each targetMap entry must include selectors and may include fallbackSelectors.",
            "If a target comes from a user selection, set source to selection and include selectionRef.",
            "If a target is inferred from page patterns, set source to inferred.",
            "Rules must reference targetRef values defined in targetMap.",
            "Never put raw selectors on rules. Selectors belong in targetMap only.",
            "If the user asks for one specific change, return only the minimal rules needed.",
            "Prefer type style with a styles object for color, size, spacing, borders, backgrounds, and other standard CSS properties.",
            "Use type css only when a raw CSS declaration block is truly necessary. css rules must include a css string field.",
            "Do not use type css for simple property changes such as color red or font-size 16px.",
            "Use only allowed style properties.",
            "If an attached image should be used, set backgroundImage to asset:<assetId>, for example asset:uploadedImage.",
            "Never use local filesystem paths in CSS."
          ].join(" ")
        },
        {
          role: "user",
          content: JSON.stringify({
            task: previousPlan
              ? "Repair this transform plan so it passes validation. Return the full corrected plan."
              : "Create a transform plan for the user's prompt.",
            prompt,
            pageContext,
            pageDom,
            selections,
            availableAssets,
            allowedRuleTypes: ["css", "style", "visibility", "attribute"],
            allowedStyleKeys: ALLOWED_STYLE_KEYS_LIST,
            schemaExample: TRANSFORM_SCHEMA_HINT,
            previousPlan,
            validationErrors
          })
        }
      ]
    });

    return normalizePlan(payload, prompt, pageContext, selections);
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

  function validateTransformPlan(input) {
    const errors = [];
    const targetRefs = new Set(Object.keys(input?.targetMap || {}));
    log.info("plan.validation.started", {
      site: input?.site,
      ruleCount: Array.isArray(input?.rules) ? input.rules.length : null
    });

    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return { ok: false, errors: ["Plan must be a JSON object."] };
    }

    if (!input.site) errors.push("Plan must include site.");
    if (!input.targetMap || typeof input.targetMap !== "object") {
      errors.push("Plan must include targetMap.");
    }

    if (!Array.isArray(input.rules)) {
      errors.push("Plan must include a rules array.");
    } else if (input.rules.length > 30) {
      errors.push("Plan cannot contain more than 30 rules.");
    } else {
      input.rules.forEach((rule, index) => validateRule(rule, index, errors, targetRefs, input.assets || {}));
    }

    validateTargetMap(input.targetMap || {}, errors, input.selections || []);

    const result = { ok: errors.length === 0, errors };
    log.info("plan.validation.finished", result);
    return result;
  }

  function validateTargetMap(targetMap, errors, selections) {
    const selectionIds = new Set(selections.map((selection) => selection.id));

    Object.entries(targetMap).forEach(([key, target]) => {
      if (!target || typeof target !== "object") {
        errors.push(`Target ${key} must be an object.`);
        return;
      }

      if (!Array.isArray(target.selectors) || target.selectors.length === 0) {
        errors.push(`Target ${key} must include selectors.`);
      }

      if (target.selectionRef && !selectionIds.has(target.selectionRef)) {
        errors.push(`Target ${key} references unknown selectionRef ${target.selectionRef}.`);
      }

      for (const selector of [...(target.selectors || []), ...(target.fallbackSelectors || [])]) {
        if (!isValidSelector(selector)) {
          errors.push(`Target ${key} has invalid selector ${selector}.`);
        }
      }
    });
  }

  function validateRule(rule, index, errors, targetRefs, assets) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      errors.push(`Rule ${index} must be an object.`);
      return;
    }

    if (!ALLOWED_RULE_TYPES.has(rule.type)) errors.push(`Rule ${index} has unsupported type.`);
    if (rule.selector) errors.push(`Rule ${index} uses a raw selector. Use targetRef instead.`);

    if (rule.type !== "css" && !rule.targetRef) {
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

    if (rule.type === "attribute" && typeof rule.attribute !== "string") {
      errors.push(`Rule ${index} attribute rule must include attribute name.`);
    }

    if (rule.type === "css") {
      if (typeof rule.css !== "string" || rule.css.length > 5000) {
        const got = rule.css === undefined ? "missing" : typeof rule.css;
        errors.push(`Rule ${index} css rules need rule.css as a string (got ${got}). Use type style with styles for property changes.`);
      } else if (/@import|url\s*\(|expression\s*\(|javascript:|position\s*:\s*fixed|z-index\s*:\s*9999/i.test(rule.css)) {
        errors.push(`Rule ${index} CSS contains a blocked pattern.`);
      }
    }
  }

  function normalizePlan(payload, prompt, pageContext, selections) {
    const rules = Array.isArray(payload.rules)
      ? payload.rules.map((rule, index) => normalizeRule(rule, index))
      : [];

    return {
      ...payload,
      version: payload.version || "2.0",
      sourcePrompt: payload.sourcePrompt || prompt,
      site: payload.site || {
        hostname: pageContext.hostname,
        pathname: pageContext.pathname,
        urlPattern: `${pageContext.hostname}${pageContext.pathname}*`
      },
      selections: payload.selections || selections.map(({ id, tag, ariaLabel, text }) => ({
        id,
        tag,
        ariaLabel,
        text: text?.slice(0, 120)
      })),
      targetMap: payload.targetMap || {},
      rules
    };
  }

  function normalizeRule(rule, index) {
    if (!rule || typeof rule !== "object") return rule;

    const normalized = { ...rule };
    const styles = normalized.styles || normalized.style;

    if (styles && typeof styles === "object" && !Array.isArray(styles)) {
      normalized.styles = styles;
      delete normalized.style;

      if (normalized.type === "css" || !normalized.type) {
        log.info("plan.rule.normalized", { index, from: normalized.type || "missing", to: "style" });
        normalized.type = "style";
        delete normalized.css;
      }
    }

    if (normalized.type === "css" && typeof normalized.css !== "string" && normalized.css && typeof normalized.css === "object") {
      log.info("plan.rule.normalized", { index, from: "css-object", to: "style" });
      normalized.type = "style";
      normalized.styles = normalized.css;
      delete normalized.css;
    }

    return normalized;
  }

  function isValidSelector(selector) {
    if (typeof selector !== "string" || selector.length > 240) return false;
    if (/[{};]/.test(selector)) return false;

    try {
      document.querySelector(selector);
      return true;
    } catch (_error) {
      return false;
    }
  }

  const ALLOWED_STYLE_KEYS_LIST = Array.from(ALLOWED_STYLE_KEYS);

  return { generateTransformPlan, validateTransformPlan };
})();
