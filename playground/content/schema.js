window.PersoSchema = (() => {
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

  return {
    TRANSFORM_SCHEMA_HINT,
    ALLOWED_RULE_TYPES,
    ALLOWED_CAPABILITIES,
    ALLOWED_STYLE_KEYS,
    ALLOWED_STYLE_KEYS_LIST: Array.from(ALLOWED_STYLE_KEYS),
    ALLOWED_INSERT_TAGS,
    ALLOWED_INSERT_ATTRIBUTES,
    ALLOWED_PLACEMENTS
  };
})();
