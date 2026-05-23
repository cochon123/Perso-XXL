export const TRANSFORM_SCHEMA_HINT = {
  version: "1.0",
  site: "youtube.com",
  theme: {
    colors: {
      background: "#111111",
      surface: "#1F1F1F",
      surfaceElevated: "#2A2A2A",
      text: "#F5F5F5",
      textMuted: "#B8B8B8",
      accent: "#D99A4E"
    },
    typography: {
      fontFamily: "Inter, Arial, system-ui, sans-serif",
      baseFontSize: "15px"
    },
    radius: "12px",
    density: "comfortable"
  },
  rules: [
    {
      id: "video-card-style",
      type: "style",
      target: "videoCard",
      styles: {
        backgroundColor: "var(--perso-surface)",
        borderRadius: "var(--perso-radius)",
        padding: "10px"
      }
    }
  ]
};

export const ALLOWED_RULE_TYPES = new Set(["style", "visibility", "attribute", "css"]);

export const ALLOWED_STYLE_KEYS = new Set([
  "background",
  "backgroundColor",
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

export const ALLOWED_TARGETS = [
  "app",
  "masthead",
  "sidebar",
  "homeFeed",
  "videoCard",
  "videoTitle",
  "thumbnail",
  "chips",
  "shortsShelf",
  "watchPage",
  "player",
  "recommendations",
  "comments"
];
