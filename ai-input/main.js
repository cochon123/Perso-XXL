const aiInput = document.getElementById('ai-input');
const attachToggle = document.getElementById('attach-toggle');
const attachMenu = document.getElementById('attach-menu');
const imageInput = document.getElementById('image-input');
const promptEditor = document.getElementById('prompt-editor');
const promptPlaceholder = document.getElementById('prompt-placeholder');
const sendBtn = document.getElementById('send-btn');
const sentList = document.getElementById('sent-list');
const inputStatus = document.getElementById('input-status');
const statusLabel = document.getElementById('status-label');
const statusLine = document.getElementById('status-line');
const statusDots = document.getElementById('status-dots');
const controlSections = document.getElementById('control-sections');
const exportOutput = document.getElementById('export-output');
const copyBtn = document.getElementById('copy-btn');
const resetBtn = document.getElementById('reset-btn');
const controlSearch = document.getElementById('control-search');
const toast = document.getElementById('toast');

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** @type {Map<string, { type: string, label: string, url?: string }>} */
const tokenStore = new Map();

let tokenCounter = 0;

let exportFormat = 'css';
let toastTimer;

const LOADING_MESSAGES = [
  'analysing your intent',
  'thinking about the next step',
  'considering edge case',
  'finalising the result',
];
const LOADING_DURATION_MS = 10000;
const LOADING_MESSAGE_INTERVAL_MS = 2000;
const LOADING_DONE_HOLD_MS = 1200;

let loadingInterval = null;
let loadingFinishTimeout = null;
let loadingDoneTimeout = null;
let loadingMessageIndex = 0;
let isLoading = false;

