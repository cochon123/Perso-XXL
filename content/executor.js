window.PersoExecutor = (() => {
  const log = window.PersoLogger;
  const STYLE_ID = "perso-xxl-theme";
  const RULE_STYLE_ID = "perso-xxl-css-rules";
  const APPLIED_ATTR = "data-perso-xxl-rule";
  const originalState = new WeakMap();

  function applyPlan(plan, adapter) {
    if (!plan || !adapter) return;
    let totalMatched = 0;

    log.info("executor.apply.started", {
      ruleCount: plan.rules?.length || 0,
      targets: Array.from(new Set((plan.rules || []).map((rule) => rule.target).filter(Boolean)))
    });

    document.documentElement.setAttribute("data-perso-xxl-enabled", "true");
    injectTheme(plan.theme || {});
    clearAppliedState();

    const cssRules = [];

    for (const rule of plan.rules || []) {
      try {
        if (rule.type === "css") {
          cssRules.push(rule.css);
        } else if (rule.type === "style") {
          totalMatched += applyStyleRule(rule, adapter);
        } else if (rule.type === "visibility") {
          totalMatched += applyVisibilityRule(rule, adapter);
        } else if (rule.type === "attribute") {
          totalMatched += applyAttributeRule(rule, adapter);
        }
      } catch (error) {
        log.warn("executor.rule.failed", { ruleId: rule?.id, ruleType: rule?.type, error });
        console.warn("[Perso XXL] Rule failed", rule?.id || rule?.type, error);
      }
    }

    injectCssRules(cssRules);
    log.info("executor.apply.finished", { cssRuleCount: cssRules.length, totalMatched });
    return { totalMatched, cssRuleCount: cssRules.length };
  }

  function revertPlan() {
    log.info("executor.revert.started");

    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(RULE_STYLE_ID)?.remove();
    document.documentElement.removeAttribute("data-perso-xxl-enabled");

    const elements = Array.from(document.querySelectorAll(`[${APPLIED_ATTR}]`));
    for (const element of elements) {
      restoreElement(element);
    }

    log.info("executor.revert.finished", { restoredCount: elements.length });
  }

  function injectTheme(theme) {
    const colors = theme.colors || {};
    const typography = theme.typography || {};
    const css = `
      :root {
        --perso-background: ${safeCssValue(colors.background, "#111111")};
        --perso-surface: ${safeCssValue(colors.surface, "#1f1f1f")};
        --perso-surface-elevated: ${safeCssValue(colors.surfaceElevated, "#2a2a2a")};
        --perso-text: ${safeCssValue(colors.text, "#f5f5f5")};
        --perso-text-muted: ${safeCssValue(colors.textMuted, "#b8b8b8")};
        --perso-accent: ${safeCssValue(colors.accent, "#d99a4e")};
        --perso-font-family: ${safeCssValue(typography.fontFamily, "Inter, Arial, system-ui, sans-serif")};
        --perso-base-font-size: ${safeCssValue(typography.baseFontSize, "15px")};
        --perso-radius: ${safeCssValue(theme.radius, "12px")};
      }
    `;
    upsertStyle(STYLE_ID, css);
  }

  function injectCssRules(cssRules) {
    upsertStyle(RULE_STYLE_ID, cssRules.join("\n"));
  }

  function applyStyleRule(rule, adapter) {
    const elements = adapter.queryTarget(rule.target);
    log.debug("executor.rule.style", {
      ruleId: rule.id,
      target: rule.target,
      matchCount: elements.length,
      matched: summarizeElements(elements)
    });
    for (const element of elements) {
      rememberElement(element);
      mark(element, rule.id);
      if (rule.target === "thumbnail") {
        element.style.overflow = "hidden";
      }
      for (const [key, value] of Object.entries(rule.styles || {})) {
        element.style[key] = value;
      }
    }
    return elements.length;
  }

  function applyVisibilityRule(rule, adapter) {
    const elements = adapter.queryTarget(rule.target);
    log.debug("executor.rule.visibility", { ruleId: rule.id, target: rule.target, action: rule.action, matchCount: elements.length });
    for (const element of elements) {
      rememberElement(element);
      mark(element, rule.id);

      if (rule.action === "hide") {
        element.style.display = "none";
      } else if (rule.action === "show") {
        element.style.display = "";
      } else if (rule.action === "dim") {
        element.style.opacity = "0.45";
      }
    }
    return elements.length;
  }

  function applyAttributeRule(rule, adapter) {
    const elements = adapter.queryTarget(rule.target);
    log.debug("executor.rule.attribute", {
      ruleId: rule.id,
      target: rule.target,
      attribute: rule.attribute,
      value: rule.value,
      matchCount: elements.length
    });
    for (const element of elements) {
      rememberElement(element);
      mark(element, rule.id);

      if (rule.value === false || rule.value === null) {
        element.removeAttribute(rule.attribute);
      } else {
        element.setAttribute(rule.attribute, String(rule.value));
      }
    }
    return elements.length;
  }

  function clearAppliedState() {
    document.querySelectorAll(`[${APPLIED_ATTR}]`).forEach((element) => {
      element.removeAttribute(APPLIED_ATTR);
    });
  }

  function rememberElement(element) {
    if (originalState.has(element)) return;

    originalState.set(element, {
      style: element.getAttribute("style"),
      attributes: {
        theater: element.getAttribute("theater"),
        "mini-guide-visible": element.getAttribute("mini-guide-visible"),
        "guide-persistent-and-visible": element.getAttribute("guide-persistent-and-visible")
      }
    });
  }

  function restoreElement(element) {
    const original = originalState.get(element);

    if (original?.style === null) {
      element.removeAttribute("style");
    } else if (original?.style !== undefined) {
      element.setAttribute("style", original.style);
    }

    for (const [attribute, value] of Object.entries(original?.attributes || {})) {
      if (value === null) {
        element.removeAttribute(attribute);
      } else {
        element.setAttribute(attribute, value);
      }
    }

    element.removeAttribute(APPLIED_ATTR);
    originalState.delete(element);
  }

  function mark(element, ruleId) {
    element.setAttribute(APPLIED_ATTR, ruleId || "anonymous");
  }

  function upsertStyle(id, css) {
    let style = document.getElementById(id);
    if (!style) {
      style = document.createElement("style");
      style.id = id;
      document.documentElement.appendChild(style);
    }
    style.textContent = css;
  }

  function safeCssValue(value, fallback) {
    if (typeof value !== "string") return fallback;
    if (/url\s*\(|@import|javascript:/i.test(value)) return fallback;
    return value;
  }

  function summarizeElements(elements) {
    return elements.slice(0, 8).map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        id: element.id || null,
        classes: Array.from(element.classList || []).slice(0, 4),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    });
  }

  return { applyPlan, revertPlan };
})();
