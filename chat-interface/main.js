const extensionPanel = document.getElementById('perso-xxl-panel');
const qs = (selector) => (extensionPanel ? extensionPanel.querySelector(selector) : document.querySelector(selector));
const aiInput = qs('#ai-input');
const attachToggle = qs('#attach-toggle');
const attachMenu = qs('#attach-menu');
const imageInput = qs('#image-input');
const promptEditor = qs('#prompt-editor');
const promptPlaceholder = qs('#prompt-placeholder');
const sendBtn = qs('#send-btn');
const sentList = qs('#sent-list');
const inputStatus = qs('#input-status');
const statusLabel = qs('#status-label');
const statusLine = qs('#status-line');
const statusDots = qs('#status-dots');
const controlSections = document.getElementById('control-sections');
const exportOutput = document.getElementById('export-output');
const copyBtn = document.getElementById('copy-btn');
const resetBtn = document.getElementById('reset-btn');
const controlSearch = document.getElementById('control-search');
const toast = qs('#toast');

const isPlayground = Boolean(controlSections);
const hostApi = () => {
  if (window.PersoDemo?.enabled) return window.PersoDemo;
  if (window.PersoExtension?.enabled) return window.PersoExtension;
  return null;
};
const isEmbedded = () => Boolean(hostApi());

if (!aiInput) {
  // Page has no ai-input markup — skip initialization.
} else {

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** @type {Map<string, { type: string, label: string, url?: string }>} */
const tokenStore = new Map();

let tokenCounter = 0;

let exportFormat = 'css';
let toastTimer;
/** @type {Range | null} */
let savedEditorRange = null;

const LOADING_MESSAGES = [
  'analysing your intent',
  'thinking about the next step',
  'considering edge case',
  'finalising the result',
];
const LOADING_DURATION_MS = 10000;
const LOADING_MESSAGE_INTERVAL_MS = 2000;

let loadingInterval = null;
let loadingFinishTimeout = null;
let loadingMessageIndex = 0;
let isLoading = false;
let isDone = false;

const CONTROL_GROUPS = [
  {
    title: 'Stack',
    controls: [
      { key: '--ci-stack-gap', label: 'Section gap', type: 'range', min: 0, max: 24, step: 1, unit: 'px' },
    ],
  },
  {
    title: 'Chat history',
    controls: [
      { key: '--ci-bubble-gap', label: 'Bubble gap', type: 'range', min: 0, max: 20, step: 1, unit: 'px' },
      { key: '--ci-bubble-padding-x', label: 'Padding X', type: 'range', min: 4, max: 24, step: 1, unit: 'px' },
      { key: '--ci-bubble-padding-y', label: 'Padding Y', type: 'range', min: 4, max: 20, step: 1, unit: 'px' },
      { key: '--ci-bubble-user-bg', label: 'User bg', type: 'color', default: '#2a111e' },
      { key: '--ci-bubble-user-border', label: 'User border', type: 'color-alpha', default: 'rgba(255, 45, 122, 0.36)' },
      { key: '--ci-bubble-assistant-bg', label: 'Assistant bg', type: 'color-alpha', default: 'rgba(255, 255, 255, 0.08)' },
      { key: '--ci-bubble-assistant-border', label: 'Assistant border', type: 'color-alpha', default: 'rgba(255, 255, 255, 0.1)' },
      { key: '--ci-bubble-assistant-text', label: 'Assistant text', type: 'color-alpha', default: 'rgba(250, 248, 249, 0.82)' },
    ],
  },
  {
    title: 'Composer layout',
    controls: [
      { key: '--ai-width', label: 'Width', type: 'range', min: 320, max: 720, step: 4, unit: 'px' },
      { key: '--ai-height', label: 'Height', type: 'range', min: 40, max: 72, step: 2, unit: 'px' },
      { key: '--ai-gap', label: 'Gap', type: 'range', min: 0, max: 20, step: 1, unit: 'px' },
      { key: '--ai-radius', label: 'Border radius', type: 'range', min: 0, max: 32, step: 1, unit: 'px' },
      { key: '--ai-border-width', label: 'Border width', type: 'range', min: 0, max: 4, step: 1, unit: 'px' },
      { key: '--ai-margin', label: 'Margin', type: 'range', min: 0, max: 40, step: 2, unit: 'px' },
    ],
  },
  {
    title: 'Spacing',
    controls: [
      { key: '--ai-padding-x', label: 'Padding X', type: 'range', min: 0, max: 24, step: 1, unit: 'px' },
      { key: '--ai-padding-y', label: 'Padding Y', type: 'range', min: 0, max: 20, step: 1, unit: 'px' },
    ],
  },
  {
    title: 'Colors',
    controls: [
      { key: '--ai-bg', label: 'Background', type: 'color-alpha', default: 'rgba(22, 14, 20, 0.72)' },
      { key: '--ai-border', label: 'Border', type: 'color-alpha', default: 'rgba(255, 45, 122, 0.22)' },
      { key: '--ai-text', label: 'Text', type: 'color', default: '#faf8f9' },
      { key: '--ai-placeholder', label: 'Placeholder', type: 'color-alpha', default: 'rgba(250, 248, 249, 0.38)' },
      { key: '--ai-accent', label: 'Accent', type: 'color', default: '#ff2d7a' },
      { key: '--ai-accent-hover', label: 'Accent hover', type: 'color', default: '#ff6ba8' },
      { key: '--ai-btn-bg', label: 'Button bg', type: 'color-alpha', default: 'rgba(255, 255, 255, 0.06)' },
      { key: '--ai-btn-bg-hover', label: 'Button hover', type: 'color-alpha', default: 'rgba(255, 45, 122, 0.18)' },
      { key: '--ai-send-bg', label: 'Send bg', type: 'color', default: '#ff2d7a' },
      { key: '--ai-send-bg-hover', label: 'Send hover', type: 'color', default: '#ff2e85' },
      { key: '--ai-send-icon', label: 'Send icon', type: 'color', default: '#fef6f6' },
      { key: '--ai-menu-bg', label: 'Menu bg', type: 'color-alpha', default: 'rgba(18, 10, 16, 0.96)' },
      { key: '--ai-menu-border', label: 'Menu border', type: 'color-alpha', default: 'rgba(255, 45, 122, 0.2)' },
      { key: '--ai-focus-ring', label: 'Focus ring', type: 'color-alpha', default: 'rgba(200, 65, 115, 0)' },
    ],
  },
  {
    title: 'Typography',
    controls: [
      { key: '--ai-font-size', label: 'Font size', type: 'range', min: 12, max: 20, step: 1, unit: 'px' },
      { key: '--ai-font-weight', label: 'Font weight', type: 'range', min: 300, max: 700, step: 100, unit: '' },
    ],
  },
  {
    title: 'Buttons & icons',
    controls: [
      { key: '--ai-btn-size', label: 'Button size', type: 'range', min: 32, max: 52, step: 2, unit: 'px' },
      { key: '--ai-icon-size', label: 'Icon size', type: 'range', min: 14, max: 24, step: 1, unit: 'px' },
    ],
  },
  {
    title: 'Revert icon',
    controls: [
      { key: '--ai-revert-size', label: 'Size', type: 'range', min: 10, max: 28, step: 1, unit: 'px' },
      { key: '--ai-revert-stroke', label: 'Thickness', type: 'range', min: 0, max: 2.5, step: 0.1, unit: '' },
      { key: '--ai-revert-x', label: 'Offset X', type: 'range', min: -6, max: 6, step: 0.5, unit: 'px' },
      { key: '--ai-revert-y', label: 'Offset Y', type: 'range', min: -6, max: 6, step: 0.5, unit: 'px' },
    ],
  },
  {
    title: 'Effects',
    controls: [
      { key: '--ai-shadow-blur', label: 'Shadow blur', type: 'range', min: 0, max: 64, step: 2, unit: 'px' },
      { key: '--ai-shadow-spread', label: 'Shadow spread', type: 'range', min: 0, max: 20, step: 1, unit: 'px' },
      { key: '--ai-shadow-opacity', label: 'Shadow opacity', type: 'range', min: 0, max: 1, step: 0.05, unit: '' },
      { key: '--ai-backdrop-blur', label: 'Backdrop blur', type: 'range', min: 0, max: 32, step: 2, unit: 'px' },
      { key: '--ai-glow-opacity', label: 'Glow opacity', type: 'range', min: 0, max: 1, step: 0.05, unit: '' },
      { key: '--ai-focus-ring-width', label: 'Focus ring width', type: 'range', min: 0, max: 6, step: 1, unit: 'px' },
      { key: '--ai-transition', label: 'Transition', type: 'range', min: 80, max: 500, step: 10, unit: 'ms' },
    ],
  },
  {
    title: 'Toggles',
    controls: [
      { key: '--ai-glass', label: 'Glass effect (backdrop)', type: 'toggle', cssKey: '--ai-backdrop-blur', on: 16, off: 0 },
      { key: '--ai-shadow-enabled', label: 'Drop shadow', type: 'toggle', cssKey: '--ai-shadow-blur', on: 32, off: 0 },
      { key: '--ai-glow-enabled', label: 'Ambient glow', type: 'toggle', cssKey: '--ai-glow-opacity', on: 0.45, off: 0 },
    ],
  },
];

/** @type {Map<string, { control: object, input: HTMLElement, valueEl?: HTMLElement }>} */
const controlRegistry = new Map();

function parseRgba(str) {
  const m = str.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return { r: 255, g: 45, b: 122, a: 1 };
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] !== undefined ? +m[4] : 1 };
}