const CONTROL_GROUPS = [
  {
    title: 'Layout',
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
  updateExport();
}

function formatDisplayValue(control, raw) {
  if (control.type === 'range') {
    const n = parseFloat(raw);
    if (control.unit === 'ms') return `${n}ms`;
    if (control.unit === 'px') return `${n}px`;
    if (control.key === '--ai-font-weight') return String(n);
    if (control.key === '--ai-shadow-opacity' || control.key === '--ai-glow-opacity') return n.toFixed(2);
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
        const current = parseFloat(getCssValue(control.key)) || control.min;
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
  const lines = ['.ai-input {'];
  Object.entries(vars).forEach(([key, val]) => {
    lines.push(`  ${key}: ${val};`);
  });
  lines.push('}');
  return lines.join('\n');
}

function buildJsonExport(vars) {
  return JSON.stringify({ component: 'ai-input', cssVariables: vars }, null, 2);
}

function updateExport() {
  const vars = getAllCssVars();
  exportOutput.textContent = exportFormat === 'css' ? buildCssExport(vars) : buildJsonExport(vars);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2400);
}

function openMenu() {
  attachMenu.hidden = false;
  attachToggle.setAttribute('aria-expanded', 'true');
  if (!prefersReducedMotion) {
    gsap.fromTo(attachMenu, { opacity: 0, y: 8, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.28, ease: 'back.out(1.4)' });
    gsap.from('.ai-input__menu-item', { opacity: 0, x: -8, duration: 0.22, stagger: 0.05, ease: 'power2.out', delay: 0.04 });
  }
}

function closeMenu() {
  attachMenu.hidden = true;
  attachToggle.setAttribute('aria-expanded', 'false');
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
  document.querySelector('.ai-input__left'),
  promptEditor.closest('.ai-input__field-wrap'),
  sendBtn,
].filter(Boolean);

let layoutAnimating = false;

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
  document.body.appendChild(clone);

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

  if (prefersReducedMotion || typeof gsap === 'undefined') {
    setLayoutMode(nextMultiline);
    return;
  }

  const targets = layoutAnimTargets();
  const firstRects = targets.map((el) => el.getBoundingClientRect());

  layoutAnimating = true;
  aiInput.dataset.layoutAnimating = 'true';
  setLayoutMode(nextMultiline);

  let completed = 0;
  const finish = () => {
    completed += 1;
    if (completed < targets.length) return;
    layoutAnimating = false;
    delete aiInput.dataset.layoutAnimating;
    targets.forEach((el) => gsap.set(el, { clearProps: 'transform' }));
  };

  targets.forEach((el, index) => {
    const first = firstRects[index];
    const last = el.getBoundingClientRect();
    gsap.killTweensOf(el, 'x,y');
    gsap.fromTo(
      el,
      { x: first.left - last.left, y: first.top - last.top },
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
    { scale: 1, duration: LAYOUT_ANIM_DURATION, ease: 'power2.out' },
  );
}

function updateLayoutMode() {
  const shouldMultiline = contentWrapsToMultipleLines();
  const isMultiline = aiInput.dataset.multiline === 'true';
  if (shouldMultiline === isMultiline) return;
  animateLayoutChange(shouldMultiline);
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
  if (!sel?.rangeCount) {
    promptEditor.appendChild(node);
    placeCaretAfter(node);
    return;
  }

  const range = sel.getRangeAt(0);
  if (!promptEditor.contains(range.commonAncestorContainer)) {
    promptEditor.appendChild(node);
    placeCaretAfter(node);
    return;
  }

  range.deleteContents();
  range.insertNode(node);
  placeCaretAfter(node);
}

function createTokenElement({ type, label, url }) {
  tokenCounter += 1;
  const id = `token_${tokenCounter}`;
  tokenStore.set(id, { type, label, url });

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
  sendBtn.disabled = !editorHasContent();
}

function simulatePick() {
  insertToken({ type: 'pick', label: 'button.submit-btn' });
  showToast('Element selected — button.submit-btn');
  closeMenu();
}

function handleImageSelect(file) {
  if (!file) return;
  insertToken({ type: 'image', label: file.name, url: URL.createObjectURL(file) });
  showToast(`Image attached — ${file.name}`);
  closeMenu();
}

function captureEditorSnapshot() {
  return {
    html: promptEditor.innerHTML,
    text: serializeEditor(),
  };
}

function appendSentBubble(snapshot) {
  const bubble = document.createElement('div');
  bubble.className = 'ai-sent-bubble';
  bubble.innerHTML = snapshot.html || snapshot.text;
  sentList.appendChild(bubble);

  if (!prefersReducedMotion) {
    gsap.fromTo(
      bubble,
      { opacity: 0, y: 14, scale: 0.98 },
      { opacity: 1, y: 0, scale: 1, duration: 0.38, ease: 'power2.out' },
    );
  }
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

function enterLoadingState(snapshot) {
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
  loadingFinishTimeout = setTimeout(finishLoadingSequence, LOADING_DURATION_MS);
}

function finishLoadingSequence() {
  if (!isLoading) return;
  clearInterval(loadingInterval);
  clearTimeout(loadingFinishTimeout);
  loadingInterval = null;
  loadingFinishTimeout = null;

  if (prefersReducedMotion) {
    setStatusMessage('Done!', { animate: false, showDots: false });
    loadingDoneTimeout = setTimeout(resetAfterLoading, LOADING_DONE_HOLD_MS);
    return;
  }

  gsap.to(statusLine, {
    y: -18,
    opacity: 0,
    duration: 0.24,
    ease: 'power2.in',
    onComplete: () => {
      setStatusMessage('Done!', { animate: true, showDots: false });
      loadingDoneTimeout = setTimeout(resetAfterLoading, LOADING_DONE_HOLD_MS);
    },
  });
}

function resetAfterLoading() {
  isLoading = false;
  delete aiInput.dataset.statusDone;
  aiInput.dataset.state = 'idle';
  inputStatus.hidden = true;
  promptEditor.contentEditable = 'true';
  attachToggle.disabled = false;
  attachToggle.setAttribute('aria-label', 'Add attachment');
  gsap.set(statusLine, { y: 0, opacity: 1 });
  syncEditorEmptyState();
  updateLayoutMode();
  updateSendState();
  clearTimeout(loadingDoneTimeout);
  loadingDoneTimeout = null;
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
attachToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  toggleMenu();
});

attachMenu.addEventListener('click', (e) => {
  const item = e.target.closest('[data-action]');
  if (!item) return;
  const action = item.dataset.action;
  if (action === 'image') imageInput.click();
  if (action === 'pick') simulatePick();
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

promptEditor.addEventListener('input', () => {
  syncEditorEmptyState();
  updateLayoutMode();
  updateSendState();
});

promptEditor.addEventListener('focus', () => { aiInput.dataset.state = 'focused'; });
promptEditor.addEventListener('blur', () => { aiInput.dataset.state = 'idle'; });

promptEditor.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
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
  document.execCommand('insertText', false, text);
});

sendBtn.addEventListener('click', () => {
  if (sendBtn.disabled || isLoading) return;
  const snapshot = captureEditorSnapshot();

  if (!prefersReducedMotion) {
    gsap.fromTo(sendBtn, { scale: 1 }, { scale: 0.88, duration: 0.1, yoyo: true, repeat: 1, ease: 'power2.inOut' });
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

resetBtn.addEventListener('click', resetControls);
controlSearch.addEventListener('input', () => filterControls(controlSearch.value));

/* ── Init ── */
buildControls();
updateExport();
syncEditorEmptyState();
updateLayoutMode();
updateSendState();

new ResizeObserver(() => updateLayoutMode()).observe(aiInput);

if (!prefersReducedMotion) {
  gsap.from('.stage-eyebrow, .stage-title, .stage-desc', {
    y: 24,
    opacity: 0,
    duration: 0.7,
    stagger: 0.1,
    ease: 'power3.out',
  });

  gsap.from('.ai-input', {
    y: 30,
    opacity: 0,
    duration: 0.85,
    delay: 0.25,
    ease: 'back.out(1.2)',
  });

  gsap.from('.panel', {
    x: 40,
    opacity: 0,
    duration: 0.7,
    delay: 0.15,
    ease: 'power3.out',
  });
}
