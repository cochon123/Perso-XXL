import {
  ALLOWED_CAPABILITIES,
  ALLOWED_INSERT_ATTRIBUTES,
  ALLOWED_INSERT_TAGS,
  ALLOWED_PLACEMENTS,
  ALLOWED_RULE_TYPES,
  ALLOWED_STYLE_KEYS
} from "./schema.js";

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

  if (rule.type === "capability" && rule.capability === "shortcutButton") {
    if (!rule.sourceActionTargetRef || !targetRefs.has(rule.sourceActionTargetRef)) {
      errors.push(`Rule ${index} shortcutButton must reference a known sourceActionTargetRef.`);
    }
    if (rule.label && typeof rule.label !== "string") {
      errors.push(`Rule ${index} shortcutButton label must be a string.`);
    }
  }

  if (rule.type === "capability" && rule.capability === "moveElement") {
    if (!rule.placementTargetRef || !targetRefs.has(rule.placementTargetRef)) {
      errors.push(`Rule ${index} moveElement must reference a known placementTargetRef.`);
    }
    validatePlacement(rule, index, errors, ["append", "prepend", "before", "after"]);
  }

  if (rule.type === "capability" && rule.capability === "insertElement") {
    if (!rule.element || typeof rule.element !== "object" || Array.isArray(rule.element)) {
      errors.push(`Rule ${index} insertElement must include an element object.`);
    } else {
      validateInsertElement(rule.element, index, errors);
    }
    validatePlacement(rule, index, errors);
  }

  if (rule.type === "capability" && rule.capability === "cloneElement") {
    if (!rule.sourceTargetRef || !targetRefs.has(rule.sourceTargetRef)) {
      errors.push(`Rule ${index} cloneElement must reference a known sourceTargetRef.`);
    }
    validatePlacement(rule, index, errors);
  }

  if (rule.type === "capability" && rule.capability === "swapElements") {
    if (!rule.otherTargetRef || !targetRefs.has(rule.otherTargetRef)) {
      errors.push(`Rule ${index} swapElements must reference a known otherTargetRef.`);
    }
  }

  if (rule.type === "capability" && rule.capability === "menuShortcut") {
    if (!rule.menuTargetRef || !targetRefs.has(rule.menuTargetRef)) {
      errors.push(`Rule ${index} menuShortcut must reference a known menuTargetRef.`);
    }
    if (typeof rule.actionText !== "string" || !rule.actionText.trim()) {
      errors.push(`Rule ${index} menuShortcut must include actionText.`);
    }
  }
}

function validatePlacement(rule, index, errors, allowed = Array.from(ALLOWED_PLACEMENTS)) {
  if (rule.placement && !allowed.includes(rule.placement)) {
    errors.push(`Rule ${index} has unsupported placement ${rule.placement}.`);
  }
}

function validateInsertElement(element, index, errors, depth = 0) {
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
        if (name === "src" && typeof value === "string" && !value.startsWith("asset:")) {
          errors.push(`Rule ${index} insertElement img src must use asset:<assetId>.`);
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
        if (!value.startsWith("asset:") && !/^none$/i.test(value)) {
          errors.push(`Rule ${index} insertElement backgroundImage must use asset:<assetId>.`);
        }
      }
    }
  }

  if (element.children !== undefined) {
    if (!Array.isArray(element.children) || element.children.length > 8) {
      errors.push(`Rule ${index} insertElement children must be an array with at most 8 items.`);
    } else {
      element.children.forEach((child) => validateInsertElement(child, index, errors, depth + 1));
    }
  }
}