function rgbaToHex({ r, g, b }) {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function getCssValue(key) {
  return getComputedStyle(document.documentElement).getPropertyValue(key).trim();
}

function setCssValue(key, value) {
  document.documentElement.style.setProperty(key, value);
  if (isPlayground) updateExport();
}

function formatDisplayValue(control, raw) {
  if (control.type === 'range') {
    const n = parseFloat(raw);
    if (control.unit === 'ms') return `${n}ms`;
    if (control.unit === 'px') return `${n}px`;
    if (control.key === '--ai-font-weight') return String(n);
    if (control.key === '--ai-shadow-opacity' || control.key === '--ai-glow-opacity') return n.toFixed(2);
    if (control.key === '--ai-revert-stroke') return n.toFixed(2);
    return String(raw);
  }
  return raw;
}

function buildControls() {
  controlSections.innerHTML = '';

  CONTROL_GROUPS.forEach((group, gi) => {
    const section = document.createElement('details');
    section.className = 'control-section';
    section.open = gi < 3;

    const summary = document.createElement('summary');
    summary.textContent = group.title;
    section.appendChild(summary);

    const body = document.createElement('div');
    body.className = 'control-section-body';

    group.controls.forEach((control) => {
      const row = document.createElement('div');
      row.className = 'control-row';
      row.dataset.search = `${control.label} ${control.key}`.toLowerCase();

      if (control.type === 'range') {
        const parsed = parseFloat(getCssValue(control.key));
        const current = Number.isFinite(parsed) ? parsed : control.min;
        const label = document.createElement('label');
        label.textContent = control.label;
        label.setAttribute('for', control.key);

        const valueEl = document.createElement('span');
        valueEl.className = 'control-value';
        valueEl.textContent = formatDisplayValue(control, current);

        const input = document.createElement('input');
        input.type = 'range';
        input.id = control.key;
        input.min = control.min;
        input.max = control.max;
        input.step = control.step;
        input.value = current;

        input.addEventListener('input', () => {
          setCssValue(control.key, input.value);
          valueEl.textContent = formatDisplayValue(control, input.value);
        });

        row.append(label, valueEl, input);
        controlRegistry.set(control.key, { control, input, valueEl });
      }

      if (control.type === 'color' || control.type === 'color-alpha') {
        const label = document.createElement('label');
        label.textContent = control.label;

        const current = getCssValue(control.key) || control.default;
        const parsed = parseRgba(current.startsWith('#') ? (() => {
          const rgb = hexToRgb(current);
          return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`;
        })() : current);

        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = rgbaToHex(parsed);

        const alphaRow = document.createElement('div');
        alphaRow.className = 'control-row';
        alphaRow.style.marginTop = '-4px';

        const alphaLabel = document.createElement('label');
        alphaLabel.textContent = 'Opacity';

        const alphaValue = document.createElement('span');
        alphaValue.className = 'control-value';
        alphaValue.textContent = parsed.a.toFixed(2);

        const alphaInput = document.createElement('input');
        alphaInput.type = 'range';
        alphaInput.min = 0;
        alphaInput.max = 1;
        alphaInput.step = 0.01;
        alphaInput.value = parsed.a;

        const applyColor = () => {
          const rgb = hexToRgb(colorInput.value);
          const a = parseFloat(alphaInput.value);
          const css = control.type === 'color' && a >= 1
            ? colorInput.value
            : `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${a})`;
          setCssValue(control.key, css);
          alphaValue.textContent = a.toFixed(2);
        };

        colorInput.addEventListener('input', applyColor);
        alphaInput.addEventListener('input', applyColor);

        if (control.type === 'color') {
          alphaRow.hidden = true;
        }

        alphaRow.append(alphaLabel, alphaValue, alphaInput);
        row.append(label, colorInput, alphaRow);
        controlRegistry.set(control.key, { control, input: colorInput });
      }

      if (control.type === 'toggle') {
        const toggle = document.createElement('label');
        toggle.className = 'control-toggle';

        const span = document.createElement('span');
        span.textContent = control.label;

        const input = document.createElement('input');
        input.type = 'checkbox';
        const cssKey = control.cssKey;
        const current = parseFloat(getCssValue(cssKey));
        input.checked = current === control.on;

        input.addEventListener('change', () => {
          setCssValue(cssKey, input.checked ? control.on : control.off);
          const linked = controlRegistry.get(cssKey);
          if (linked?.input?.type === 'range') {
            linked.input.value = input.checked ? control.on : control.off;
            if (linked.valueEl) {
              linked.valueEl.textContent = formatDisplayValue(linked.control, linked.input.value);
            }
          }
        });

        toggle.append(span, input);
        row.appendChild(toggle);
        controlRegistry.set(control.key, { control, input });
      }

      body.appendChild(row);
    });

    section.appendChild(body);
    controlSections.appendChild(section);
  });
}

function findControl(key) {
  for (const group of CONTROL_GROUPS) {
    const found = group.controls.find((c) => c.key === key);
    if (found) return found;
  }
  return null;
}

function formatVarForExport(key, val) {
  const control = findControl(key);
  if (!control || control.type === 'color' || control.type === 'color-alpha') return val;
  if (control.unit === 'px') return `${val}px`;
  if (control.unit === 'ms') return `${val}ms`;
  return val;
}

function getAllCssVars() {
  const vars = {};
  CONTROL_GROUPS.forEach((group) => {
    group.controls.forEach((control) => {
      if (control.type === 'toggle') return;
      const raw = getCssValue(control.key) || control.default || '';
      vars[control.key] = formatVarForExport(control.key, raw);
    });
  });
  return vars;
}

function buildCssExport(vars) {
  const lines = [':root {'];
  Object.entries(vars).forEach(([key, val]) => {
    lines.push(`  ${key}: ${val};`);
  });
  lines.push('}');
  return lines.join('\n');
}

function buildJsonExport(vars) {
  return JSON.stringify({ component: 'chat-interface', cssVariables: vars }, null, 2);
}

function updateExport() {
  if (!exportOutput) return;
  const vars = getAllCssVars();
  exportOutput.textContent = exportFormat === 'css' ? buildCssExport(vars) : buildJsonExport(vars);
}

function showToast(message) {
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2400);
}

function openMenu() {
  attachMenu.hidden = false;
  attachToggle.setAttribute('aria-expanded', 'true');
  if (!prefersReducedMotion && typeof gsap !== 'undefined') {
    gsap.fromTo(attachMenu, { opacity: 0, y: 8, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'back.out(1.4)' });
    gsap.from('.ai-input__menu-item', { opacity: 0, x: -8, duration: 0.22, stagger: 0.05, ease: 'power2.out', delay: 0.04 });
  }
}

function closeMenu() {
  attachMenu.hidden = true;
  attachToggle.setAttribute('aria-expanded', 'false');
}

function openDashboard() {
  closeMenu();
  const api = hostApi();
  if (api?.openDashboard) {
    api.openDashboard();
    return;
  }

  const extensionApi = globalThis.browser || globalThis.chrome;
  if (extensionApi?.runtime?.sendMessage) {
    try {
      const result = extensionApi.runtime.sendMessage({ type: 'PERSO_OPEN_DASHBOARD' });
      if (result?.catch) result.catch(() => {});
    } catch (_error) {}
    return;
  }

  if (isPlayground) {
    window.open('../dashboard/index.html', '_blank', 'noopener');
    return;
  }

  showToast('Dashboard is available in the extension.');
}

function toggleMenu() {
  if (attachMenu.hidden) openMenu();
  else closeMenu();
}

function getEditorPlainText() {
  return promptEditor.textContent.replace(/\u200B/g, '').trim();
}

function editorHasContent() {
  return getEditorPlainText().length > 0 || promptEditor.querySelector('.ai-input__token') !== null;
}

function syncEditorEmptyState() {
  const empty = !editorHasContent();
  promptEditor.dataset.empty = empty ? 'true' : 'false';
  promptPlaceholder.hidden = !empty;
}

function queueEditorStateSync() {
  requestAnimationFrame(() => {
    syncEditorEmptyState();
    updateLayoutMode();
    updateSendState();
  });
}

function hidePlaceholderForPendingInput(e) {
  if (!e.inputType?.startsWith('insert') && e.inputType !== 'formatSetBlockTextDirection') return;
  promptEditor.dataset.empty = 'false';
  promptPlaceholder.hidden = true;
}

function getNumericVar(name, fallback) {
  return parseFloat(getCssValue(name)) || fallback;
}

function getSingleRowEditorWidth() {
  const btnSize = getNumericVar('--ai-btn-size', 40);
  const gap = getNumericVar('--ai-gap', 8);
  const padX = getNumericVar('--ai-padding-x', 6);
  return Math.max(120, aiInput.clientWidth - (btnSize * 2) - (gap * 2) - (padX * 2) - 12);
}

const LAYOUT_ANIM_DURATION = 0.26;
const layoutAnimTargets = () => [
  aiInput.querySelector('.ai-input__left'),
  promptEditor.closest('.ai-input__field-wrap'),
  sendBtn,
].filter(Boolean);

let layoutAnimating = false;
let layoutReady = false;

function contentWrapsToMultipleLines() {
  if (promptEditor.dataset.empty === 'true') return false;

  const clone = promptEditor.cloneNode(true);
  clone.removeAttribute('id');
  clone.style.cssText = `
    position: absolute;
    visibility: hidden;
    pointer-events: none;
    width: ${getSingleRowEditorWidth()}px;
    height: auto;
    max-height: none;
    overflow: visible;
    white-space: pre-wrap;
    word-break: break-word;
  `;
  promptEditor.parentElement.appendChild(clone);

  const lineHeight = parseFloat(getComputedStyle(promptEditor).lineHeight) || 20;
  const isMultiline = aiInput.dataset.multiline === 'true';
  const threshold = isMultiline ? 1.35 : 1.55;
  const wraps = clone.scrollHeight > lineHeight * threshold;
  clone.remove();
  return wraps;
}

function setLayoutMode(multiline) {
  aiInput.dataset.multiline = multiline ? 'true' : 'false';
}

function animateLayoutChange(nextMultiline) {
  if (layoutAnimating) {
    setLayoutMode(nextMultiline);
    return;
  }

  if (!layoutReady || prefersReducedMotion || typeof gsap === 'undefined') {
    setLayoutMode(nextMultiline);
    return;
  }

  const targets = layoutAnimTargets();
  const firstRects = targets.map((el) => el.getBoundingClientRect());

  layoutAnimating = true;
  aiInput.dataset.layoutAnimating = 'true';
  setLayoutMode(nextMultiline);
  gsap.killTweensOf(aiInput);
  targets.forEach((el) => gsap.killTweensOf(el));

  if (targets.length === 0) {
    layoutAnimating = false;
    delete aiInput.dataset.layoutAnimating;
    gsap.set(aiInput, { clearProps: 'transform' });
    return;
  }

  let completed = 0;
  const finish = () => {
    completed += 1;
    if (completed < targets.length) return;
    layoutAnimating = false;
    delete aiInput.dataset.layoutAnimating;
    targets.forEach((el) => gsap.set(el, { clearProps: 'transform' }));
    gsap.set(aiInput, { clearProps: 'transform' });
  };

  targets.forEach((el, index) => {
    const first = firstRects[index];
    const last = el.getBoundingClientRect();
    gsap.killTweensOf(el, 'x,y');
    gsap.fromTo(
      el,
      { x: Math.round(first.left - last.left), y: Math.round(first.top - last.top) },
      {
        x: 0,
        y: 0,
        duration: LAYOUT_ANIM_DURATION,
        ease: 'power2.out',
        onComplete: finish,
      },
    );
  });

  gsap.fromTo(
    aiInput,
    { scale: nextMultiline ? 0.992 : 0.996 },
    {
      scale: 1,
      duration: LAYOUT_ANIM_DURATION,
      ease: 'power2.out',
      onComplete: () => gsap.set(aiInput, { clearProps: 'transform' }),
    },
  );
}

function updateLayoutMode({ animate = layoutReady } = {}) {
  const shouldMultiline = contentWrapsToMultipleLines();
  const isMultiline = aiInput.dataset.multiline === 'true';
  if (shouldMultiline === isMultiline) return;
  if (!animate) {
    setLayoutMode(shouldMultiline);
    return;
  }
  animateLayoutChange(shouldMultiline);
}

function resetAiInputMotionStyles() {
  if (typeof gsap === 'undefined') return;
  gsap.set(aiInput, { clearProps: 'opacity,transform,visibility' });
  layoutAnimTargets().forEach((el) => gsap.set(el, { clearProps: 'transform' }));
}

function resetPanelMotionStyles() {
  if (typeof gsap === 'undefined') return;
  const controlsPanel = document.getElementById('controls-panel');
  if (controlsPanel) gsap.set(controlsPanel, { clearProps: 'opacity,transform,visibility' });
}

function saveEditorCaret() {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return;

  const range = sel.getRangeAt(0);
  if (!promptEditor.contains(range.commonAncestorContainer)) return;

  savedEditorRange = range.cloneRange();
}

function restoreEditorCaret() {
  if (!savedEditorRange) return false;

  try {
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(savedEditorRange);
    return true;
  } catch {
    return false;
  } finally {
    savedEditorRange = null;
  }
}

function placeCaretAfter(node) {
  const space = document.createTextNode('\u200B');
  node.parentNode?.insertBefore(space, node.nextSibling);

  const range = document.createRange();
  range.setStart(space, 1);
  range.collapse(true);

  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function insertAtCaret(node) {
  promptEditor.focus();

  const sel = window.getSelection();
  const hasValidCaret = sel?.rangeCount
    && promptEditor.contains(sel.getRangeAt(0).commonAncestorContainer);

  if (!hasValidCaret) {
    restoreEditorCaret();
  } else if (savedEditorRange) {
    restoreEditorCaret();
  }

  const selection = window.getSelection();
  if (!selection?.rangeCount) {
    promptEditor.appendChild(node);
    placeCaretAfter(node);
    return;
  }

  const range = selection.getRangeAt(0);
  if (!promptEditor.contains(range.commonAncestorContainer)) {
    promptEditor.appendChild(node);
    placeCaretAfter(node);
    return;
  }

  range.deleteContents();
  range.insertNode(node);
  placeCaretAfter(node);
}

function insertTextAtCaret(text) {
  promptEditor.focus();

  const sel = window.getSelection();
  const hasValidCaret = sel?.rangeCount
    && promptEditor.contains(sel.getRangeAt(0).commonAncestorContainer);

  if (!hasValidCaret) {
    promptEditor.appendChild(document.createTextNode(text));
    queueEditorStateSync();
    return;
  }

  const range = sel.getRangeAt(0);
  range.deleteContents();

  const textNode = document.createTextNode(text);
  range.insertNode(textNode);
  range.setStart(textNode, textNode.length);
  range.collapse(true);

  sel.removeAllRanges();
  sel.addRange(range);
  queueEditorStateSync();
}

function createTokenElement({ type, label, url, element = null, file = null }) {
  tokenCounter += 1;
  const id = `token_${tokenCounter}`;
  tokenStore.set(id, { type, label, url, element, file });

  const token = document.createElement('span');
  token.className = `ai-input__token${type === 'pick' ? ' ai-input__token--pick' : ''}`;
  token.contentEditable = 'false';
  token.dataset.tokenId = id;
  token.dataset.tokenType = type;

  if (type === 'image' && url) {
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    token.appendChild(img);
  }

  const labelEl = document.createElement('span');
  labelEl.className = 'ai-input__token-label';
  labelEl.textContent = label;
  token.appendChild(labelEl);

  return token;
}

function insertToken(data) {
  const token = createTokenElement(data);
  insertAtCaret(token);
  syncEditorEmptyState();
  updateLayoutMode();
  updateSendState();

  if (!prefersReducedMotion) {
    gsap.fromTo(token, { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.22, ease: 'back.out(1.6)' });
  }
}

function removeTokenElement(token) {
  const id = token.dataset.tokenId;
  const stored = tokenStore.get(id);
  if (stored?.type === 'image' && stored.url) URL.revokeObjectURL(stored.url);
  tokenStore.delete(id);

  const prev = token.previousSibling;
  const next = token.nextSibling;
  token.remove();
  if (next?.nodeType === Node.TEXT_NODE && next.textContent === '\u200B') next.remove();
  if (prev?.nodeType === Node.TEXT_NODE && prev.textContent === '\u200B') prev.remove();
}

function getAdjacentToken(direction) {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !sel.isCollapsed) return null;

  const { anchorNode, anchorOffset } = sel;
  if (!anchorNode || !promptEditor.contains(anchorNode)) return null;

  if (direction === 'before') {
    if (anchorNode.nodeType === Node.TEXT_NODE) {
      if (anchorOffset === 0) {
        let prev = anchorNode.previousSibling;
        if (prev?.nodeType === Node.TEXT_NODE && prev.textContent === '\u200B') prev = prev.previousSibling;
        if (prev?.nodeType === Node.ELEMENT_NODE && prev.classList?.contains('ai-input__token')) return prev;
      }
      return null;
    }
    if (anchorNode === promptEditor && anchorOffset > 0) {
      const child = promptEditor.childNodes[anchorOffset - 1];
      if (child?.nodeType === Node.ELEMENT_NODE && child.classList?.contains('ai-input__token')) return child;
    }
  }

  if (direction === 'after') {
    if (anchorNode.nodeType === Node.TEXT_NODE) {
      const text = anchorNode.textContent || '';
      if (anchorOffset >= text.length) {
        let next = anchorNode.nextSibling;
        if (next?.nodeType === Node.ELEMENT_NODE && next.classList?.contains('ai-input__token')) return next;
      }
      return null;
    }
    if (anchorNode === promptEditor) {
      const child = promptEditor.childNodes[anchorOffset];
      if (child?.nodeType === Node.ELEMENT_NODE && child.classList?.contains('ai-input__token')) return child;
    }
  }

  return null;
}

function getSelectedToken() {
  const sel = window.getSelection();
  if (!sel?.rangeCount) return null;
  const node = sel.anchorNode;
  if (node?.nodeType === Node.ELEMENT_NODE && node.classList?.contains('ai-input__token')) return node;
  return node?.parentElement?.closest?.('.ai-input__token') || null;
}

function clearEditor({ revokeAssets = true } = {}) {
  if (revokeAssets) {
    tokenStore.forEach((stored) => {
      if (stored.type === 'image' && stored.url) URL.revokeObjectURL(stored.url);
    });
  }
  tokenStore.clear();
  promptEditor.innerHTML = '';
  syncEditorEmptyState();
  updateLayoutMode();
}

function captureTokenPayload() {
  return Array.from(tokenStore.entries()).map(([id, stored]) => [id, { ...stored }]);
}

function serializeEditor() {
  const parts = [];
  promptEditor.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.replace(/\u200B/g, '');
      if (text) parts.push(text);
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('ai-input__token')) {
      const stored = tokenStore.get(node.dataset.tokenId);
      if (stored?.type === 'image') parts.push(`[image:${stored.label}]`);
      if (stored?.type === 'pick') parts.push(`[element:${stored.label}]`);
    }
  });
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function updateSendState() {
  if (isDone) {
    sendBtn.disabled = false;
    return;
  }
  sendBtn.disabled = !editorHasContent();
}

function simulatePick() {
  insertToken({ type: 'pick', label: 'button.submit-btn' });
  showToast('Element selected — button.submit-btn');
  closeMenu();
}

async function handlePickAction() {
  if (!isEmbedded()) {
    simulatePick();
    return;
  }

  saveEditorCaret();
  closeMenu();

  try {
    const api = hostApi();
    const element = await api.pickElement();
    const label = api.formatElementLabel(element);
    insertToken({ type: 'pick', label, element });
    showToast(`Element selected — ${label}`);
  } catch {
    savedEditorRange = null;
  }
}

function handleImageSelect(file) {
  if (!file) return;
  insertToken({
    type: 'image',
    label: file.name,
    url: URL.createObjectURL(file),
    file,
  });
  showToast(`Image attached — ${file.name}`);
  closeMenu();
}

function captureEditorSnapshot() {
  const nodes = [];
  promptEditor.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      nodes.push({ type: 'text', text: node.textContent || '' });
      return;
    }
    if (node.nodeType === Node.ELEMENT_NODE && node.classList?.contains('ai-input__token')) {
      const stored = tokenStore.get(node.dataset.tokenId);
      if (stored) {
        nodes.push({
          type: 'token',
          tokenId: node.dataset.tokenId,
          stored: { ...stored },
        });
      }
    }
  });

  return {
    nodes,
    text: serializeEditor(),
  };
}

function appendSnapshotNode(parent, snapshotNode, { interactive = false } = {}) {
  if (snapshotNode.type === 'text') {
    parent.appendChild(document.createTextNode(snapshotNode.text || ''));
    return;
  }

  if (snapshotNode.type !== 'token' || !snapshotNode.stored) return;

  const token = document.createElement('span');
  token.className = `ai-input__token${snapshotNode.stored.type === 'pick' ? ' ai-input__token--pick' : ''}`;
  token.contentEditable = 'false';
  token.dataset.tokenType = snapshotNode.stored.type;
  if (interactive && snapshotNode.tokenId) token.dataset.tokenId = snapshotNode.tokenId;

  if (snapshotNode.stored.type === 'image' && snapshotNode.stored.url) {
    const img = document.createElement('img');
    img.src = snapshotNode.stored.url;
    img.alt = '';
    token.appendChild(img);
  }

  const labelEl = document.createElement('span');
  labelEl.className = 'ai-input__token-label';
  labelEl.textContent = snapshotNode.stored.label || '';
  token.appendChild(labelEl);
  parent.appendChild(token);
}

function appendSentBubble(snapshot) {
  const bubble = document.createElement('div');
  bubble.className = 'ai-sent-bubble perso-xxl-chat-bubble perso-xxl-chat-bubble--user';
  if (snapshot.nodes?.length) {
    snapshot.nodes.forEach((node) => appendSnapshotNode(bubble, node));
  } else {
    bubble.textContent = snapshot.text || '';
  }
  sentList.appendChild(bubble);

  if (!prefersReducedMotion) {
    gsap.fromTo(
      bubble,
      { opacity: 0, y: 14, scale: 0.98 },
      { opacity: 1, y: 0, scale: 1, duration: 0.38, ease: 'power2.out' },
    );
  }
}

function appendAssistantBubble(text) {
  const bubble = document.createElement('div');
  bubble.className = 'ai-sent-bubble perso-xxl-chat-bubble perso-xxl-chat-bubble--assistant';
  bubble.textContent = text || '';

  // Add like/dislike buttons to the AI response bubble
  const feedbackBar = document.createElement('div');
  feedbackBar.className = 'ai-sent-bubble__feedback';

  const likeBtn = document.createElement('button');
  likeBtn.type = 'button';
  likeBtn.className = 'ai-sent-bubble__feedback-btn ai-sent-bubble__feedback-btn--like';
  likeBtn.setAttribute('aria-label', 'Thumbs up');
  likeBtn.innerHTML = `
    <svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true">
      <path d="M507.532,223.313c-9.891-24.594-35-41.125-62.469-41.125H365.86c-2.516,0-4.75-0.031-6.75-0.094
        c0.641-0.844,1.203-1.594,1.672-2.203c2.719-3.563,4.922-6.406,6.656-9.188c0.688-0.922,1.688-2.047,2.859-3.453
        c9.516-11.234,29.328-34.625,34.531-67.109c2.891-18.016-2.359-36.438-14.359-50.516c-11.156-13.094-26.906-20.891-42.109-20.891
        c-15.359,0-28.672,7.641-36.516,20.969c-1.156,1.938-2.531,4.406-4.125,7.266c-7.797,13.859-24,42.719-39.672,54.063
        c-17.969,12.984-33.875,30.5-49.25,47.453c-21.141,23.313-43.016,47.406-60.656,47.406c-13.797,0-24.969,11.203-24.969,24.984
        v170.516c0,13.797,11.172,24.984,24.969,24.984c18.359,0,59.766,15.938,89.984,27.594c23.156,8.922,43.172,16.609,56.703,19.328
        c3.984,0.797,8.094,1.719,12.313,2.641c15.484,3.438,33.063,7.328,50.531,7.328c27.766,0,49.234-10.031,63.797-29.828
        c14.203-19.266,30.422-69.313,51.813-137.938c1.453-4.703,2.906-9.328,4.297-13.797
        C520.017,267.188,512.501,235.641,507.532,223.313z M465.563,288.453c-17.031,54.172-39.719,130.516-54.219,150.188
        c-11.031,15-26.672,19.641-43.672,19.641c-19.141,0-40-5.875-57.938-9.484c-29.891-5.984-114.328-47.406-151.594-47.406V230.875
        c45.234,0,81.125-68.25,124.531-99.594c23.391-16.922,42.984-55.797,50.688-68.906c3.547-6.031,9.016-8.672,15-8.672
        c15.984,0,35.578,18.844,31.797,42.484c-5.203,32.484-29.891,54.594-33.797,61.078c-3.891,6.516-20.797,24.703-20.797,35.094
        c0,9.109,6.484,14.813,40.297,14.813c42.031,0,70.922,0,79.203,0C478.923,207.172,508.767,246.969,465.563,288.453z"/>
      <path d="M0.001,250.734v158.219c0,19.547,15.844,35.406,35.406,35.406h42.234c13.047,0,23.609-10.578,23.609-23.609
        V215.328H35.407C15.845,215.328,0.001,231.172,0.001,250.734z M49.798,374.125c8.969,0,16.25,7.266,16.25,16.25
        c0,8.969-7.281,16.25-16.25,16.25c-8.984,0-16.266-7.281-16.266-16.25C33.532,381.391,40.813,374.125,49.798,374.125z"/>
    </svg>
  `;
  likeBtn.addEventListener('click', () => {
    feedbackBar.querySelectorAll('.ai-sent-bubble__feedback-btn').forEach(btn => btn.classList.remove('is-active'));
    likeBtn.classList.add('is-active');
    recordAssistantFeedback({ feedback: 'like', assistantText: text });
  });

  const dislikeBtn = document.createElement('button');
  dislikeBtn.type = 'button';
  dislikeBtn.className = 'ai-sent-bubble__feedback-btn ai-sent-bubble__feedback-btn--dislike';
  dislikeBtn.setAttribute('aria-label', 'Thumbs down');
  dislikeBtn.innerHTML = `
    <svg viewBox="0 0 512 512" fill="currentColor" aria-hidden="true" style="transform: scaleY(-1);">
      <path d="M507.532,223.313c-9.891-24.594-35-41.125-62.469-41.125H365.86c-2.516,0-4.75-0.031-6.75-0.094
        c0.641-0.844,1.203-1.594,1.672-2.203c2.719-3.563,4.922-6.406,6.656-9.188c0.688-0.922,1.688-2.047,2.859-3.453
        c9.516-11.234,29.328-34.625,34.531-67.109c2.891-18.016-2.359-36.438-14.359-50.516c-11.156-13.094-26.906-20.891-42.109-20.891
        c-15.359,0-28.672,7.641-36.516,20.969c-1.156,1.938-2.531,4.406-4.125,7.266c-7.797,13.859-24,42.719-39.672,54.063
        c-17.969,12.984-33.875,30.5-49.25,47.453c-21.141,23.313-43.016,47.406-60.656,47.406c-13.797,0-24.969,11.203-24.969,24.984
        v170.516c0,13.797,11.172,24.984,24.969,24.984c18.359,0,59.766,15.938,89.984,27.594c23.156,8.922,43.172,16.609,56.703,19.328
        c3.984,0.797,8.094,1.719,12.313,2.641c15.484,3.438,33.063,7.328,50.531,7.328c27.766,0,49.234-10.031,63.797-29.828
        c14.203-19.266,30.422-69.313,51.813-137.938c1.453-4.703,2.906-9.328,4.297-13.797
        C520.017,267.188,512.501,235.641,507.532,223.313z M465.563,288.453c-17.031,54.172-39.719,130.516-54.219,150.188
        c-11.031,15-26.672,19.641-43.672,19.641c-19.141,0-40-5.875-57.938-9.484c-29.891-5.984-114.328-47.406-151.594-47.406V230.875
        c45.234,0,81.125-68.25,124.531-99.594c23.391-16.922,42.984-55.797,50.688-68.906c3.547-6.031,9.016-8.672,15-8.672
        c15.984,0,35.578,18.844,31.797,42.484c-5.203,32.484-29.891,54.594-33.797,61.078c-3.891,6.516-20.797,24.703-20.797,35.094
        c0,9.109,6.484,14.813,40.297,14.813c42.031,0,70.922,0,79.203,0C478.923,207.172,508.767,246.969,465.563,288.453z"/>
      <path d="M0.001,250.734v158.219c0,19.547,15.844,35.406,35.406,35.406h42.234c13.047,0,23.609-10.578,23.609-23.609
        V215.328H35.407C15.845,215.328,0.001,231.172,0.001,250.734z M49.798,374.125c8.969,0,16.25,7.266,16.25,16.25
        c0,8.969-7.281,16.25-16.25,16.25c-8.984,0-16.266-7.281-16.266-16.25C33.532,381.391,40.813,374.125,49.798,374.125z"/>
    </svg>
  `;
  dislikeBtn.addEventListener('click', () => {
    feedbackBar.querySelectorAll('.ai-sent-bubble__feedback-btn').forEach(btn => btn.classList.remove('is-active'));
    dislikeBtn.classList.add('is-active');
    recordAssistantFeedback({ feedback: 'dislike', assistantText: text });
  });

  feedbackBar.appendChild(likeBtn);
  feedbackBar.appendChild(dislikeBtn);
  bubble.appendChild(feedbackBar);

  sentList.appendChild(bubble);

  if (!prefersReducedMotion) {
    gsap.fromTo(
      bubble,
      { opacity: 0, y: 14, scale: 0.98 },
      { opacity: 1, y: 0, scale: 1, duration: 0.38, ease: 'power2.out' },
    );
  }
}

function recordAssistantFeedback(payload) {
  const api = hostApi();
  if (api?.onFeedback) {
    api.onFeedback(payload)
      .then(() => showToast('Feedback saved'))
      .catch(() => showToast('Feedback saved locally'));
    return;
  }

  showToast(`Feedback recorded: ${payload.feedback === 'like' ? 'thumbs up' : 'thumbs down'}`);
}

function restoreEditorSnapshot(snapshot, tokens = []) {
  const tokenMap = new Map(tokens);
  clearEditor({ revokeAssets: false });

  if (!snapshot?.nodes?.length) {
    promptEditor.textContent = snapshot?.text || '';
    syncEditorEmptyState();
    updateLayoutMode();
    updateSendState();
    return;
  }

  promptEditor.innerHTML = '';
  snapshot.nodes.forEach((node) => {
    if (node.type === 'token' && node.tokenId && tokenMap.has(node.tokenId)) {
      node.stored = { ...tokenMap.get(node.tokenId) };
    }
    appendSnapshotNode(promptEditor, node, { interactive: true });
    if (node.type === 'token' && node.tokenId && node.stored) {
      tokenStore.set(node.tokenId, { ...node.stored });
    }
  });
  syncEditorEmptyState();
  updateLayoutMode();
  updateSendState();
}

function setStatusMessage(text, { animate = true, showDots = true } = {}) {
  statusLabel.textContent = text;
  statusDots.hidden = !showDots;
  aiInput.dataset.statusDone = showDots ? 'false' : 'true';

  if (!animate || prefersReducedMotion) {
    gsap.set(statusLine, { y: 0, opacity: 1 });
    return;
  }

  gsap.fromTo(
    statusLine,
    { y: 18, opacity: 0 },
    { y: 0, opacity: 1, duration: 0.32, ease: 'power2.out' },
  );
}

function cycleStatusMessage() {
  if (!isLoading) return;

  if (prefersReducedMotion) {
    loadingMessageIndex = (loadingMessageIndex + 1) % LOADING_MESSAGES.length;
    setStatusMessage(LOADING_MESSAGES[loadingMessageIndex], { animate: false });
    return;
  }

  gsap.to(statusLine, {
    y: -18,
    opacity: 0,
    duration: 0.24,
    ease: 'power2.in',
    onComplete: () => {
      if (!isLoading) return;
      loadingMessageIndex = (loadingMessageIndex + 1) % LOADING_MESSAGES.length;
      setStatusMessage(LOADING_MESSAGES[loadingMessageIndex], { animate: true });
    },
  });
}

function enterLoadingState(snapshot, { autoFinish = true } = {}) {
  if (isLoading) return;
  isLoading = true;
  closeMenu();

  appendSentBubble(snapshot);

  aiInput.dataset.multiline = 'false';
  aiInput.dataset.state = 'loading';
  promptEditor.contentEditable = 'false';
  inputStatus.hidden = false;
  attachToggle.setAttribute('aria-label', 'Processing');
  attachToggle.disabled = true;
  sendBtn.disabled = true;

  loadingMessageIndex = 0;
  setStatusMessage(LOADING_MESSAGES[0], { animate: false });

  clearEditor({ revokeAssets: false });
  updateLayoutMode();

  loadingInterval = setInterval(cycleStatusMessage, LOADING_MESSAGE_INTERVAL_MS);
  if (autoFinish) {
    loadingFinishTimeout = setTimeout(finishLoadingSequence, LOADING_DURATION_MS);
  }
}

function abortLoadingState(message, restorePayload) {
  clearInterval(loadingInterval);
  clearTimeout(loadingFinishTimeout);
  loadingInterval = null;
  loadingFinishTimeout = null;
  isLoading = false;
  isDone = false;
  aiInput.dataset.state = 'idle';
  delete aiInput.dataset.statusDone;
  promptEditor.contentEditable = 'true';
  attachToggle.disabled = false;
  attachToggle.setAttribute('aria-label', 'Add attachment');
  sendBtn.disabled = true;
  inputStatus.hidden = true;
  sentList.innerHTML = '';
  gsap.set(statusLine, { y: 0, opacity: 1 });
  if (restorePayload) {
    restoreEditorSnapshot(restorePayload.snapshot, restorePayload.tokens);
  } else {
    syncEditorEmptyState();
    updateLayoutMode();
    updateSendState();
  }
  showToast(message);
}

function finishLoadingSequence() {
  if (!isLoading) return;
  clearInterval(loadingInterval);
  clearTimeout(loadingFinishTimeout);
  loadingInterval = null;
  loadingFinishTimeout = null;

  const lastUserBubble = sentList.querySelector('.perso-xxl-chat-bubble--user:last-of-type');
  const promptText = lastUserBubble?.textContent?.replace(/\u200B/g, '').trim() || 'your request';
  appendAssistantBubble(`Created modification: ${promptText}`);
  resetComposerAfterSuccess();
}

function enterDoneState() {
  isLoading = false;
  isDone = true;
  aiInput.dataset.state = 'done';
  promptEditor.contentEditable = 'false';
  attachToggle.disabled = true;
  sendBtn.disabled = false;
  sendBtn.setAttribute('aria-label', 'Revert changes');
}

function resetComposerAfterSuccess() {
  isLoading = false;
  isDone = false;
  aiInput.dataset.state = 'idle';
  delete aiInput.dataset.statusDone;
  inputStatus.hidden = true;
  promptEditor.contentEditable = 'true';
  attachToggle.disabled = false;
  attachToggle.setAttribute('aria-label', 'Add attachment');
  sendBtn.setAttribute('aria-label', 'Send prompt');
  if (typeof gsap !== 'undefined') gsap.set(statusLine, { y: 0, opacity: 1 });
  clearEditor();
  syncEditorEmptyState();
  updateLayoutMode();
  updateSendState();
  promptEditor.focus();
}

function revertChanges() {
  if (isEmbedded()) {
    hostApi().onRevert?.().catch(() => {});
  }
  isDone = false;
  sentList.innerHTML = '';
  aiInput.dataset.state = 'idle';
  delete aiInput.dataset.statusDone;
  inputStatus.hidden = true;
  promptEditor.contentEditable = 'true';
  attachToggle.disabled = false;
  attachToggle.setAttribute('aria-label', 'Add attachment');
  sendBtn.setAttribute('aria-label', 'Send prompt');
  gsap.set(statusLine, { y: 0, opacity: 1 });
  clearEditor();
  syncEditorEmptyState();
  updateLayoutMode();
  updateSendState();
}

function resetControls() {
  document.documentElement.removeAttribute('style');
  buildControls();
  updateExport();
  showToast('Reset to defaults');
}

function filterControls(query) {
  const q = query.trim().toLowerCase();
  document.querySelectorAll('.control-section').forEach((section) => {
    const rows = section.querySelectorAll('.control-row');
    let visible = 0;
    rows.forEach((row) => {
      const match = !q || row.dataset.search.includes(q);
      row.hidden = !match;
      if (match) visible += 1;
    });
    section.hidden = visible === 0;
    if (q && visible > 0) section.open = true;
  });
}

/* ── Event listeners ── */
attachToggle.addEventListener('mousedown', (e) => {
  saveEditorCaret();
  e.preventDefault();
});

attachToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleMenu();
});

attachMenu.addEventListener('mousedown', (e) => {
  if (e.target.closest('[data-action="pick"]')) saveEditorCaret();
});

attachMenu.addEventListener('click', (e) => {
  const item = e.target.closest('[data-action]');
  if (!item) return;
  const action = item.dataset.action;
  if (action === 'dashboard') {
    openDashboard();
    return;
  }
  if (action === 'image') imageInput.click();
  if (action === 'pick') handlePickAction();
});

imageInput.addEventListener('change', () => {
  handleImageSelect(imageInput.files?.[0]);
  imageInput.value = '';
});

document.addEventListener('click', (e) => {
  if (!attachMenu.hidden && !e.target.closest('.ai-input__left')) closeMenu();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMenu();
});

promptEditor.addEventListener('beforeinput', hidePlaceholderForPendingInput);
promptEditor.addEventListener('compositionstart', () => {
  promptEditor.dataset.empty = 'false';
  promptPlaceholder.hidden = true;
});
promptEditor.addEventListener('input', queueEditorStateSync);

promptEditor.addEventListener('focus', () => {
  if (isLoading || isDone) return;
  aiInput.dataset.state = 'focused';
});
promptEditor.addEventListener('blur', () => {
  if (isLoading || isDone) return;
  aiInput.dataset.state = 'idle';
});

promptEditor.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (isDone) {
      revertChanges();
      return;
    }
    if (!sendBtn.disabled && !isLoading) sendBtn.click();
    return;
  }

  if (e.key === 'Backspace') {
    const selected = getSelectedToken();
    if (selected) {
      e.preventDefault();
      removeTokenElement(selected);
      syncEditorEmptyState();
      updateSendState();
      return;
    }
    const before = getAdjacentToken('before');
    if (before) {
      e.preventDefault();
      removeTokenElement(before);
      syncEditorEmptyState();
      updateSendState();
    }
    return;
  }

  if (e.key === 'Delete') {
    const selected = getSelectedToken();
    if (selected) {
      e.preventDefault();
      removeTokenElement(selected);
      syncEditorEmptyState();
      updateSendState();
      return;
    }
    const after = getAdjacentToken('after');
    if (after) {
      e.preventDefault();
      removeTokenElement(after);
      syncEditorEmptyState();
      updateSendState();
    }
  }
});

promptEditor.addEventListener('paste', (e) => {
  e.preventDefault();
  const text = e.clipboardData?.getData('text/plain').replace(/[\r\n]+/g, ' ') || '';
  if (text) insertTextAtCaret(text);
});

sendBtn.addEventListener('click', () => {
  if (isDone) {
    revertChanges();
    return;
  }
  if (sendBtn.disabled || isLoading) return;

  const snapshot = captureEditorSnapshot();
  const prompt = serializeEditor();
  const tokens = captureTokenPayload();

  if (!prefersReducedMotion) {
    gsap.fromTo(sendBtn, { scale: 1 }, { scale: 0.88, duration: 0.1, yoyo: true, repeat: 1, ease: 'power2.inOut' });
  }

  if (isEmbedded()) {
    enterLoadingState(snapshot, { autoFinish: false });
    hostApi().onSend({ prompt, tokens })
      .then(() => finishLoadingSequence())
      .catch((error) => abortLoadingState(error.message || String(error), { snapshot, tokens }));
    return;
  }

  enterLoadingState(snapshot);
});

document.querySelectorAll('.export-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.export-tab').forEach((t) => t.classList.remove('is-active'));
    tab.classList.add('is-active');
    exportFormat = tab.dataset.format;
    updateExport();
  });
});

if (copyBtn) {
copyBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(exportOutput.textContent);
    copyBtn.classList.add('is-copied');
    copyBtn.querySelector('span').textContent = 'Copied!';
    showToast('Config copied to clipboard');
    setTimeout(() => {
      copyBtn.classList.remove('is-copied');
      copyBtn.querySelector('span').textContent = 'Copy to clipboard';
    }, 1800);
  } catch {
    exportOutput.focus();
    document.execCommand('copy');
    showToast('Select and copy manually');
  }
});
}

if (resetBtn) resetBtn.addEventListener('click', resetControls);
if (controlSearch) controlSearch.addEventListener('input', () => filterControls(controlSearch.value));

function seedPlaygroundComposer() {
  if (!isPlayground || !promptEditor) return;
  promptEditor.innerHTML = 'remove this and all other adds ';
  const tokens = [
    { type: 'pick', label: 'a.ytLockupViewModelContentImage' },
    { type: 'pick', label: 'feed-ad-metadata-view-model' },
  ];
  tokens.forEach((stored) => {
    const tokenId = `demo_${++tokenCounter}`;
    tokenStore.set(tokenId, stored);
    const token = document.createElement('span');
    token.className = `ai-input__token${stored.type === 'pick' ? ' ai-input__token--pick' : ''}`;
    token.contentEditable = 'false';
    token.dataset.tokenId = tokenId;
    token.dataset.tokenType = stored.type;
    const labelEl = document.createElement('span');
    labelEl.className = 'ai-input__token-label';
    labelEl.textContent = stored.label;
    token.appendChild(labelEl);
    promptEditor.appendChild(document.createTextNode(' '));
    promptEditor.appendChild(token);
  });
  syncEditorEmptyState();
  updateLayoutMode();
  updateSendState();
}

/* ── Init ── */
if (isPlayground) {
  buildControls();
  updateExport();
  seedPlaygroundComposer();
}
syncEditorEmptyState();
updateLayoutMode({ animate: false });
updateSendState();
resetAiInputMotionStyles();
resetPanelMotionStyles();

new ResizeObserver(() => {
  if (!layoutReady) return;
  updateLayoutMode();
}).observe(aiInput);

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    layoutReady = true;
    updateLayoutMode({ animate: false });
    resetAiInputMotionStyles();
    resetPanelMotionStyles();
  });
});

if (!prefersReducedMotion && isPlayground && typeof gsap !== 'undefined') {
  gsap.from('.stage-eyebrow, .stage-title, .stage-desc', {
    y: 24,
    opacity: 0,
    duration: 0.7,
    stagger: 0.1,
    ease: 'power3.out',
  });
}

} /* end aiInput guard */
