window.PersoAiClient = (() => {
  const log = window.PersoLogger;
  const DEFAULT_MODEL = "deepseek/deepseek-v4-flash";
  const ALLOWED_RULE_TYPES = new Set(["style", "visibility", "attribute", "css", "capability"]);
  const ALLOWED_CAPABILITIES = new Set([
    "scrollLock",
    "shortcutButton",
    "moveElement",
    "insertElement",
    "cloneElement",
    "swapElements",
    "menuShortcut"
  ]);
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
  const ALLOWED_INSERT_TAGS = new Set([
    "a",
    "aside",
    "button",
    "div",
    "figcaption",
    "figure",
    "footer",
    "h1",
    "h2",
    "h3",
    "header",
    "img",
    "li",
    "nav",
    "p",
    "section",
    "span",
    "strong",
    "ul"
  ]);
  const ALLOWED_INSERT_ATTRIBUTES = new Set(["alt", "aria-label", "href", "role", "src", "title"]);
  const ALLOWED_PLACEMENTS = new Set(["append", "prepend", "before", "after", "replace"]);

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
            "For feed filtering, ad filtering, creator/channel filtering, or requests to stop seeing a type of content, target the nearest content/card/list-item ancestor from semanticContainer or selectorHints, not just the matching badge, label, title, or channel link.",
            "When a node exposes stable attributes such as data-testid, data-channel, data-sponsored, id, or aria-label, prefer those selectors over positional selectors.",
            "Build targetMap entries with CSS selectors that match the intended elements on this page.",
            "Use browser-standard CSS selectors only. Never use Playwright-only selectors or pseudo-classes such as :has-text(), :text(), or :contains(). Avoid :has() unless there is no simpler selector.",
            "Each targetMap entry must include selectors and may include fallbackSelectors.",
            "If a target comes from a user selection, set source to selection and include selectionRef.",
            "If a target is inferred from page patterns, set source to inferred.",
            "Rules must reference targetRef values defined in targetMap.",
            "Never put raw selectors on rules. Selectors belong in targetMap only.",
            "If the user asks for one specific change, return only the minimal rules needed.",
            "Prefer type style with a styles object for color, size, spacing, borders, backgrounds, and other standard CSS properties.",
            "Use type css only when a raw CSS declaration block is truly necessary. css rules must include a css string field.",
            "If a rule targets one targetRef and only needs declarations such as display: none, use type style with styles instead of type css.",
            "Do not use type css for simple property changes such as color red or font-size 16px.",
            "For hiding/removing elements, prefer type visibility with action hide, or type style with display none. Do not set styles.visibility.",
            "Use type capability only for trusted extension-owned behaviors. The allowed capabilities are scrollLock, shortcutButton, moveElement, insertElement, cloneElement, swapElements, and menuShortcut.",
            "For requests such as stop scrolling, prevent scrolling, or show only the first loaded item, use a capability rule with capability scrollLock instead of raw JavaScript.",
            "A scrollLock capability rule should target the page, feed, or main content area and may include options.preserveSelectors for the first item that should remain visible.",
            "For requests such as add a button, create a shortcut, move a hidden action closer, or expose an action buried in menus, prefer a shortcutButton capability instead of JavaScript.",
            "A shortcutButton rule must use targetRef for the container where the new button should appear, sourceActionTargetRef for the existing clickable element to trigger, and a short label.",
            "shortcutButton only creates extension-owned UI and dispatches a click on an already existing page element.",
            "For requests to add new visible text, cards, badges, headers, simple buttons, or static page content, use insertElement. insertElement takes targetRef, placement append/prepend/before/after/replace, and an element descriptor with tag, text, attributes, styles, and children.",
            "For inserted elements, use only these tags: a, aside, button, div, figcaption, figure, footer, h1, h2, h3, header, img, li, nav, p, section, span, strong, ul. Do not include HTML strings.",
            "For inserted img elements, use attributes.src as asset:<assetId> when an attached image is available.",
            "For requests to duplicate or reuse an existing item elsewhere, use cloneElement with sourceTargetRef for the item to copy, targetRef for the placement target, and placement append/prepend/before/after/replace.",
            "For requests to swap two existing page elements, use swapElements with targetRef and otherTargetRef.",
            "For requests to move an existing page element or place an existing control somewhere else, use moveElement with targetRef as the element to move, placementTargetRef as the destination or anchor, and placement append/prepend/before/after.",
            "For actions hidden behind menus, use menuShortcut when the user names the action. menuShortcut creates an extension-owned button, clicks menuTargetRef to open the menu, then clicks the visible menu item whose text or aria-label matches actionText.",
            "menuShortcut uses targetRef as the container where the new shortcut appears, menuTargetRef as the existing menu/opener button, actionText as the menu action label, and label as the visible shortcut label.",
            "Use only allowed style properties.",
            "If an attached image should be used, set backgroundImage to asset:<assetId>, for example asset:uploadedImage.",
            "When setting a background image, always include backgroundSize: \"cover\", backgroundPosition: \"center center\", and backgroundRepeat: \"no-repeat\"; if the user asks for a page/background theme, also use backgroundAttachment: \"fixed\" unless it targets a small component.",
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
            allowedRuleTypes: ["css", "style", "visibility", "attribute", "capability"],
            allowedCapabilities: Array.from(ALLOWED_CAPABILITIES),
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

    const reasoningConfig = window.PersoOpenRouter.buildReasoningConfig();

    log.info("openrouter.request.started", {
      taskName,
      model,
      messageCount: messages.length,
      reasoning: reasoningConfig
    });

    const startedAt = performance.now();
    const result = await window.PersoOpenRouter.chatCompletion({
      apiKey,
      model,
      messages,
      temperature,
      responseFormat: { type: "json_object" }
    });
    const durationMs = Math.round(performance.now() - startedAt);

    log.info("openrouter.response.received", {
      ok: result.ok,
      status: result.status,
      durationMs,
      hasChoices: Boolean(result.payload?.choices?.length),
      hasReasoning: Boolean(result.reasoning),
      error: result.error
    });

    if (!result.ok) {
      throw new Error(result.error || `OpenRouter request failed with ${result.status}`);
    }

    if (!result.content) {
      throw new Error("OpenRouter returned no plan content.");
    }

    if (result.reasoning) {
      log.debug("openrouter.reasoning.received", {
        length: result.reasoning.length,
        preview: result.reasoning.slice(0, 500)
      });
    }

    log.debug("openrouter.content.received", {
      contentLength: result.content.length,
      preview: result.content.slice(0, 500)
    });

    return JSON.parse(result.content);
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

    if (rule.type === "capability") {
      if (!ALLOWED_CAPABILITIES.has(rule.capability)) {
        errors.push(`Rule ${index} has unsupported capability ${rule.capability}.`);
      }
      if (rule.capability === "shortcutButton") {
        if (!rule.sourceActionTargetRef || !targetRefs.has(rule.sourceActionTargetRef)) {
          errors.push(`Rule ${index} shortcutButton must include sourceActionTargetRef.`);
        }
        if (rule.label && typeof rule.label !== "string") {
          errors.push(`Rule ${index} shortcutButton label must be a string.`);
        }
      }
      if (rule.capability === "moveElement") {
        if (!rule.placementTargetRef || !targetRefs.has(rule.placementTargetRef)) {
          errors.push(`Rule ${index} moveElement must include placementTargetRef.`);
        }
        validatePlacement(rule, index, errors, ["append", "prepend", "before", "after"]);
      }
      if (rule.capability === "insertElement") {
        if (!rule.element || typeof rule.element !== "object" || Array.isArray(rule.element)) {
          errors.push(`Rule ${index} insertElement must include an element object.`);
        } else {
          validateInsertElement(rule.element, index, errors, assets);
        }
        validatePlacement(rule, index, errors);
      }
      if (rule.capability === "cloneElement") {
        if (!rule.sourceTargetRef || !targetRefs.has(rule.sourceTargetRef)) {
          errors.push(`Rule ${index} cloneElement must include sourceTargetRef.`);
        }
        validatePlacement(rule, index, errors);
      }
      if (rule.capability === "swapElements") {
        if (!rule.otherTargetRef || !targetRefs.has(rule.otherTargetRef)) {
          errors.push(`Rule ${index} swapElements must include otherTargetRef.`);
        }
      }
      if (rule.capability === "menuShortcut") {
        if (!rule.menuTargetRef || !targetRefs.has(rule.menuTargetRef)) {
          errors.push(`Rule ${index} menuShortcut must include menuTargetRef.`);
        }
        if (typeof rule.actionText !== "string" || !rule.actionText.trim()) {
          errors.push(`Rule ${index} menuShortcut must include actionText.`);
        }
      }
    }
  }

  function validatePlacement(rule, index, errors, allowed = Array.from(ALLOWED_PLACEMENTS)) {
    if (rule.placement && !allowed.includes(rule.placement)) {
      errors.push(`Rule ${index} has unsupported placement ${rule.placement}.`);
    }
  }

  function validateInsertElement(element, index, errors, assets = {}, depth = 0) {
    if (depth > 4) {
      errors.push(`Rule ${index} insertElement is nested too deeply.`);
      return;
    }

    const tag = String(element.tag || "div").toLowerCase();
    if (!ALLOWED_INSERT_TAGS.has(tag)) {
      errors.push(`Rule ${index} insertElement uses unsupported tag ${tag}.`);
    }

    if (element.text !== undefined && typeof element.text !== "string") {
      errors.push(`Rule ${index} insertElement text must be a string.`);
    }

    if (element.attributes !== undefined) {
      if (!element.attributes || typeof element.attributes !== "object" || Array.isArray(element.attributes)) {
        errors.push(`Rule ${index} insertElement attributes must be an object.`);
      } else {
        for (const [name, value] of Object.entries(element.attributes)) {
          if (!ALLOWED_INSERT_ATTRIBUTES.has(name)) {
            errors.push(`Rule ${index} insertElement uses unsupported attribute ${name}.`);
          }
          if (value !== null && typeof value !== "string") {
            errors.push(`Rule ${index} insertElement attribute ${name} must be a string or null.`);
          }
          if (name === "src" && typeof value === "string") {
            if (!value.startsWith("asset:")) {
              errors.push(`Rule ${index} insertElement img src must use asset:<assetId>.`);
            } else {
              const assetId = value.slice("asset:".length);
              if (!assets[assetId]) errors.push(`Rule ${index} insertElement references missing asset ${assetId}.`);
            }
          }
        }
      }
    }

    if (element.styles !== undefined) {
      if (!element.styles || typeof element.styles !== "object" || Array.isArray(element.styles)) {
        errors.push(`Rule ${index} insertElement styles must be an object.`);
      } else {
        for (const key of Object.keys(element.styles)) {
          if (!ALLOWED_STYLE_KEYS.has(key)) {
            errors.push(`Rule ${index} insertElement uses unsupported style key ${key}.`);
          }
        }
        if (element.styles.backgroundImage) {
          const value = String(element.styles.backgroundImage);
          if (value.startsWith("asset:")) {
            const assetId = value.slice("asset:".length);
            if (!assets[assetId]) errors.push(`Rule ${index} insertElement references missing asset ${assetId}.`);
          } else if (!/^none$/i.test(value)) {
            errors.push(`Rule ${index} insertElement backgroundImage must use asset:<assetId>.`);
          }
        }
      }
    }

    if (element.children !== undefined) {
      if (!Array.isArray(element.children) || element.children.length > 8) {
        errors.push(`Rule ${index} insertElement children must be an array with at most 8 items.`);
      } else {
        element.children.forEach((child) => validateInsertElement(child, index, errors, assets, depth + 1));
      }
    }
  }

  function normalizePlan(payload, prompt, pageContext, selections) {
    const rules = Array.isArray(payload.rules)
      ? payload.rules.flatMap((rule, index) => normalizeRule(rule, index))
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
      targetMap: normalizeTargetMap(payload.targetMap || {}),
      rules
    };
  }

  function normalizeRule(rule, index) {
    if (!rule || typeof rule !== "object") return [rule];

    const normalized = { ...rule };
    const styles = normalized.styles || normalized.style;

    if (normalized.type === "visibility" && !normalized.action && typeof normalized.visibility === "string") {
      const visibility = normalized.visibility.trim().toLowerCase();
      if (["hidden", "collapse", "none"].includes(visibility)) normalized.action = "hide";
      if (visibility === "visible") normalized.action = "show";
      delete normalized.visibility;
    }

    if (normalized.type === "visibility" && !normalized.action && typeof normalized.visible === "boolean") {
      normalized.action = normalized.visible ? "show" : "hide";
      delete normalized.visible;
    }

    if (normalized.type === "visibility" && !normalized.action && String(styles?.display || "").toLowerCase() === "none") {
      normalized.action = "hide";
      delete normalized.styles;
      delete normalized.style;
    }

    if (normalized.type === "visibility" && !["hide", "show", "dim"].includes(String(normalized.action || "").trim().toLowerCase())) {
      log.info("plan.rule.normalized", { index, from: `visibility:${normalized.action}`, to: "visibility:hide" });
      normalized.action = "hide";
      return [normalized];
    }

    if (normalized.type === "visibility" && normalized.action) {
      normalized.action = String(normalized.action).trim().toLowerCase();
      return [normalized];
    }

    if (normalized.type === "css" && normalized.targetRef && typeof normalized.css === "string" && !normalized.css.includes("{")) {
      const parsedStyles = parseCssDeclarations(normalized.css);
      if (Object.keys(parsedStyles).length) {
        log.info("plan.rule.normalized", { index, from: "target-css-declarations", to: "style" });
        return normalizeRule({
          ...normalized,
          type: "style",
          styles: parsedStyles
        }, index);
      }
    }

    if (styles && typeof styles === "object" && !Array.isArray(styles)) {
      normalized.styles = styles;
      delete normalized.style;

      if (normalized.type === "css" || !normalized.type) {
        log.info("plan.rule.normalized", { index, from: normalized.type || "missing", to: "style" });
        normalized.type = "style";
        delete normalized.css;
      }

      const visibilityValue = String(normalized.styles.visibility || "").trim().toLowerCase();
      if (["hidden", "collapse", "none"].includes(visibilityValue)) {
        delete normalized.styles.visibility;
        const visibilityRule = {
          id: `${normalized.id || normalized.targetRef || "target"}-visibility-hide`,
          type: "visibility",
          targetRef: normalized.targetRef,
          action: "hide"
        };
        log.info("plan.rule.normalized", { index, from: "style.visibility", to: "visibility:hide" });
        if (!Object.keys(normalized.styles).length) return [visibilityRule];
        return [normalized, visibilityRule];
      }
    }

    if (normalized.type === "css" && typeof normalized.css !== "string" && normalized.css && typeof normalized.css === "object") {
      log.info("plan.rule.normalized", { index, from: "css-object", to: "style" });
      normalized.type = "style";
      normalized.styles = normalized.css;
      delete normalized.css;
    }

    return [normalized];
  }

  function normalizeTargetMap(targetMap) {
    const normalized = {};
    Object.entries(targetMap || {}).forEach(([key, target]) => {
      if (!target || typeof target !== "object") {
        normalized[key] = target;
        return;
      }

      const selectors = sanitizeSelectors(target.selectors || []);
      const fallbackSelectors = sanitizeSelectors(target.fallbackSelectors || []);
      normalized[key] = {
        ...target,
        selectors: selectors.length ? selectors : fallbackSelectors,
        fallbackSelectors: selectors.length ? fallbackSelectors : []
      };
    });
    return normalized;
  }

  function sanitizeSelectors(selectors) {
    return Array.from(new Set((selectors || [])
      .filter((selector) => typeof selector === "string")
      .map((selector) => selector.trim())
      .filter((selector) => selector && !/:has\b|:has-text\b|:text\b|:contains\b/i.test(selector))));
  }

  function parseCssDeclarations(css) {
    const styles = {};
    String(css || "").split(";").forEach((declaration) => {
      const [rawKey, ...rawValue] = declaration.split(":");
      if (!rawKey || !rawValue.length) return;
      const key = rawKey.trim().replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      const value = rawValue.join(":").replace(/\s*!important\b/i, "").trim();
      if (key && value) styles[key] = value;
    });
    return styles;
  }

  function isValidSelector(selector) {
    if (typeof selector !== "string" || selector.length > 240) return false;
    if (/[{};]/.test(selector)) return false;
    if (/:has\b|:has-text\b|:text\b|:contains\b/i.test(selector)) return false;

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
