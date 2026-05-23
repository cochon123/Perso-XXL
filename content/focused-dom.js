window.PersoDomCollector = (() => {
  const DEFAULT_SELECTORS = [
    "header",
    "nav",
    "main",
    "aside",
    "button",
    "a",
    "img",
    "picture",
    "video",
    "canvas",
    "input",
    "textarea",
    "select",
    "[role='button']",
    "[role='navigation']",
    "[role='main']",
    "[role='img']",
    "[class*='card' i]",
    "[class*='thumbnail' i]",
    "[class*='image' i]",
    "[class*='media' i]"
  ];

  function collectFocusedDom(strategy = {}) {
    const selectors = normalizeSelectors(strategy);
    const rawCandidates = selectors.flatMap((selector) => {
      try {
        return Array.from(document.querySelectorAll(selector)).map((element) => ({ element, selector }));
      } catch (_error) {
        return [];
      }
    });

    const candidates = uniqueByElement(rawCandidates)
      .filter(({ element }) => isUsableElement(element, strategy))
      .slice(0, strategy.maxCandidates || 80)
      .map(({ element, selector }, index) => summarizeCandidate(element, selector, index, strategy));

    const targetMap = buildTargetMap(candidates, strategy);

    return {
      page: {
        url: location.href,
        hostname: location.hostname,
        title: document.title,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      },
      collectionStrategy: {
        selectors,
        includeAncestors: strategy.includeAncestors ?? 3,
        includeVisibleOnly: strategy.includeVisibleOnly !== false,
        maxCandidates: strategy.maxCandidates || 80
      },
      candidates,
      targetMap
    };
  }

  function normalizeSelectors(strategy) {
    const selectors = [
      ...(strategy.includeSelectors || []),
      ...selectorsForKinds(strategy.candidateKinds || []),
      ...selectorsForConcepts(strategy.targetConcepts || [])
    ];

    return Array.from(new Set(selectors.length ? selectors : DEFAULT_SELECTORS));
  }

  function selectorsForKinds(kinds) {
    const values = [];

    if (kinds.includes("image") || kinds.includes("media")) {
      values.push("img", "picture", "video", "canvas", "[role='img']", "a img", "img[src]");
    }

    if (kinds.includes("card")) {
      values.push("article", "li", "[class*='card' i]", "[class*='item' i]", "[class*='tile' i]");
    }

    if (kinds.includes("button") || kinds.includes("control")) {
      values.push("button", "[role='button']", "input[type='button']", "input[type='submit']");
    }

    if (kinds.includes("text")) {
      values.push("h1", "h2", "h3", "p", "span", "a");
    }

    if (kinds.includes("layout") || kinds.includes("region")) {
      values.push("html", "body", "header", "nav", "main", "aside", "section", "footer", "#app", "#root", "ytd-app", "ytd-page-manager#page-manager");
    }

    return values;
  }

  function selectorsForConcepts(concepts) {
    const joined = concepts.join(" ").toLowerCase();
    const values = [];

    if (/thumbnail|image|photo|avatar|picture|media/.test(joined)) {
      values.push(
        "img",
        "a img",
        "picture img",
        "[role='img']",
        "[class*='thumbnail' i]",
        "[class*='thumb' i]",
        "[class*='image' i]",
        "[class*='media' i]",
        "img[src*='ytimg.com']",
        "img[src*='i.ytimg.com']",
        "ytd-thumbnail",
        "ytd-thumbnail img",
        "a#thumbnail img"
      );
    }

    if (/button|cta|control|tab|chip/.test(joined)) {
      values.push("button", "[role='button']", "[class*='button' i]", "[class*='chip' i]");
    }

    if (/card|tile|post|item|feed/.test(joined)) {
      values.push("article", "li", "[class*='card' i]", "[class*='tile' i]", "[class*='item' i]");
    }

    if (/background|page|wallpaper/.test(joined)) {
      values.push("html", "body", "main", "#app", "#root", "ytd-app", "ytd-page-manager#page-manager");
    }

    return values;
  }

  function summarizeCandidate(element, matchedSelector, index, strategy) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const candidateId = `candidate_${index + 1}`;
    const selector = getSelectorForElement(element, matchedSelector);

    return {
      candidateId,
      kind: inferKind(element),
      tag: element.tagName.toLowerCase(),
      selector,
      matchedSelector,
      textSample: normalizeText(element.innerText || element.alt || element.ariaLabel || "").slice(0, 120),
      bounds: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      computedStyle: {
        display: style.display,
        color: style.color,
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius,
        overflow: style.overflow,
        objectFit: style.objectFit,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize
      },
      ancestorChain: getAncestorChain(element, strategy.includeAncestors ?? 3),
      nearbyText: getNearbyText(element)
    };
  }

  function buildTargetMap(candidates, strategy) {
    const targetName = normalizeTargetName(strategy.targetConcepts?.[0] || strategy.candidateKinds?.[0] || "selection");
    const selectors = Array.from(new Set(candidates.map((candidate) => candidate.selector).filter(Boolean))).slice(0, 20);
    const finalSelectors = targetName === "background" || targetName === "page"
      ? prioritizeBackgroundSelectors(selectors)
      : selectors;

    return {
      [targetName]: {
        source: "focused-dom",
        selectors: finalSelectors,
        confidence: candidates.length ? 0.75 : 0.1,
        candidateIds: candidates.map((candidate) => candidate.candidateId)
      }
    };
  }

  function prioritizeBackgroundSelectors(selectors) {
    return Array.from(new Set([
      "html",
      "body",
      "ytd-app",
      "ytd-page-manager#page-manager",
      "main",
      "#app",
      "#root",
      ...selectors
    ])).slice(0, 20);
  }

  function isUsableElement(element, strategy) {
    if (element.closest?.("#perso-xxl-panel")) return false;
    if (strategy.includeVisibleOnly === false) return true;

    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 8 &&
      rect.height > 8 &&
      rect.bottom >= 0 &&
      rect.right >= 0 &&
      rect.top <= window.innerHeight &&
      rect.left <= window.innerWidth &&
      style.display !== "none" &&
      style.visibility !== "hidden";
  }

  function inferKind(element) {
    const tag = element.tagName.toLowerCase();
    if (["img", "picture", "video", "canvas"].includes(tag)) return "media";
    if (["button", "input", "select", "textarea"].includes(tag) || element.getAttribute("role") === "button") return "control";
    if (["header", "nav", "main", "aside", "footer", "section"].includes(tag)) return "region";
    if (["h1", "h2", "h3", "p", "span", "a"].includes(tag)) return "text";
    return "element";
  }

  function getSelectorForElement(element, fallback) {
    if (element.id && !/^\d/.test(element.id)) return `${element.tagName.toLowerCase()}#${CSS.escape(element.id)}`;

    const tag = element.tagName.toLowerCase();
    const stableClass = Array.from(element.classList || []).find((className) => className.length > 2 && !/\d{4,}/.test(className));
    if (stableClass) return `${tag}.${CSS.escape(stableClass)}`;

    const src = element.getAttribute("src");
    if (tag === "img" && src?.includes("ytimg.com")) return "img[src*='ytimg.com']";
    if (tag === "img") return "img";

    return fallback || tag;
  }

  function getAncestorChain(element, depth) {
    const chain = [];
    let current = element.parentElement;

    while (current && chain.length < depth && current !== document.documentElement) {
      chain.push({
        tag: current.tagName.toLowerCase(),
        id: current.id || null,
        classes: Array.from(current.classList || []).slice(0, 5),
        role: current.getAttribute("role")
      });
      current = current.parentElement;
    }

    return chain;
  }

  function getNearbyText(element) {
    const parent = element.closest("article, li, section, div") || element.parentElement;
    return normalizeText(parent?.innerText || "").slice(0, 180);
  }

  function uniqueByElement(items) {
    const seen = new Set();
    return items.filter((item) => {
      if (seen.has(item.element)) return false;
      seen.add(item.element);
      return true;
    });
  }

  function normalizeTargetName(value) {
    return String(value || "selection")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "selection";
  }

  function normalizeText(value) {
    return value.replace(/\s+/g, " ").trim();
  }

  return { collectFocusedDom };
})();
