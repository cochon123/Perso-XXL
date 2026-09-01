window.PersoDirectAgent = (() => {
  const log = window.PersoLogger || { debug() {}, info() {}, warn() {}, error() {} };
  const SNAPSHOT_TTL_MS = 2 * 60 * 1000;
  const MAX_SNAPSHOTS = 4;
  const DEFAULT_TARGETS = 60;
  const MAX_TARGETS = 120;
  const MAX_RULES = 20;
  const MAX_TEXT = 500;
  const sessions = new Map();
  const DIRECT_RULE_TYPES = new Set(["style", "visibility", "attribute", "capability"]);
  const DIRECT_ATTRIBUTES = new Set(["aria-label", "title", "role"]);
  const DIRECT_CAPABILITIES = new Set([
    "scrollLock",
    "shortcutButton",
    "moveElement",
    "insertElement",
    "cloneElement",
    "swapElements",
    "menuShortcut"
  ]);
  const STRUCTURAL_CAPABILITIES = new Set(["moveElement", "insertElement", "cloneElement", "swapElements"]);
  const ALLOWED_PLACEMENTS = new Set(["append", "prepend", "before", "after", "replace"]);
  const SAFE_ROLE_VALUES = new Set([
    "article", "banner", "button", "complementary", "contentinfo", "dialog", "figure",
    "heading", "img", "link", "list", "listitem", "main", "navigation", "none",
    "presentation", "region", "search", "status", "tab", "tabpanel"
  ]);
  const TARGET_SELECTOR = [
    "h1", "h2", "h3", "h4", "h5", "h6", "main", "article", "section", "aside", "nav",
    "header", "footer", "button", "a", "input", "textarea", "select", "label", "p", "li",
    "img", "video", "figure", "figcaption", "table", "form", "[role]", "[aria-label]",
    "[data-testid]", "[data-test]", "[id]"
  ].join(",");
  const BLOCKED_KEY_PATTERN = /^(?:__proto__|prototype|constructor|selector|selectors|fallbackSelectors|css|html|innerHTML|outerHTML|script|srcdoc|on[a-z]+)$/i;
  const BLOCKED_TEXT_PATTERN = /<\s*script|javascript\s*:|data\s*:\s*text\/html|on(?:error|load|click)\s*=|@import|expression\s*\(|-moz-binding|behavior\s*:/i;
  const BLOCKED_STYLE_VALUE_PATTERN = /[{};]|url\s*\(|@import|javascript\s*:|expression\s*\(|attr\s*\(|-moz-binding|behavior\s*:/i;

  function inspectPage(options = {}) {
    pruneSessions();
    const query = normalizeText(options.query || "").slice(0, 160);
    const maxTargets = clampInteger(options.maxTargets, 10, MAX_TARGETS, DEFAULT_TARGETS);
    const candidates = collectCandidates(query).slice(0, maxTargets);
    const snapshotId = randomId("snapshot");
    const createdAt = Date.now();
    const bindings = new Map();
    const targets = [];

    candidates.forEach(({ element, score }, index) => {
      const selectors = buildUniqueSelectors(element);
      if (!selectors.length) return;
      const targetId = `target_${index + 1}`;
      const fingerprint = fingerprintElement(element);
      bindings.set(targetId, {
        element: typeof WeakRef === "function" ? new WeakRef(element) : element,
        fingerprint,
        selectors
      });
      targets.push(describeTarget(element, targetId, score));
    });

    sessions.set(snapshotId, {
      snapshotId,
      createdAt,
      expiresAt: createdAt + SNAPSHOT_TTL_MS,
      pageKey: currentPageKey(),
      bindings
    });
    trimSessions();

    return {
      snapshotId,
      page: {
        url: location.href,
        title: document.title,
        hostname: location.hostname,
        pathname: location.pathname,
        viewport: { width: window.innerWidth, height: window.innerHeight }
      },
      expiresInSeconds: Math.floor(SNAPSHOT_TTL_MS / 1000),
      oneUse: true,
      targetCount: targets.length,
      targets,
      instructions: "Use only these opaque targetId values. Do not send selectors, CSS blocks, HTML, scripts, or page text rewrites. Re-inspect if the page changes or the snapshot expires."
    };
  }

  function preparePlan(input = {}) {
    const snapshotId = normalizeText(input.snapshotId || "");
    const session = sessions.get(snapshotId);
    if (session) sessions.delete(snapshotId);

    if (!snapshotId || !session) {
      throw new Error("Inspection snapshot is missing, expired, or already used. Call inspect_page again.");
    }
    if (Date.now() > session.expiresAt) {
      throw new Error("Inspection snapshot expired. Call inspect_page again before applying changes.");
    }
    if (session.pageKey !== currentPageKey()) {
      throw new Error("The page navigated since inspection. Call inspect_page again on the current page.");
    }

    rejectBlockedKeys(input, "plan");
    assertOnlyKeys(input, new Set(["snapshotId", "title", "rationale", "rules"]), "plan");
    const title = cleanLabel(input.title || "Agent personalization", 80);
    const rationale = cleanText(input.rationale || "", 400);
    if (!Array.isArray(input.rules) || input.rules.length < 1 || input.rules.length > MAX_RULES) {
      throw new Error(`Direct plans must contain between 1 and ${MAX_RULES} rules.`);
    }

    const targetMap = {};
    const usedBindings = new Map();
    const rules = input.rules.map((rule, index) => compileRule(rule, index, session, targetMap, usedBindings));
    revalidateBindings(usedBindings);
    const risk = assessRisk(rules, usedBindings);
    const plan = {
      version: "2.2-direct",
      title,
      sourcePrompt: rationale || `Direct agent plan: ${title}`,
      site: {
        hostname: location.hostname,
        pathname: location.pathname,
        urlPattern: `${location.hostname}${location.pathname}*`
      },
      selections: [],
      targetMap,
      rules,
      assets: {},
      provenance: {
        source: "webmcp-agent",
        snapshotId,
        inspectedAt: new Date(session.createdAt).toISOString()
      }
    };

    return {
      plan,
      risk,
      targetCount: usedBindings.size,
      ruleCount: rules.length,
      revalidate() {
        if (Date.now() > session.expiresAt) throw new Error("Inspection snapshot expired while awaiting approval. Call inspect_page again.");
        if (session.pageKey !== currentPageKey()) throw new Error("The page navigated while awaiting approval. Call inspect_page again.");
        revalidateBindings(usedBindings);
      }
    };
  }

  function compileRule(rule, index, session, targetMap, usedBindings) {
    const label = `Rule ${index + 1}`;
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
      throw new Error(`${label} must be an object.`);
    }
    rejectBlockedKeys(rule, label);
    const type = normalizeText(rule.type).toLowerCase();
    if (!DIRECT_RULE_TYPES.has(type)) throw new Error(`${label} has unsupported type "${type || "missing"}".`);

    const targetRef = bindTarget(rule.targetId, session, targetMap, usedBindings, label);
    const compiled = { id: `direct_${index + 1}`, type, targetRef };

    if (type === "style") {
      assertOnlyKeys(rule, new Set(["type", "targetId", "styles"]), label);
      compiled.styles = validateStyles(rule.styles, label);
    } else if (type === "visibility") {
      assertOnlyKeys(rule, new Set(["type", "targetId", "action"]), label);
      const action = normalizeText(rule.action).toLowerCase();
      if (!new Set(["hide", "show", "dim"]).has(action)) throw new Error(`${label} has unsupported visibility action.`);
      compiled.action = action;
    } else if (type === "attribute") {
      assertOnlyKeys(rule, new Set(["type", "targetId", "attribute", "value"]), label);
      const attribute = normalizeText(rule.attribute).toLowerCase();
      if (!DIRECT_ATTRIBUTES.has(attribute)) throw new Error(`${label} may only change aria-label, title, or role.`);
      const value = rule.value === null || rule.value === false ? rule.value : cleanText(rule.value, 160);
      if (attribute === "role" && value && !SAFE_ROLE_VALUES.has(String(value).toLowerCase())) {
        throw new Error(`${label} uses an unsupported ARIA role.`);
      }
      compiled.attribute = attribute;
      compiled.value = value;
    } else {
      compileCapability(rule, compiled, label, session, targetMap, usedBindings);
    }

    return compiled;
  }

  function compileCapability(rule, compiled, label, session, targetMap, usedBindings) {
    const capability = normalizeText(rule.capability);
    if (!DIRECT_CAPABILITIES.has(capability)) throw new Error(`${label} has unsupported capability "${capability || "missing"}".`);
    compiled.capability = capability;

    if (capability === "scrollLock") {
      assertOnlyKeys(rule, new Set(["type", "targetId", "capability"]), label);
      return;
    }
    if (capability === "shortcutButton") {
      assertOnlyKeys(rule, new Set(["type", "targetId", "capability", "sourceActionTargetId", "label", "placement"]), label);
      compiled.sourceActionTargetRef = bindTarget(rule.sourceActionTargetId, session, targetMap, usedBindings, `${label} source action`);
      compiled.label = cleanLabel(rule.label || "Shortcut", 80);
      compiled.placement = validatePlacement(rule.placement, label, new Set(["append", "prepend"]));
      return;
    }
    if (capability === "moveElement") {
      assertOnlyKeys(rule, new Set(["type", "targetId", "capability", "placementTargetId", "placement"]), label);
      compiled.placementTargetRef = bindTarget(rule.placementTargetId, session, targetMap, usedBindings, `${label} placement`);
      compiled.placement = validatePlacement(rule.placement, label, new Set(["append", "prepend", "before", "after"]));
      return;
    }
    if (capability === "insertElement") {
      assertOnlyKeys(rule, new Set(["type", "targetId", "capability", "placement", "element"]), label);
      compiled.placement = validatePlacement(rule.placement, label, ALLOWED_PLACEMENTS);
      compiled.element = validateElementDescriptor(rule.element, label);
      return;
    }
    if (capability === "cloneElement") {
      assertOnlyKeys(rule, new Set(["type", "targetId", "capability", "sourceTargetId", "placement", "label", "text"]), label);
      compiled.sourceTargetRef = bindTarget(rule.sourceTargetId, session, targetMap, usedBindings, `${label} source`);
      compiled.placement = validatePlacement(rule.placement, label, ALLOWED_PLACEMENTS);
      if (rule.label !== undefined) compiled.label = cleanLabel(rule.label, 120);
      if (rule.text !== undefined) compiled.text = cleanText(rule.text, 240);
      return;
    }
    if (capability === "swapElements") {
      assertOnlyKeys(rule, new Set(["type", "targetId", "capability", "otherTargetId"]), label);
      compiled.otherTargetRef = bindTarget(rule.otherTargetId, session, targetMap, usedBindings, `${label} other target`);
      return;
    }
    if (capability === "menuShortcut") {
      assertOnlyKeys(rule, new Set(["type", "targetId", "capability", "menuTargetId", "actionText", "label", "placement"]), label);
      compiled.menuTargetRef = bindTarget(rule.menuTargetId, session, targetMap, usedBindings, `${label} menu`);
      compiled.actionText = cleanLabel(rule.actionText, 120);
      compiled.label = cleanLabel(rule.label || rule.actionText, 80);
      compiled.placement = validatePlacement(rule.placement, label, new Set(["append", "prepend"]));
    }
  }

  function bindTarget(targetId, session, targetMap, usedBindings, label) {
    const id = normalizeText(targetId);
    const binding = session.bindings.get(id);
    if (!binding) throw new Error(`${label} references unknown targetId "${id || "missing"}". Re-inspect the page.`);
    if (!targetMap[id]) targetMap[id] = { selectors: binding.selectors.slice(), fallbackSelectors: [] };
    usedBindings.set(id, binding);
    return id;
  }

  function revalidateBindings(bindings) {
    for (const [targetId, binding] of bindings) {
      const element = dereference(binding.element);
      if (!element?.isConnected) throw new Error(`Target ${targetId} is no longer on the page. Call inspect_page again.`);
      if (fingerprintElement(element) !== binding.fingerprint) {
        throw new Error(`Target ${targetId} changed after inspection. Call inspect_page again.`);
      }
      const selectorStillExact = binding.selectors.some((selector) => {
        try {
          const matches = document.querySelectorAll(selector);
          return matches.length === 1 && matches[0] === element;
        } catch (_error) {
          return false;
        }
      });
      if (!selectorStillExact) throw new Error(`Target ${targetId} can no longer be resolved uniquely. Call inspect_page again.`);
    }
  }

  function validateStyles(styles, label) {
    if (!styles || typeof styles !== "object" || Array.isArray(styles)) throw new Error(`${label} must include a styles object.`);
    const entries = Object.entries(styles);
    if (!entries.length || entries.length > 12) throw new Error(`${label} styles must contain between 1 and 12 properties.`);
    const output = {};
    for (const [key, rawValue] of entries) {
      if (!window.PersoSchema.ALLOWED_STYLE_KEYS.has(key)) throw new Error(`${label} uses unsupported style property "${key}".`);
      if (key === "backgroundImage" && String(rawValue).toLowerCase() !== "none") {
        throw new Error(`${label} cannot load background images in a direct plan.`);
      }
      const value = String(rawValue ?? "").trim();
      if (!value || value.length > 160 || BLOCKED_STYLE_VALUE_PATTERN.test(value)) {
        throw new Error(`${label} has an unsafe value for ${key}.`);
      }
      validateStyleBounds(key, value, label);
      output[key] = value;
    }
    return output;
  }

  function validateStyleBounds(key, value, label) {
    if (key === "opacity") {
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0 || number > 1) throw new Error(`${label} opacity must be between 0 and 1.`);
    }
    if (key === "fontSize") {
      const match = value.match(/^([\d.]+)px$/i);
      if (match && (Number(match[1]) < 8 || Number(match[1]) > 96)) throw new Error(`${label} fontSize must be between 8px and 96px.`);
    }
    if (key === "transform" && !/^(?:none|(?:translate[XY]?|scale|rotate)\([^)]{1,40}\)(?:\s+|$))+$/i.test(value)) {
      throw new Error(`${label} uses an unsupported transform.`);
    }
  }

  function validateElementDescriptor(element, label, depth = 0) {
    if (!element || typeof element !== "object" || Array.isArray(element)) throw new Error(`${label} must include an element object.`);
    if (depth > 3) throw new Error(`${label} element nesting is too deep.`);
    rejectBlockedKeys(element, `${label} element`);
    assertOnlyKeys(element, new Set(["tag", "text", "attributes", "styles", "children", "actionText"]), `${label} element`);
    const tag = normalizeText(element.tag || "div").toLowerCase();
    if (!window.PersoSchema.ALLOWED_INSERT_TAGS.has(tag)) throw new Error(`${label} uses unsupported inserted tag "${tag}".`);
    const output = { tag };
    if (element.text !== undefined) output.text = cleanText(element.text, MAX_TEXT);
    if (element.actionText !== undefined) output.actionText = cleanLabel(element.actionText, 120);
    if (element.attributes !== undefined) output.attributes = validateInsertedAttributes(element.attributes, label);
    if (element.styles !== undefined) output.styles = validateStyles(element.styles, `${label} inserted element`);
    if (element.children !== undefined) {
      if (!Array.isArray(element.children) || element.children.length > 6) throw new Error(`${label} may insert at most 6 child elements.`);
      output.children = element.children.map((child) => validateElementDescriptor(child, label, depth + 1));
    }
    return output;
  }

  function validateInsertedAttributes(attributes, label) {
    if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) throw new Error(`${label} attributes must be an object.`);
    const output = {};
    for (const [name, value] of Object.entries(attributes)) {
      if (!window.PersoSchema.ALLOWED_INSERT_ATTRIBUTES.has(name)) throw new Error(`${label} uses unsupported inserted attribute "${name}".`);
      if (name === "src") throw new Error(`${label} cannot load image sources in a direct plan.`);
      const cleaned = cleanText(value, 300);
      if (name === "href" && !/^(?:https?:|mailto:|tel:|#|\/)/i.test(cleaned)) throw new Error(`${label} has an unsafe href.`);
      output[name] = cleaned;
    }
    return output;
  }

  function validatePlacement(value, label, allowed) {
    const placement = normalizeText(value || "append").toLowerCase();
    if (!allowed.has(placement)) throw new Error(`${label} has unsupported placement "${placement}".`);
    return placement;
  }

  function assessRisk(rules, bindings) {
    const reasons = [];
    let level = "low";
    const structural = rules.filter((rule) => rule.type === "capability" && STRUCTURAL_CAPABILITIES.has(rule.capability));
    if (structural.length) {
      level = "high";
      reasons.push(`${structural.length} structural ${structural.length === 1 ? "operation" : "operations"}`);
    }
    if (rules.some((rule) => rule.type === "capability" && ["shortcutButton", "menuShortcut"].includes(rule.capability))) {
      if (level === "low") level = "medium";
      reasons.push("adds a control that can activate page actions");
    }
    if (rules.some((rule) => rule.type === "visibility" && rule.action === "hide")) {
      const hidesLargeTarget = Array.from(bindings.values()).some((binding) => {
        const element = dereference(binding.element);
        const rect = element?.getBoundingClientRect?.();
        return rect && rect.width * rect.height > window.innerWidth * window.innerHeight * 0.35;
      });
      if (hidesLargeTarget) {
        if (level === "low") level = "medium";
        reasons.push("hides a large page region");
      }
    }
    if (rules.some((rule) => rule.type === "style" && ("transform" in (rule.styles || {}) || "display" in (rule.styles || {})))) {
      if (level === "low") level = "medium";
      reasons.push("changes layout-sensitive styles");
    }
    return {
      level,
      requiresConfirmation: level !== "low",
      reasons: Array.from(new Set(reasons)),
      summary: reasons.length ? reasons.join("; ") : "visual or accessibility-safe changes only"
    };
  }

  function collectCandidates(query) {
    const queryTokens = tokenize(query);
    const seen = new Set();
    const candidates = [];
    for (const element of document.querySelectorAll(TARGET_SELECTOR)) {
      if (seen.has(element) || isPersoNode(element) || !isVisible(element)) continue;
      seen.add(element);
      const descriptorText = [
        element.tagName,
        element.id,
        element.getAttribute("role"),
        element.getAttribute("aria-label"),
        element.getAttribute("title"),
        element.innerText,
        element.textContent
      ].join(" ").toLowerCase();
      const score = scoreElement(element, descriptorText, queryTokens);
      if (queryTokens.length && score < queryTokens.length * 4) continue;
      candidates.push({ element, score });
    }
    return candidates.sort((left, right) => right.score - left.score);
  }

  function scoreElement(element, haystack, queryTokens) {
    let score = queryTokens.reduce((total, token) => total + (haystack.includes(token) ? 10 : 0), 0);
    const tag = element.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) score += 9 - Number(tag[1]);
    if (element.id) score += 5;
    if (element.getAttribute("aria-label")) score += 4;
    if (["main", "article", "nav", "aside", "button", "a"].includes(tag)) score += 3;
    const rect = element.getBoundingClientRect();
    if (rect.top >= 0 && rect.top < window.innerHeight) score += 2;
    const textLength = normalizeText(element.innerText || element.textContent || "").length;
    if (textLength > 0 && textLength < 180) score += 2;
    if (textLength > 1200) score -= 4;
    return score;
  }

  function describeTarget(element, targetId, score) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      targetId,
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute("role"),
      ariaLabel: normalizeText(element.getAttribute("aria-label") || "").slice(0, 140),
      text: normalizeText(element.innerText || element.textContent || "").slice(0, 220),
      elementIdHint: element.id ? element.id.slice(0, 100) : null,
      bounds: {
        x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width), height: Math.round(rect.height)
      },
      computedStyle: {
        display: style.display,
        color: style.color,
        backgroundColor: style.backgroundColor,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight
      },
      suggestedOperations: suggestedOperations(element),
      relevanceScore: score
    };
  }

  function suggestedOperations(element) {
    const tag = element.tagName.toLowerCase();
    const operations = ["style", "visibility", "attribute"];
    if (["button", "a", "input", "select", "textarea"].includes(tag) || element.getAttribute("role") === "button") {
      operations.push("shortcutButton");
    }
    operations.push("moveElement", "insertElement", "cloneElement", "swapElements");
    return operations;
  }

  function buildUniqueSelectors(element) {
    const candidates = [];
    const tag = element.tagName.toLowerCase();
    if (element.id) candidates.push(`#${cssEscape(element.id)}`);
    for (const name of ["data-testid", "data-test", "aria-label", "name"]) {
      const value = element.getAttribute(name);
      if (value && value.length <= 120) candidates.push(`${tag}[${name}="${escapeAttribute(value)}"]`);
    }
    const classes = Array.from(element.classList || []).filter(isSafeClass).slice(0, 3);
    if (classes.length) candidates.push(`${tag}.${classes.map(cssEscape).join(".")}`);
    const path = buildNthPath(element);
    if (path) candidates.push(path);
    return Array.from(new Set(candidates)).filter((selector) => {
      try {
        const matches = document.querySelectorAll(selector);
        return matches.length === 1 && matches[0] === element;
      } catch (_error) {
        return false;
      }
    }).slice(0, 3);
  }

  function buildNthPath(element) {
    const parts = [];
    let current = element;
    for (let depth = 0; current && current !== document.body && depth < 6; depth += 1) {
      const tag = current.tagName.toLowerCase();
      if (current.id) {
        parts.unshift(`#${cssEscape(current.id)}`);
        break;
      }
      const siblings = current.parentElement ? Array.from(current.parentElement.children).filter((item) => item.tagName === current.tagName) : [];
      const nth = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : "";
      parts.unshift(`${tag}${nth}`);
      current = current.parentElement;
    }
    return parts.length ? parts.join(" > ") : "";
  }

  function fingerprintElement(element) {
    return JSON.stringify({
      tag: element.tagName.toLowerCase(),
      id: element.id || "",
      role: element.getAttribute("role") || "",
      aria: element.getAttribute("aria-label") || "",
      classes: Array.from(element.classList || []).slice(0, 6).sort(),
      text: normalizeText(element.innerText || element.textContent || "").slice(0, 180)
    });
  }

  function rejectBlockedKeys(value, path) {
    if (!value || typeof value !== "object") {
      if (typeof value === "string" && BLOCKED_TEXT_PATTERN.test(value)) throw new Error(`${path} contains blocked executable or HTML content.`);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => rejectBlockedKeys(item, `${path}[${index}]`));
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (BLOCKED_KEY_PATTERN.test(key)) throw new Error(`${path} contains blocked field "${key}".`);
      rejectBlockedKeys(child, `${path}.${key}`);
    }
  }

  function assertOnlyKeys(value, allowed, label) {
    const unknown = Object.keys(value).filter((key) => !allowed.has(key));
    if (unknown.length) throw new Error(`${label} contains unsupported ${unknown.length === 1 ? "field" : "fields"}: ${unknown.join(", ")}.`);
  }

  function cleanText(value, maxLength) {
    if (typeof value !== "string" && typeof value !== "number") throw new Error("Text values must be strings.");
    const text = normalizeText(value).slice(0, maxLength);
    if (BLOCKED_TEXT_PATTERN.test(text)) throw new Error("Text contains blocked executable or HTML content.");
    return text;
  }

  function cleanLabel(value, maxLength) {
    const text = cleanText(value, maxLength);
    if (!text) throw new Error("A non-empty label is required.");
    return text;
  }

  function currentPageKey() {
    return `${location.origin}${location.pathname}${location.search}`;
  }

  function dereference(reference) {
    return typeof WeakRef === "function" && reference instanceof WeakRef ? reference.deref() : reference;
  }

  function pruneSessions() {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (session.expiresAt <= now || session.pageKey !== currentPageKey()) sessions.delete(id);
    }
  }

  function trimSessions() {
    while (sessions.size > MAX_SNAPSHOTS) sessions.delete(sessions.keys().next().value);
  }

  function randomId(prefix) {
    try {
      if (globalThis.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
    } catch (_error) {}
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return `${prefix}_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function tokenize(value) {
    return normalizeText(value).toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 1).slice(0, 12);
  }

  function clampInteger(value, min, max, fallback) {
    const number = Number(value);
    return Number.isInteger(number) ? Math.min(max, Math.max(min, number)) : fallback;
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function isPersoNode(element) {
    return Boolean(element?.id?.startsWith("perso-xxl") || element?.closest?.("[data-perso-xxl-ui], #perso-xxl-panel, [data-perso-xxl-created]"));
  }

  function isSafeClass(value) {
    return typeof value === "string" && value.length > 0 && value.length <= 80 && !/^(?:active|selected|open|closed|hover|focus|css-|jsx-)/i.test(value);
  }

  function cssEscape(value) {
    return globalThis.CSS?.escape ? CSS.escape(String(value)) : String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
  }

  function escapeAttribute(value) {
    return String(value).replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
  }

  return { inspectPage, preparePlan };
})();
