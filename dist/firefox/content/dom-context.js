window.PersoDomContext = (() => {
  const MAX_PAGE_NODES = 220;
  const MAX_HIDDEN_INTERACTIVE_NODES = 80;
  const MAX_DEPTH = 10;
  const MAX_HTML_LENGTH = 1800;
  const MAX_HIERARCHY_LEVELS = 5;
  const DECORATIVE_CLASS_PATTERN = /touch|feedback|ripple|overlay|shapefill|shapestroke|hitarea|scrubber|skeleton|placeholder/i;
  const INTERACTIVE_TAGS = new Set(["button", "a", "input", "select", "textarea", "label"]);
  const INTERACTIVE_ROLES = new Set(["button", "tab", "link", "menuitem", "option", "checkbox", "radio"]);

  function collectPageDom(options = {}) {
    const maxNodes = options.maxNodes || MAX_PAGE_NODES;
    const nodes = [];
    let count = 0;

    walkElement(document.body, 0, maxNodes, nodes, () => {
      count += 1;
      return count <= maxNodes;
    });

    return {
      url: location.href,
      hostname: location.hostname,
      pathname: location.pathname,
      title: document.title,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      },
      nodeCount: nodes.length,
      nodes,
      hiddenInteractiveNodes: collectHiddenInteractiveNodes(MAX_HIDDEN_INTERACTIVE_NODES)
    };
  }

  function walkElement(element, depth, maxNodes, nodes, shouldContinue) {
    if (!element || depth > MAX_DEPTH || !shouldContinue()) return;

    if (isPersoNode(element)) {
      for (const child of element.children) {
        walkElement(child, depth, maxNodes, nodes, shouldContinue);
      }
      return;
    }

    if (!isVisible(element)) return;

    nodes.push(summarizeNode(element, depth));

    for (const child of element.children) {
      walkElement(child, depth + 1, maxNodes, nodes, shouldContinue);
      if (!shouldContinue()) break;
    }
  }

  function buildSelection(element, selectionId) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const hierarchyCandidates = buildHierarchyCandidates(element);
    const semanticTarget = resolveSemanticTarget(element, hierarchyCandidates);

    return {
      id: selectionId,
      tag: element.tagName.toLowerCase(),
      idAttr: element.id || null,
      classes: Array.from(element.classList || []).slice(0, 8),
      role: element.getAttribute("role"),
      ariaLabel: element.getAttribute("aria-label"),
      title: element.getAttribute("title"),
      href: element.getAttribute("href"),
      text: normalizeText(element.innerText || element.textContent || "").slice(0, 240),
      elementKind: classifyElement(element),
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
        fontSize: style.fontSize,
        fontFamily: style.fontFamily,
        borderRadius: style.borderRadius
      },
      outerHTML: truncateHtml(element.outerHTML),
      ancestorChain: getAncestorChain(element, 6),
      hierarchyCandidates,
      semanticTarget,
      siblingContext: getSiblingContext(element),
      nearbyText: getNearbyText(element),
      selectorHints: buildSelectorHints(element),
      fingerprint: buildFingerprint(element)
    };
  }

  function buildHierarchyCandidates(element) {
    const candidates = [];
    let current = element;

    for (let levelsUp = 0; levelsUp <= MAX_HIERARCHY_LEVELS && current && current !== document.body; levelsUp += 1) {
      const profile = profileElement(current);
      candidates.push({
        levelsUp,
        tag: current.tagName.toLowerCase(),
        id: current.id || null,
        classes: Array.from(current.classList || []).slice(0, 6),
        role: current.getAttribute("role"),
        ariaLabel: current.getAttribute("aria-label"),
        text: profile.visibleText.slice(0, 120),
        elementKind: profile.kind,
        isDecorative: profile.isDecorative,
        isInteractive: profile.isInteractive,
        hasVisibleText: profile.hasVisibleText,
        selectorHints: buildSelectorHints(current).slice(0, 4)
      });
      current = current.parentElement;
    }

    return candidates;
  }

  function resolveSemanticTarget(element, hierarchyCandidates = buildHierarchyCandidates(element)) {
    const ranked = hierarchyCandidates
      .map((candidate) => ({
        ...candidate,
        score: scoreHierarchyCandidate(candidate)
      }))
      .sort((left, right) => right.score - left.score);

    const best = ranked[0] || hierarchyCandidates[0];
    if (!best) {
      return {
        levelsUp: 0,
        reason: "Use the clicked element."
      };
    }

    return {
      levelsUp: best.levelsUp,
      tag: best.tag,
      id: best.id,
      classes: best.classes,
      role: best.role,
      ariaLabel: best.ariaLabel,
      text: best.text,
      elementKind: best.elementKind,
      selectorHints: best.selectorHints,
      reason: describeSemanticReason(element, best)
    };
  }

  function scoreHierarchyCandidate(candidate) {
    let score = 0;

    if (candidate.isInteractive) score += 8;
    if (candidate.hasVisibleText) score += 7;
    if (candidate.elementKind === "text") score += 6;
    if (candidate.elementKind === "component") score += 5;
    if (candidate.ariaLabel) score += 4;
    if (candidate.id) score += 3;
    if (candidate.isDecorative) score -= 10;
    if (candidate.levelsUp === 0 && candidate.isDecorative) score -= 4;
    score -= candidate.levelsUp * 0.5;

    return score;
  }

  function describeSemanticReason(element, target) {
    const picked = profileElement(element);

    if (target.levelsUp === 0) {
      return picked.isDecorative
        ? "Clicked node looks decorative; consider walking up to a parent with text or controls."
        : "Clicked node already looks like the intended target.";
    }

    if (picked.isDecorative && target.hasVisibleText) {
      return `Clicked node looks decorative; parent ${target.levelsUp} level(s) up contains the visible label or control.`;
    }

    if (picked.isDecorative && target.isInteractive) {
      return `Clicked node looks decorative; parent ${target.levelsUp} level(s) up is the interactive control.`;
    }

    return `Parent ${target.levelsUp} level(s) up is likely what the user meant to modify.`;
  }

  function profileElement(element) {
    const classes = Array.from(element.classList || []);
    const role = element.getAttribute("role");
    const tag = element.tagName.toLowerCase();
    const visibleText = normalizeText(getDirectVisibleText(element) || element.innerText || element.textContent || "");
    const isDecorative = isDecorativeElement(element, classes, visibleText);
    const isInteractive = INTERACTIVE_TAGS.has(tag) || INTERACTIVE_ROLES.has(role || "");
    const hasVisibleText = visibleText.length > 0 && !isDecorative;

    return {
      kind: classifyElement(element, { classes, role, tag, visibleText, isDecorative, isInteractive, hasVisibleText }),
      visibleText,
      isDecorative,
      isInteractive,
      hasVisibleText
    };
  }

  function classifyElement(element, profile = profileElement(element)) {
    if (profile.isInteractive) return "interactive";
    if (profile.hasVisibleText) return "text";
    if (profile.isDecorative) return "decorative";
    if (element.tagName.includes("-")) return "component";
    return "container";
  }

  function isDecorativeElement(element, classes, visibleText) {
    const tag = element.tagName.toLowerCase();
    const ariaHidden = element.getAttribute("aria-hidden") === "true";
    const classJoined = classes.join(" ");

    if (ariaHidden) return true;
    if (DECORATIVE_CLASS_PATTERN.test(classJoined)) return true;
    if (tag.includes("touch-feedback") || tag.includes("feedback-shape")) return true;
    if (!visibleText && classes.some((className) => DECORATIVE_CLASS_PATTERN.test(className))) return true;

    return false;
  }

  function getDirectVisibleText(element) {
    let text = "";

    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || "";
      } else if (node.nodeType === Node.ELEMENT_NODE && !isDecorativeElement(node, Array.from(node.classList || []), "")) {
        const childText = normalizeText(node.innerText || node.textContent || "");
        if (childText.length > 0 && childText.length <= 120) {
          text += `${childText} `;
        }
      }
    }

    return normalizeText(text);
  }

  function summarizeNode(element, depth) {
    const rect = element.getBoundingClientRect();
    const text = normalizeText(element.innerText || element.textContent || "");

    return {
      depth,
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      classes: Array.from(element.classList || []).slice(0, 4),
      role: element.getAttribute("role"),
      ariaLabel: element.getAttribute("aria-label"),
      dataTestId: element.getAttribute("data-testid"),
      dataChannel: element.getAttribute("data-channel"),
      dataSponsored: element.getAttribute("data-sponsored"),
      text: text.slice(0, 80),
      childCount: element.children.length,
      bounds: {
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      },
      selectorHints: buildSelectorHints(element).slice(0, 5),
      semanticContainer: summarizeSemanticContainer(element)
    };
  }

  function collectHiddenInteractiveNodes(maxNodes) {
    const selector = [
      "button",
      "a",
      "input",
      "select",
      "textarea",
      "[role='button']",
      "[role='menu']",
      "[role='menuitem']",
      "[role='option']",
      "[aria-label]",
      "[aria-haspopup]"
    ].join(",");

    const candidates = [];

    for (const element of Array.from(document.body.querySelectorAll(selector))) {
      if (candidates.length >= maxNodes) break;
      if (isPersoNode(element) || isVisible(element)) continue;

      const text = normalizeText(element.innerText || element.textContent || "");
      const ariaLabel = element.getAttribute("aria-label");
      const title = element.getAttribute("title");
      if (!text && !ariaLabel && !title) continue;

      candidates.push({
        tag: element.tagName.toLowerCase(),
        id: element.id || null,
        classes: Array.from(element.classList || []).slice(0, 4),
        role: element.getAttribute("role"),
        ariaLabel,
        title,
        text: text.slice(0, 80),
        ariaHaspopup: element.getAttribute("aria-haspopup"),
        selectorHints: buildSelectorHints(element).slice(0, 4),
        ancestorChain: getAncestorChain(element, 4)
      });
    }

    return candidates;
  }

  function buildSelectorHints(element) {
    const hints = [];

    if (element.id && !/^\d/.test(element.id)) {
      hints.push(`#${CSS.escape(element.id)}`);
    }

    const ariaLabel = element.getAttribute("aria-label");
    if (ariaLabel) {
      hints.push(`${element.tagName.toLowerCase()}[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]`);
    }

    const testId = element.getAttribute("data-testid");
    if (testId) {
      hints.push(`[data-testid="${testId.replace(/"/g, '\\"')}"]`);
    }

    const dataChannel = element.getAttribute("data-channel");
    if (dataChannel) {
      hints.push(`${element.tagName.toLowerCase()}[data-channel="${dataChannel.replace(/"/g, '\\"')}"]`);
    }

    const dataSponsored = element.getAttribute("data-sponsored");
    if (dataSponsored) {
      hints.push(`${element.tagName.toLowerCase()}[data-sponsored="${dataSponsored.replace(/"/g, '\\"')}"]`);
    }

    for (const className of Array.from(element.classList || []).slice(0, 3)) {
      if (className.length > 2) {
        hints.push(`${element.tagName.toLowerCase()}.${CSS.escape(className)}`);
      }
    }

    const classSelector = Array.from(element.classList || [])
      .filter((className) => className.length > 2)
      .slice(0, 2)
      .map((className) => `.${CSS.escape(className)}`)
      .join("");
    if (classSelector) {
      hints.push(`${element.tagName.toLowerCase()}${classSelector}`);
    }

    hints.push(buildNthChildPath(element));

    return Array.from(new Set(hints)).slice(0, 8);
  }

  function summarizeSemanticContainer(element) {
    const container = findSemanticContainer(element);
    if (!container || container === element) return null;

    return {
      tag: container.tagName.toLowerCase(),
      id: container.id || null,
      classes: Array.from(container.classList || []).slice(0, 4),
      role: container.getAttribute("role"),
      ariaLabel: container.getAttribute("aria-label"),
      dataTestId: container.getAttribute("data-testid"),
      dataChannel: container.getAttribute("data-channel"),
      dataSponsored: container.getAttribute("data-sponsored"),
      text: normalizeText(container.innerText || container.textContent || "").slice(0, 120),
      selectorHints: buildSelectorHints(container).slice(0, 5),
      reason: "Nearest content/card ancestor. For feed filtering or hiding matching content, target this container instead of only the inner label."
    };
  }

  function findSemanticContainer(element) {
    let current = element?.parentElement;
    while (current && current !== document.body) {
      if (isSemanticContainer(current)) return current;
      current = current.parentElement;
    }
    return null;
  }

  function isSemanticContainer(element) {
    const tag = element.tagName.toLowerCase();
    const classes = Array.from(element.classList || []);
    return ["article", "li", "section"].includes(tag) ||
      classes.some((className) => /card|item|result|row|tile|entry/i.test(className)) ||
      Boolean(
        element.getAttribute("data-channel") ||
        element.getAttribute("data-sponsored") ||
        element.getAttribute("data-testid")
      );
  }

  function buildNthChildPath(element, maxDepth = 5) {
    const parts = [];
    let current = element;

    while (current && current !== document.body && parts.length < maxDepth) {
      const tag = current.tagName.toLowerCase();
      const parent = current.parentElement;
      if (!parent) break;

      const siblings = Array.from(parent.children).filter((child) => child.tagName === current.tagName);
      const index = siblings.indexOf(current) + 1;
      parts.unshift(`${tag}:nth-of-type(${index})`);
      current = parent;
    }

    return parts.join(" > ");
  }

  function buildFingerprint(element) {
    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || null,
      classes: Array.from(element.classList || []).slice(0, 6),
      role: element.getAttribute("role"),
      ariaLabel: element.getAttribute("aria-label"),
      textSample: normalizeText(element.innerText || element.textContent || "").slice(0, 120),
      ancestorTags: getAncestorChain(element, 4).map((node) => node.tag)
    };
  }

  function getAncestorChain(element, depth) {
    const chain = [];
    let current = element.parentElement;

    while (current && chain.length < depth && current !== document.documentElement) {
      chain.push({
        tag: current.tagName.toLowerCase(),
        id: current.id || null,
        classes: Array.from(current.classList || []).slice(0, 5),
        role: current.getAttribute("role"),
        ariaLabel: current.getAttribute("aria-label")
      });
      current = current.parentElement;
    }

    return chain;
  }

  function getSiblingContext(element) {
    const parent = element.parentElement;
    if (!parent) return { index: 0, total: 1, previousText: "", nextText: "" };

    const siblings = Array.from(parent.children).filter((child) => child.nodeType === Node.ELEMENT_NODE);
    const index = siblings.indexOf(element);

    return {
      index,
      total: siblings.length,
      previousText: normalizeText(siblings[index - 1]?.innerText || "").slice(0, 80),
      nextText: normalizeText(siblings[index + 1]?.innerText || "").slice(0, 80)
    };
  }

  function getNearbyText(element) {
    const container = element.closest("article, li, section, div, tr, td, button, a") || element.parentElement;
    return normalizeText(container?.innerText || "").slice(0, 220);
  }

  function isPersoNode(node) {
    return Boolean(
      node?.id?.startsWith("perso-xxl") ||
      node?.closest?.("#perso-xxl-panel, #perso-xxl-picker-overlay, [data-perso-xxl-ui], .ai-input, .ai-sent-list, .preview-stack, .productivity-ai-wrap, .productivity-toast")
    );
  }

  function isVisible(element) {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden";
  }

  function truncateHtml(value) {
    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    if (normalized.length <= MAX_HTML_LENGTH) return normalized;
    return `${normalized.slice(0, MAX_HTML_LENGTH)}…`;
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  return {
    collectPageDom,
    buildSelection
  };
})();
