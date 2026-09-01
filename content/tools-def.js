window.PersoToolsDef = (() => {
  function noop() {}
  const log = window.PersoLogger || { debug: noop, info: noop, warn: noop, error: noop };

  function slugifyToolName(text) {
    const slug = String(text || "tool")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "");
    const prefixed = `pxxl_${slug || "tool"}`.replace(/_+$/g, "");
    const trimmed = prefixed.slice(0, 48).replace(/_+$/g, "");
    return trimmed || "pxxl_tool";
  }

  function uniqueToolName(base, used) {
    if (!used.has(base)) {
      used.add(base);
      return base;
    }

    let index = 2;
    while (index < 100) {
      const suffix = `_${index}`;
      const name = `${base.slice(0, Math.max(1, 48 - suffix.length))}${suffix}`;
      if (!used.has(name)) {
        used.add(name);
        return name;
      }
      index += 1;
    }

    used.add(base);
    return base;
  }

  function safeNotify(notify, event) {
    if (typeof notify !== "function") return;
    try {
      notify(event);
    } catch (_error) {}
  }

  function wrapExecute(name, notify, execute) {
    return async (args, context) => {
      safeNotify(notify, { tool: name, phase: "start" });
      try {
        const result = await execute(args || {}, context);
        safeNotify(notify, { tool: name, phase: "success", detail: result });
        return result;
      } catch (error) {
        if (error?.name === "AbortError") {
          const text = "The operation was cancelled. Nothing was modified.";
          safeNotify(notify, { tool: name, phase: "cancelled", detail: text });
          return text;
        }
        const message = error?.message || String(error);
        const text = `Could not apply that change: ${message}. Nothing was modified.`;
        safeNotify(notify, { tool: name, phase: "error", detail: text });
        return text;
      }
    };
  }

  function joinList(items) {
    if (!items.length) return "";
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
  }

  function extractColor(value) {
    const text = String(value || "").trim();
    const hex = text.match(/#([0-9a-f]{3}|[0-9a-f]{6})\b/i);
    if (hex) {
      let digits = hex[1];
      if (digits.length === 3) digits = digits.split("").map((char) => char + char).join("");
      return {
        r: parseInt(digits.slice(0, 2), 16),
        g: parseInt(digits.slice(2, 4), 16),
        b: parseInt(digits.slice(4, 6), 16)
      };
    }

    const rgb = text.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (rgb) {
      return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
    }

    const named = {
      black: { r: 0, g: 0, b: 0 },
      white: { r: 255, g: 255, b: 255 },
      navy: { r: 0, g: 0, b: 128 },
      midnightblue: { r: 25, g: 25, b: 112 }
    };
    return named[text.toLowerCase()] || null;
  }

  function luminance(color) {
    return (0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) / 255;
  }

  function isLargerFontSize(value) {
    const text = String(value || "").trim();
    const px = text.match(/^([\d.]+)\s*px$/i);
    if (px) return Number(px[1]) >= 17;
    const em = text.match(/^([\d.]+)\s*(em|rem)$/i);
    if (em) return Number(em[1]) >= 1.05;
    const pct = text.match(/^([\d.]+)\s*%$/i);
    if (pct) return Number(pct[1]) >= 105;
    return false;
  }

  function isRoomyLineHeight(value) {
    const text = String(value || "").trim();
    const unitless = Number(text);
    if (text !== "" && Number.isFinite(unitless) && !/[a-z%]/i.test(text)) return unitless >= 1.5;
    const em = text.match(/^([\d.]+)\s*(em|rem)$/i);
    if (em) return Number(em[1]) >= 1.5;
    const pct = text.match(/^([\d.]+)\s*%$/i);
    if (pct) return Number(pct[1]) >= 150;
    return false;
  }

  function normalizeFontFamily(value) {
    return String(value || "")
      .split(",")[0]
      .replace(/["']/g, "")
      .trim();
  }

  function collectTargetHaystack(rule, targetMap) {
    const target = targetMap?.[rule?.targetRef] || {};
    return [
      rule?.targetRef || "",
      ...(target.selectors || []),
      ...(target.fallbackSelectors || [])
    ].join(" ").toLowerCase();
  }

  const HIDE_CATEGORIES = [
    { category: "ads", pattern: /(^|[^\w])(ads?|sponsor|promo|advert(?:isement)?s?)([^\w]|$)/i },
    { category: "sidebars", pattern: /\bsidebars?\b/i },
    { category: "popups", pattern: /\b(popups?|banners?|newsletters?|cookies?)\b/i },
    { category: "comments", pattern: /\bcomments?\b/i },
    { category: "recommendations", pattern: /\b(trending|recommends?|recommendations?|shorts?|widgets?)\b/i }
  ];

  function detectHideCategories(haystack, hides) {
    HIDE_CATEGORIES.forEach((entry) => {
      if (entry.pattern.test(haystack)) hides.add(entry.category);
    });
  }

  function analyzeStyleRule(rule, stats) {
    const styles = rule?.styles;
    if (!styles || typeof styles !== "object") return;

    const background = extractColor(styles.backgroundColor || styles.background);
    const textColor = extractColor(styles.color);
    if (background && luminance(background) < 0.3) stats.darkHits += 1;
    else if (background && textColor && luminance(background) < 0.3 && luminance(textColor) > 0.7) {
      stats.darkHits += 1;
    } else if (textColor && luminance(textColor) > 0.7 && background && luminance(background) < 0.3) {
      stats.darkHits += 1;
    }

    if (isLargerFontSize(styles.fontSize)) stats.largerTextHits += 1;
    if (isRoomyLineHeight(styles.lineHeight)) stats.roomyHits += 1;

    const fontFamily = normalizeFontFamily(styles.fontFamily);
    if (fontFamily) stats.fontCounts.set(fontFamily, (stats.fontCounts.get(fontFamily) || 0) + 1);
  }

  function mostCommon(map) {
    let best = "";
    let bestCount = 0;
    map.forEach((count, key) => {
      if (count > bestCount) {
        best = key;
        bestCount = count;
      }
    });
    return best;
  }

  function formatStyleProfileSummary(preferences, modificationCount, siteCount) {
    if (!modificationCount) {
      return "No saved preferences yet — personalize a page first.";
    }

    const likes = [];
    if (preferences.colorScheme === "dark") likes.push("a dark color scheme");
    if (preferences.textSize === "larger") likes.push("larger text");
    if (preferences.fontFamily) likes.push(`${preferences.fontFamily} as a preferred font`);
    if (preferences.lineSpacing === "roomy") likes.push("generous line spacing");

    let sentence = "";
    if (likes.length && preferences.hides?.length) {
      sentence = `Prefers ${joinList(likes)}; consistently hides ${joinList(preferences.hides)}.`;
    } else if (likes.length) {
      sentence = `Prefers ${joinList(likes)}.`;
    } else if (preferences.hides?.length) {
      sentence = `Consistently hides ${joinList(preferences.hides)}.`;
    } else {
      sentence = "Has saved personalizations, but no strong shared style pattern stood out yet.";
    }

    const siteNoun = siteCount === 1 ? "site" : "sites";
    const modNoun = modificationCount === 1 ? "personalization" : "personalizations";
    return `${sentence} Distilled from ${modificationCount} ${modNoun} across ${siteCount} ${siteNoun}.`;
  }

  function promptFromPreferences(preferences) {
    const bits = [];
    if (preferences.colorScheme === "dark") bits.push("dark color scheme");
    if (preferences.textSize === "larger") bits.push("larger text (about 120%)");
    if (preferences.fontFamily) bits.push(`font family ${preferences.fontFamily}`);
    if (preferences.lineSpacing === "roomy") bits.push("generous line spacing");
    if (preferences.hides?.length) bits.push(`hide ${preferences.hides.join("/")} clutter`);
    if (!bits.length) return "";
    return `Apply my usual preferences to this page: ${bits.join(", ")}.`;
  }

  function buildStyleProfile(records) {
    const list = Array.isArray(records) ? records : [];
    const siteKeys = new Set();
    const hides = new Set();
    const stats = {
      darkHits: 0,
      largerTextHits: 0,
      roomyHits: 0,
      fontCounts: new Map()
    };
    let modificationCount = 0;

    list.forEach((entry) => {
      const record = entry?.record || entry;
      if (!record || typeof record !== "object") return;
      const siteKey = record.site?.hostname || entry?.key || record.site?.url;
      if (siteKey) siteKeys.add(siteKey);

      (record.modifications || []).forEach((modification) => {
        if (modification?.enabled === false) return;
        modificationCount += 1;
        const plan = modification.plan || {};
        const targetMap = plan.targetMap || {};
        (plan.rules || []).forEach((rule) => {
          if (rule?.type === "style") analyzeStyleRule(rule, stats);
          const isHide = rule?.type === "visibility" && (rule.action === "hide" || !rule.action);
          if (isHide) detectHideCategories(collectTargetHaystack(rule, targetMap), hides);
        });
      });
    });

    const preferences = {};
    if (stats.darkHits > 0) preferences.colorScheme = "dark";
    if (stats.largerTextHits > 0) preferences.textSize = "larger";
    const fontFamily = mostCommon(stats.fontCounts);
    if (fontFamily) preferences.fontFamily = fontFamily;
    if (stats.roomyHits > 0) preferences.lineSpacing = "roomy";
    if (hides.size) preferences.hides = Array.from(hides);

    const siteCount = siteKeys.size;
    return {
      summary: formatStyleProfileSummary(preferences, modificationCount, siteCount),
      preferences,
      siteCount,
      modificationCount
    };
  }

  function buildCoreTools(host, options = {}) {
    const notify = options.notify;

    return [
      {
        name: "inspect_page",
        description: "Inspect the current page for direct agent personalization. Returns a short-lived, one-use snapshotId and opaque targetId values with semantic text, bounds, and computed styles. Call this immediately before apply_page_plan. Never invent target IDs and never use selectors.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Optional concise description of the elements needed, for example 'main article heading and sidebar'. Leave empty for a broad page map."
            },
            maxTargets: {
              type: "integer",
              minimum: 10,
              maximum: 120,
              description: "Maximum number of safe targets to return. Defaults to 60."
            }
          },
          additionalProperties: false
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: false
        },
        execute: wrapExecute("inspect_page", notify, async (args) => {
          const result = await host.inspectPage({ query: args.query, maxTargets: args.maxTargets });
          return JSON.stringify(result);
        })
      },
      {
        name: "apply_page_plan",
        description: "Apply a direct agent-authored personalization without another AI call. Requires a fresh snapshotId from inspect_page and only opaque targetId values returned by that snapshot. Plans are locally allowlist-validated, target-freshness checked, atomic, reversible, persisted, cancellable, and human-confirmed when structurally or behaviorally sensitive. Raw selectors, CSS blocks, HTML, scripts, event handlers, and page-text rewriting are refused.",
        inputSchema: {
          type: "object",
          properties: {
            snapshotId: { type: "string", description: "Fresh one-use snapshotId returned by inspect_page" },
            title: { type: "string", description: "Short user-facing name for the saved personalization" },
            rationale: { type: "string", description: "Brief explanation of how these rules satisfy the user's request" },
            rules: {
              type: "array",
              minItems: 1,
              maxItems: 20,
              description: "Validated rules. Every rule uses targetId, never selectors. For type style use styles. For visibility use action hide/show/dim. For attribute only aria-label/title/role are allowed. Capabilities may use placementTargetId, sourceTargetId, sourceActionTargetId, otherTargetId, or menuTargetId as described by the capability.",
              items: {
                type: "object",
                properties: {
                  type: { type: "string", enum: ["style", "visibility", "attribute", "capability"] },
                  targetId: { type: "string" },
                  styles: { type: "object", additionalProperties: { type: "string" } },
                  action: { type: "string", enum: ["hide", "show", "dim"] },
                  attribute: { type: "string", enum: ["aria-label", "title", "role"] },
                  value: { type: ["string", "boolean", "null"] },
                  capability: { type: "string", enum: ["scrollLock", "shortcutButton", "moveElement", "insertElement", "cloneElement", "swapElements", "menuShortcut"] },
                  placement: { type: "string", enum: ["append", "prepend", "before", "after", "replace"] },
                  placementTargetId: { type: "string" },
                  sourceTargetId: { type: "string" },
                  sourceActionTargetId: { type: "string" },
                  otherTargetId: { type: "string" },
                  menuTargetId: { type: "string" },
                  label: { type: "string" },
                  actionText: { type: "string" },
                  text: { type: "string" },
                  element: {
                    type: "object",
                    description: "Safe inserted element descriptor: tag, text, allowlisted attributes/styles, and optional children. HTML is never accepted."
                  }
                },
                required: ["type", "targetId"],
                additionalProperties: false
              }
            }
          },
          required: ["snapshotId", "title", "rules"],
          additionalProperties: false
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false
        },
        execute: wrapExecute("apply_page_plan", notify, async (args, context) => {
          const result = await host.applyDirectPlan({
            ...args,
            signal: context?.signal,
            onProgress: (stage) => {
              safeNotify(notify, { tool: "apply_page_plan", phase: "progress", detail: stage });
            }
          });
          return JSON.stringify(result);
        })
      },
      {
        name: "personalize_page",
        description: "Fallback for clients that cannot inspect targets and author structured plans: send a plain-English request to Perso XXL's configured planning service, then validate and apply the result. Capable agents should prefer inspect_page followed by apply_page_plan to avoid a second AI call. Changes are reversible and persist; structural edits ask the user to confirm.",
        inputSchema: {
          type: "object",
          properties: {
            request: {
              type: "string",
              description: "Plain-English description of how to change this page"
            },
            intensity: {
              type: "string",
              enum: ["subtle", "standard", "bold"]
            }
          },
          required: ["request"]
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false
        },
        execute: wrapExecute("personalize_page", notify, async (args, context) => {
          const result = await host.personalize({
            prompt: args.request,
            intensity: args.intensity,
            signal: context?.signal,
            requireConfirmation: true,
            onProgress: (stage) => {
              safeNotify(notify, { tool: "personalize_page", phase: "progress", detail: stage });
            }
          });
          return result?.summary || "The page was personalized.";
        })
      },
      {
        name: "list_personalizations",
        description: "List the saved personalizations for this page, including id, title, enabled/disabled state, and a short rule summary. Read-only and reversible-safe: it does not change the page. Changes already saved persist across visits. If the list is empty, suggest personalize_page.",
        inputSchema: {
          type: "object",
          properties: {}
        },
        annotations: {
          readOnlyHint: true
        },
        execute: wrapExecute("list_personalizations", notify, async () => {
          const modifications = await host.listModifications();
          const list = Array.isArray(modifications) ? modifications : [];
          if (!list.length) {
            return "There are no saved personalizations on this page yet. Use personalize_page to describe the change you want.";
          }

          const lines = list.map((modification, index) => {
            const state = modification.enabled ? "enabled" : "disabled";
            return `${index + 1}. ${modification.title} — ${state}; id ${modification.id}; ${modification.ruleSummary}`;
          });
          return `Saved personalizations on this page:\n${lines.join("\n")}`;
        })
      },
      {
        name: "toggle_personalization",
        description: "Enable or disable a saved personalization on this page by id. The change is validated against the current page, immediately reversible, and persists across visits. Disabling also unregisters any tool that personalization created, such as shortcut or menu-shortcut tools. Prefer this over remove_personalization when the user may want the change later.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Saved personalization id" },
            enabled: { type: "boolean", description: "True to enable, false to disable" }
          },
          required: ["id", "enabled"]
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false
        },
        execute: wrapExecute("toggle_personalization", notify, async (args) => {
          const result = await host.setModificationEnabled(args.id, args.enabled);
          const title = result?.title || args.id;
          return result?.enabled
            ? `Enabled "${title}". It will keep applying on future visits.`
            : `Disabled "${title}". Shortcut tools from this personalization are no longer available until it is enabled again.`;
        })
      },
      {
        name: "undo_last",
        description: "Disable the most recently created active personalization on this page. The change is reversible — the personalization stays saved and can be turned back on with toggle_personalization — and the disabled state persists across visits. Use when the user says undo.",
        inputSchema: {
          type: "object",
          properties: {}
        },
        annotations: {
          readOnlyHint: false,
          idempotentHint: false
        },
        execute: wrapExecute("undo_last", notify, async () => {
          const result = await host.undoLast();
          if (!result?.undone) return "There are no active personalizations to undo.";
          return `Undid "${result.undone.title}". It is saved and can be turned back on.`;
        })
      },
      {
        name: "remove_personalization",
        description: "Permanently delete a saved personalization by id. It will not reapply on future visits. Prefer toggle_personalization to disable a change while keeping it available. Deletion is immediate and cannot be undone except by personalizing the page again.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "string", description: "Saved personalization id to delete" }
          },
          required: ["id"]
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false
        },
        execute: wrapExecute("remove_personalization", notify, async (args) => {
          const result = await host.removeModification(args.id);
          if (!result?.removed) return "That personalization was not found, so nothing was deleted.";
          return `Removed "${result.removed}". It will not reapply on future visits.`;
        })
      },
      {
        name: "get_style_profile",
        description: "Read-only summary of the user's usual personalization preferences, distilled from saved changes across all sites. Does not change this page. Preferences persist across visits once saved. Use before apply_style_profile or when the user asks what they usually like.",
        inputSchema: {
          type: "object",
          properties: {}
        },
        annotations: {
          readOnlyHint: true
        },
        execute: wrapExecute("get_style_profile", notify, async () => {
          const records = await host.getAllSiteRecords();
          const list = Array.isArray(records) ? records : [];
          if (!list.length) return "No saved preferences yet — personalize a page first.";
          const profile = buildStyleProfile(list);
          if (!profile.modificationCount) return "No saved preferences yet — personalize a page first.";
          return `${profile.summary}\n${JSON.stringify(profile.preferences)}`;
        })
      },
      {
        name: "apply_style_profile",
        description: "Fallback one-call profile application using Perso XXL's configured planning service. Capable agents should call get_style_profile, inspect_page, and apply_page_plan directly. Distills saved preferences such as color scheme, text size, spacing, and hidden clutter into a validated, reversible personalization.",
        inputSchema: {
          type: "object",
          properties: {}
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false
        },
        execute: wrapExecute("apply_style_profile", notify, async (_args, context) => {
          const records = await host.getAllSiteRecords();
          const list = Array.isArray(records) ? records : [];
          if (!list.length) return "No saved preferences yet — personalize a page first.";
          const profile = buildStyleProfile(list);
          const prompt = promptFromPreferences(profile.preferences);
          if (!prompt) return "No saved preferences yet — personalize a page first.";
          const result = await host.personalize({
            prompt,
            requireConfirmation: true,
            signal: context?.signal,
            onProgress: (stage) => {
              safeNotify(notify, { tool: "apply_style_profile", phase: "progress", detail: stage });
            }
          });
          return result?.summary || "Applied the user's usual preferences to this page.";
        })
      }
    ];
  }

  function buildDynamicTools(host, modifications, options = {}) {
    const notify = options.notify;
    const used = new Set();
    const tools = [];

    (modifications || []).forEach((modification) => {
      if (modification?.enabled !== true) return;
      (modification.capabilities || []).forEach((capability) => {
        const label = capability.label || capability.actionText || modification.title;
        const name = uniqueToolName(slugifyToolName(label), used);
        tools.push({
          name,
          description: `Runs the user's saved shortcut "${label}" on this page (from their personalization "${modification.title}"). Created by the user via Perso XXL; clicking is performed on the real page controls.`,
          inputSchema: {
            type: "object",
            properties: {}
          },
          annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true
          },
          execute: wrapExecute(name, notify, async () => {
            const result = await host.invokeCapability(modification.id, capability.ruleId);
            return result?.message || (result?.ok
              ? `Clicked the "${label}" shortcut.`
              : "Shortcut button is not present on the page.");
          })
        });
      });
    });

    return tools;
  }

  async function registerTools(modelContext, tools, { signal } = {}) {
    const context = modelContext || globalThis.document?.modelContext || globalThis.navigator?.modelContext;
    if (!context?.registerTool) {
      log.warn("tools.register.missing_context", {});
      return 0;
    }

    let count = 0;
    for (const tool of tools || []) {
      if (signal?.aborted) break;
      try {
        await context.registerTool(tool, { signal });
        count += 1;
      } catch (error) {
        log.warn("tools.register.failed", {
          name: tool?.name,
          error: error?.message || String(error)
        });
      }
    }

    return count;
  }

  return {
    buildCoreTools,
    buildDynamicTools,
    buildStyleProfile,
    slugifyToolName,
    registerTools
  };
})();
