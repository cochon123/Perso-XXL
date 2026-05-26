import { ALLOWED_CAPABILITIES, ALLOWED_RULE_TYPES, ALLOWED_STYLE_KEYS } from "./schema.js";

const CSS_DANGER_PATTERNS = [
  /@import/i,
  /url\s*\(/i,
  /expression\s*\(/i,
  /javascript:/i,
  /position\s*:\s*fixed/i,
  /z-index\s*:\s*9999/i
];

export function validateTransformPlan(input) {
  const errors = [];

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, errors: ["Plan must be a JSON object."] };
  }

  if (!input.site || typeof input.site !== "object") {
    errors.push("Plan must include site.");
  }

  if (!input.targetMap || typeof input.targetMap !== "object") {
    errors.push("Plan must include targetMap.");
  }

  if (!Array.isArray(input.rules)) {
    errors.push("Plan must include a rules array.");
  } else if (input.rules.length > 30) {
    errors.push("Plan cannot contain more than 30 rules.");
  } else {
    const targetRefs = new Set(Object.keys(input.targetMap || {}));
    input.rules.forEach((rule, index) => validateRule(rule, index, errors, targetRefs));
  }

  return { ok: errors.length === 0, errors };
}

function validateRule(rule, index, errors, targetRefs) {
  if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
    errors.push(`Rule ${index} must be an object.`);
    return;
  }

  if (!ALLOWED_RULE_TYPES.has(rule.type)) {
    errors.push(`Rule ${index} has unsupported type.`);
  }

  if (rule.selector) {
    errors.push(`Rule ${index} uses a raw selector. Use targetRef instead.`);
  }

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
      if (!ALLOWED_STYLE_KEYS.has(key)) {
        errors.push(`Rule ${index} uses unsupported style key ${key}.`);
      }
    });
  }

  if (rule.type === "visibility" && !["hide", "show", "dim"].includes(rule.action)) {
    errors.push(`Rule ${index} has unsupported visibility action.`);
  }

  if (rule.type === "attribute" && typeof rule.attribute !== "string") {
    errors.push(`Rule ${index} attribute rule must include attribute name.`);
  }

  if (rule.type === "css") {
    if (typeof rule.css !== "string" || rule.css.length > 5000) {
      errors.push(`Rule ${index} CSS must be a short string.`);
      return;
    }

    if (CSS_DANGER_PATTERNS.some((pattern) => pattern.test(rule.css))) {
      errors.push(`Rule ${index} CSS contains a blocked pattern.`);
    }
  }

  if (rule.type === "capability" && !ALLOWED_CAPABILITIES.has(rule.capability)) {
    errors.push(`Rule ${index} has unsupported capability ${rule.capability}.`);
  }
}
