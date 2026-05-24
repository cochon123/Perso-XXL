export const TRANSFORM_SCHEMA_HINT = {
  version: "2.0",
  site: {
    hostname: "example.com",
    pathname: "/watch",
    urlPattern: "example.com/watch*"
  },
  sourcePrompt: "Hide the Gemini button",
  selections: [
    {
      id: "sel_1",
      tag: "button",
      ariaLabel: "Ask Gemini"
    }
  ],
  targetMap: {
    gemini_button: {
      source: "selection",
      selectionRef: "sel_1",
      selectors: ["button[aria-label='Ask Gemini']"],
      fallbackSelectors: [".docs-toolbar button:nth-of-type(4)"]
    },
    video_titles: {
      source: "inferred",
      selectors: ["#video-title", "a#video-title-link"],
      fallbackSelectors: []
    }
  },
  rules: [
    {
      id: "hide-gemini",
      type: "visibility",
      targetRef: "gemini_button",
      action: "hide"
    }
  ]
};

export const ALLOWED_RULE_TYPES = new Set(["style", "visibility", "attribute", "css"]);

export const ALLOWED_STYLE_KEYS = new Set([
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
