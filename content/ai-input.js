window.PersoAiInput = (() => {
  const LOADING_MESSAGES = [
    "analysing your intent",
    "thinking about the next step",
    "considering edge case",
    "finalising the result"
  ];
  const LOADING_MESSAGE_INTERVAL_MS = 2000;
  const LOADING_DONE_HOLD_MS = 1200;
  const LAYOUT_ANIM_DURATION = 0.26;

  const MARKUP = `
    <div class="ai-sent-list" data-role="sent-list" aria-live="polite"></div>
    <div class="ai-input" data-role="ai-input" data-state="idle" data-multiline="false">
      <div class="ai-input__body">
        <div class="ai-input__left">
          <button
            type="button"
            class="ai-input__btn ai-input__btn--attach"
            data-role="attach-toggle"
            aria-label="Add attachment"
            aria-expanded="false"
            aria-haspopup="menu"
          >
            <svg class="ai-input__icon ai-input__icon--plus" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <span class="ai-input__loader" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <g transform="translate(12 12)">
                  <circle r="9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="28 56" transform="rotate(-90)"/>
                </g>
              </svg>
            </span>
          </button>
          <div class="ai-input__menu" data-role="attach-menu" role="menu" hidden>
            <button type="button" class="ai-input__menu-item" role="menuitem" data-action="image">
              <span class="ai-input__menu-icon">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.75"/>
                  <circle cx="8.5" cy="10.5" r="1.75" fill="currentColor"/>
                  <path d="M21 16l-5.5-5.5a1.5 1.5 0 0 0-2.12 0L3 19" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                </svg>
              </span>
              <span class="ai-input__menu-text">
                <strong>Add image</strong>
                <small>Upload a reference</small>
              </span>
            </button>
            <button type="button" class="ai-input__menu-item" role="menuitem" data-action="pick">
              <span class="ai-input__menu-icon">
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 4l7 16 2.5-6.5L20 11 4 4z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>
                  <path d="M13 13l6 6" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                </svg>
              </span>
              <span class="ai-input__menu-text">
                <strong>Pick from page</strong>
                <small>Select an element</small>
              </span>
            </button>
          </div>
          <input type="file" data-role="image-input" accept="image/*" hidden />
        </div>
        <div class="ai-input__field-wrap">
          <div
            class="ai-input__editor"
            data-role="prompt-editor"
            contenteditable="true"
            role="textbox"
            aria-multiline="true"
            aria-label="Describe what you want to change"
            spellcheck="true"
          ></div>
          <span class="ai-input__placeholder" data-role="prompt-placeholder" aria-hidden="true">
            Describe what you want to change…
          </span>
          <div class="ai-input__status" data-role="input-status" hidden>
            <div class="ai-input__status-viewport">
              <div class="ai-input__status-line" data-role="status-line">
                <span class="ai-input__status-label" data-role="status-label"></span>
                <span class="ai-input__dots" data-role="status-dots" aria-hidden="true">
                  <span></span><span></span><span></span>
                </span>
              </div>
            </div>
          </div>
        </div>
        <button
          type="button"
          class="ai-input__btn ai-input__btn--send"
          data-role="send-btn"
          aria-label="Send prompt"
          disabled
        >
          <svg class="ai-input__icon ai-input__icon--send" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  function createMotion() {
    const hasGsap = typeof gsap !== "undefined";

    function applyTransform(el, x = 0, y = 0) {
      el.style.transform = x || y ? `translate(${x}px, ${y}px)` : "";
    }

    return {
      set(el, props) {
        if (hasGsap) {
          gsap.set(el, props);
          return;
        }
        if (props.opacity !== undefined) el.style.opacity = String(props.opacity);
        if (props.x !== undefined || props.y !== undefined) applyTransform(el, props.x || 0, props.y || 0);
        if (props.clearProps === "transform") {
          el.style.transform = "";
          el.style.opacity = "";
        }
      },
      fromTo(el, from, to) {
        if (hasGsap) {
          gsap.fromTo(el, from, to);
          return;
        }
        const duration = (to.duration || 0.26) * 1000;
        if (from.opacity !== undefined) el.style.opacity = String(from.opacity);
        applyTransform(el, from.x || 0, from.y || 0);
        requestAnimationFrame(() => {
          el.style.transition = `transform ${duration}ms ease, opacity ${duration}ms ease`;
          applyTransform(el, to.x || 0, to.y || 0);
          if (to.opacity !== undefined) el.style.opacity = String(to.opacity);
          setTimeout(() => {
            el.style.transition = "";
            to.onComplete?.();
          }, duration);
        });
      },
      to(el, to) {
        if (hasGsap) {
          gsap.to(el, to);
          return;
        }
        const duration = (to.duration || 0.26) * 1000;
        requestAnimationFrame(() => {
          el.style.transition = `transform ${duration}ms ease, opacity ${duration}ms ease`;
          if (to.y !== undefined || to.x !== undefined) applyTransform(el, to.x || 0, to.y || 0);
          if (to.opacity !== undefined) el.style.opacity = String(to.opacity);
          setTimeout(() => {
            el.style.transition = "";
            to.onComplete?.();
          }, duration);
        });
      },
      killTweensOf(el) {
        if (hasGsap) gsap.killTweensOf(el, "x,y");
      }
    };
  }

  function init(stackRoot, handlers = {}) {
    const motion = createMotion();
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const aiInput = stackRoot.querySelector('[data-role="ai-input"]');
    const attachToggle = stackRoot.querySelector('[data-role="attach-toggle"]');
    const attachMenu = stackRoot.querySelector('[data-role="attach-menu"]');
    const imageInput = stackRoot.querySelector('[data-role="image-input"]');
    const promptEditor = stackRoot.querySelector('[data-role="prompt-editor"]');
    const promptPlaceholder = stackRoot.querySelector('[data-role="prompt-placeholder"]');
    const sendBtn = stackRoot.querySelector('[data-role="send-btn"]');
    const sentList = stackRoot.querySelector('[data-role="sent-list"]');
    const inputStatus = stackRoot.querySelector('[data-role="input-status"]');
    const statusLabel = stackRoot.querySelector('[data-role="status-label"]');
    const statusLine = stackRoot.querySelector('[data-role="status-line"]');
    const statusDots = stackRoot.querySelector('[data-role="status-dots"]');

    /** @type {Map<string, { type: string, label: string, url?: string, selectionId?: string }>} */
    const tokenStore = new Map();
    let tokenCounter = 0;
    let layoutAnimating = false;
    let loadingInterval = null;
    let loadingDoneTimeout = null;
    let loadingMessageIndex = 0;
    let isLoading = false;
    let panelDisabled = false;

    function getCssValue(name, fallback) {
      const value = getComputedStyle(stackRoot.closest("#perso-xxl-panel") || document.documentElement)
        .getPropertyValue(name)
        .trim();
      return value || String(fallback);
    }

    function getNumericVar(name, fallback) {
      return parseFloat(getCssValue(name, fallback)) || fallback;
    }

    function closeMenu() {
      attachMenu.hidden = true;
      attachToggle.setAttribute("aria-expanded", "false");
    }

    function openMenu() {
      attachMenu.hidden = false;
      attachToggle.setAttribute("aria-expanded", "true");
    }

    function toggleMenu() {
      if (attachMenu.hidden) openMenu();
      else closeMenu();
    }

    function getEditorPlainText() {
      return promptEditor.textContent.replace(/\u200B/g, "").trim();
    }

    function editorHasContent() {
      return getEditorPlainText().length > 0 || promptEditor.querySelector(".ai-input__token") !== null;
    }

    function syncEditorEmptyState() {
      const empty = !editorHasContent();
      promptEditor.dataset.empty = empty ? "true" : "false";
      promptPlaceholder.hidden = !empty;
    }

    function getSingleRowEditorWidth() {
      const btnSize = getNumericVar("--ai-btn-size", 40);
      const gap = getNumericVar("--ai-gap", 8);
      const padX = getNumericVar("--ai-padding-x", 6);
      return Math.max(120, aiInput.clientWidth - (btnSize * 2) - (gap * 2) - (padX * 2) - 12);
    }

    function layoutAnimTargets() {
      return [
        stackRoot.querySelector(".ai-input__left"),
        promptEditor.closest(".ai-input__field-wrap"),
        sendBtn
      ].filter(Boolean);
    }

    function contentWrapsToMultipleLines() {
      if (promptEditor.dataset.empty === "true") return false;

      const clone = promptEditor.cloneNode(true);
      clone.removeAttribute("id");
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
      const isMultiline = aiInput.dataset.multiline === "true";
      const threshold = isMultiline ? 1.35 : 1.55;
      const wraps = clone.scrollHeight > lineHeight * threshold;
      clone.remove();
      return wraps;
    }

    function setLayoutMode(multiline) {
      aiInput.dataset.multiline = multiline ? "true" : "false";
    }

    function animateLayoutChange(nextMultiline) {
      if (layoutAnimating) {
        setLayoutMode(nextMultiline);
        return;
      }

      if (prefersReducedMotion) {
        setLayoutMode(nextMultiline);
        return;
      }

      const targets = layoutAnimTargets();
      const firstRects = targets.map((el) => el.getBoundingClientRect());

      layoutAnimating = true;
      aiInput.dataset.layoutAnimating = "true";
      setLayoutMode(nextMultiline);

      let completed = 0;
      const finish = () => {
        completed += 1;
        if (completed < targets.length) return;
        layoutAnimating = false;
        delete aiInput.dataset.layoutAnimating;
        targets.forEach((el) => motion.set(el, { clearProps: "transform" }));
      };

      targets.forEach((el, index) => {
        const first = firstRects[index];
        const last = el.getBoundingClientRect();
        motion.killTweensOf(el);
        motion.fromTo(
          el,
          { x: first.left - last.left, y: first.top - last.top },
          { x: 0, y: 0, duration: LAYOUT_ANIM_DURATION, onComplete: finish }
        );
      });

      motion.fromTo(aiInput, { scale: nextMultiline ? 0.992 : 0.996 }, { scale: 1, duration: LAYOUT_ANIM_DURATION });
    }

    function updateLayoutMode() {
      const shouldMultiline = contentWrapsToMultipleLines();
      const isMultiline = aiInput.dataset.multiline === "true";
      if (shouldMultiline === isMultiline) return;
      animateLayoutChange(shouldMultiline);
    }

    function placeCaretAfter(node) {
      const space = document.createTextNode("\u200B");
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

    function createTokenElement({ type, label, url, selectionId }) {
      tokenCounter += 1;
      const id = `token_${tokenCounter}`;
      tokenStore.set(id, { type, label, url, selectionId });

      const token = document.createElement("span");
      token.className = `ai-input__token${type === "pick" ? " ai-input__token--pick" : ""}`;
      token.contentEditable = "false";
      token.dataset.tokenId = id;
      token.dataset.tokenType = type;

      if (type === "image" && url) {
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        token.appendChild(img);
      }

      const labelEl = document.createElement("span");
      labelEl.className = "ai-input__token-label";
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
    }

    function removeTokenElement(token) {
      const id = token.dataset.tokenId;
      const stored = tokenStore.get(id);
      if (stored) handlers.onRemoveToken?.(stored);
      if (stored?.type === "image" && stored.url) URL.revokeObjectURL(stored.url);
      tokenStore.delete(id);

      const prev = token.previousSibling;
      const next = token.nextSibling;
      token.remove();
      if (next?.nodeType === Node.TEXT_NODE && next.textContent === "\u200B") next.remove();
      if (prev?.nodeType === Node.TEXT_NODE && prev.textContent === "\u200B") prev.remove();
    }

    function getAdjacentToken(direction) {
      const sel = window.getSelection();
      if (!sel?.rangeCount || !sel.isCollapsed) return null;

      const { anchorNode, anchorOffset } = sel;
      if (!anchorNode || !promptEditor.contains(anchorNode)) return null;

      if (direction === "before") {
        if (anchorNode.nodeType === Node.TEXT_NODE) {
          if (anchorOffset === 0) {
            let prev = anchorNode.previousSibling;
            if (prev?.nodeType === Node.TEXT_NODE && prev.textContent === "\u200B") prev = prev.previousSibling;
            if (prev?.nodeType === Node.ELEMENT_NODE && prev.classList?.contains("ai-input__token")) return prev;
          }
          return null;
        }
        if (anchorNode === promptEditor && anchorOffset > 0) {
          const child = promptEditor.childNodes[anchorOffset - 1];
          if (child?.nodeType === Node.ELEMENT_NODE && child.classList?.contains("ai-input__token")) return child;
        }
      }

      if (direction === "after") {
        if (anchorNode.nodeType === Node.TEXT_NODE) {
          const text = anchorNode.textContent || "";
          if (anchorOffset >= text.length) {
            let next = anchorNode.nextSibling;
            if (next?.nodeType === Node.ELEMENT_NODE && next.classList?.contains("ai-input__token")) return next;
          }
          return null;
        }
        if (anchorNode === promptEditor) {
          const child = promptEditor.childNodes[anchorOffset];
          if (child?.nodeType === Node.ELEMENT_NODE && child.classList?.contains("ai-input__token")) return child;
        }
      }

      return null;
    }

    function getSelectedToken() {
      const sel = window.getSelection();
      if (!sel?.rangeCount) return null;
      const node = sel.anchorNode;
      if (node?.nodeType === Node.ELEMENT_NODE && node.classList?.contains("ai-input__token")) return node;
      return node?.parentElement?.closest?.(".ai-input__token") || null;
    }

    function clearEditor({ revokeAssets = true } = {}) {
      if (revokeAssets) {
        tokenStore.forEach((stored) => {
          if (stored.type === "image" && stored.url) URL.revokeObjectURL(stored.url);
        });
      }
      tokenStore.clear();
      promptEditor.innerHTML = "";
      syncEditorEmptyState();
      updateLayoutMode();
    }

    function serializeEditor() {
      const parts = [];
      promptEditor.childNodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent.replace(/\u200B/g, "");
          if (text) parts.push(text);
          return;
        }
        if (node.nodeType === Node.ELEMENT_NODE && node.classList?.contains("ai-input__token")) {
          const stored = tokenStore.get(node.dataset.tokenId);
          if (stored?.type === "image") parts.push(`[image:${stored.label}]`);
          if (stored?.type === "pick") parts.push(`[element:${stored.label}]`);
        }
      });
      return parts.join(" ").replace(/\s+/g, " ").trim();
    }

    function updateSendState() {
      sendBtn.disabled = panelDisabled || !editorHasContent() || isLoading;
    }

    function captureEditorSnapshot() {
      return {
        html: promptEditor.innerHTML,
        text: serializeEditor()
      };
    }

    function appendSentBubble(snapshot) {
      const bubble = document.createElement("div");
      bubble.className = "ai-sent-bubble";
      bubble.innerHTML = snapshot.html || snapshot.text;
      sentList.appendChild(bubble);

      if (!prefersReducedMotion) {
        motion.fromTo(bubble, { opacity: 0, y: 14, scale: 0.98 }, { opacity: 1, y: 0, scale: 1, duration: 0.38 });
      }
    }

    function setStatusMessage(text, { animate = true, showDots = true } = {}) {
      statusLabel.textContent = text;
      statusDots.hidden = !showDots;
      aiInput.dataset.statusDone = showDots ? "false" : "true";

      if (!animate || prefersReducedMotion) {
        motion.set(statusLine, { y: 0, opacity: 1 });
        return;
      }

      motion.fromTo(statusLine, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.32 });
    }

    function cycleStatusMessage() {
      if (!isLoading) return;

      if (prefersReducedMotion) {
        loadingMessageIndex = (loadingMessageIndex + 1) % LOADING_MESSAGES.length;
        setStatusMessage(LOADING_MESSAGES[loadingMessageIndex], { animate: false });
        return;
      }

      motion.to(statusLine, {
        y: -18,
        opacity: 0,
        duration: 0.24,
        onComplete: () => {
          if (!isLoading) return;
          loadingMessageIndex = (loadingMessageIndex + 1) % LOADING_MESSAGES.length;
          setStatusMessage(LOADING_MESSAGES[loadingMessageIndex], { animate: true });
        }
      });
    }

    function enterLoadingState(snapshot) {
      if (isLoading) return;
      isLoading = true;
      closeMenu();

      appendSentBubble(snapshot);
      aiInput.dataset.multiline = "false";
      aiInput.dataset.state = "loading";
      promptEditor.contentEditable = "false";
      inputStatus.hidden = false;
      attachToggle.setAttribute("aria-label", "Processing");
      attachToggle.disabled = true;
      sendBtn.disabled = true;

      loadingMessageIndex = 0;
      setStatusMessage(LOADING_MESSAGES[0], { animate: false });
      updateLayoutMode();

      loadingInterval = setInterval(cycleStatusMessage, LOADING_MESSAGE_INTERVAL_MS);
    }

    function stopLoadingTimers() {
      clearInterval(loadingInterval);
      clearTimeout(loadingDoneTimeout);
      loadingInterval = null;
      loadingDoneTimeout = null;
    }

    function resetAfterLoading() {
      isLoading = false;
      delete aiInput.dataset.statusDone;
      aiInput.dataset.state = "idle";
      inputStatus.hidden = true;
      promptEditor.contentEditable = "true";
      attachToggle.disabled = panelDisabled;
      attachToggle.setAttribute("aria-label", "Add attachment");
      motion.set(statusLine, { y: 0, opacity: 1 });
      clearEditor({ revokeAssets: true });
      syncEditorEmptyState();
      updateLayoutMode();
      updateSendState();
      stopLoadingTimers();
    }

    function failLoading() {
      if (!isLoading) return;
      stopLoadingTimers();

      const lastBubble = sentList.lastElementChild;
      if (lastBubble?.classList.contains("ai-sent-bubble")) lastBubble.remove();

      isLoading = false;
      delete aiInput.dataset.statusDone;
      aiInput.dataset.state = "idle";
      inputStatus.hidden = true;
      promptEditor.contentEditable = panelDisabled ? "false" : "true";
      attachToggle.disabled = panelDisabled;
      attachToggle.setAttribute("aria-label", "Add attachment");
      motion.set(statusLine, { y: 0, opacity: 1 });
      syncEditorEmptyState();
      updateLayoutMode();
      updateSendState();
    }

    function finishLoading() {
      if (!isLoading) return Promise.resolve();
      stopLoadingTimers();

      return new Promise((resolve) => {
        const done = () => {
          loadingDoneTimeout = setTimeout(() => {
            resetAfterLoading();
            resolve();
          }, LOADING_DONE_HOLD_MS);
        };

        if (prefersReducedMotion) {
          setStatusMessage("Done!", { animate: false, showDots: false });
          done();
          return;
        }

        motion.to(statusLine, {
          y: -18,
          opacity: 0,
          duration: 0.24,
          onComplete: () => {
            setStatusMessage("Done!", { animate: true, showDots: false });
            done();
          }
        });
      });
    }

    function setPromptText(text) {
      clearEditor({ revokeAssets: true });
      if (!text) {
        syncEditorEmptyState();
        updateSendState();
        return;
      }
      promptEditor.textContent = text;
      syncEditorEmptyState();
      updateLayoutMode();
      updateSendState();
    }

    function setDisabled(disabled) {
      panelDisabled = disabled;
      attachToggle.disabled = disabled || isLoading;
      sendBtn.disabled = disabled || !editorHasContent() || isLoading;
      promptEditor.contentEditable = disabled || isLoading ? "false" : "true";
    }

    attachToggle.addEventListener("click", (event) => {
      event.stopPropagation();
      if (panelDisabled || isLoading) return;
      toggleMenu();
    });

    attachMenu.addEventListener("click", async (event) => {
      const item = event.target.closest("[data-action]");
      if (!item || panelDisabled || isLoading) return;

      const action = item.dataset.action;
      closeMenu();

      if (action === "image") {
        imageInput.click();
        return;
      }

      if (action === "pick") {
        try {
          const result = await handlers.onPick?.();
          if (result) insertToken(result);
        } catch (_error) {
          /* picker cancelled or failed */
        }
      }
    });

    imageInput.addEventListener("change", async () => {
      const file = imageInput.files?.[0];
      imageInput.value = "";
      if (!file || panelDisabled || isLoading) return;

      try {
        const result = await handlers.onImage?.(file);
        if (result) insertToken(result);
      } catch (_error) {
        /* image rejected */
      }
    });

    stackRoot.addEventListener("click", (event) => {
      if (!attachMenu.hidden && !event.target.closest(".ai-input__left")) closeMenu();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !attachMenu.hidden) closeMenu();
    });

    promptEditor.addEventListener("input", () => {
      syncEditorEmptyState();
      updateLayoutMode();
      updateSendState();
    });

    promptEditor.addEventListener("focus", () => {
      if (!isLoading) aiInput.dataset.state = "focused";
    });

    promptEditor.addEventListener("blur", () => {
      if (!isLoading) aiInput.dataset.state = "idle";
    });

    promptEditor.addEventListener("keydown", (event) => {
      if (panelDisabled || isLoading) return;

      if (event.key === "Enter") {
        event.preventDefault();
        if (!sendBtn.disabled) sendBtn.click();
        return;
      }

      if (event.key === "Backspace") {
        const selected = getSelectedToken();
        if (selected) {
          event.preventDefault();
          removeTokenElement(selected);
          syncEditorEmptyState();
          updateSendState();
          return;
        }
        const before = getAdjacentToken("before");
        if (before) {
          event.preventDefault();
          removeTokenElement(before);
          syncEditorEmptyState();
          updateSendState();
        }
        return;
      }

      if (event.key === "Delete") {
        const selected = getSelectedToken();
        if (selected) {
          event.preventDefault();
          removeTokenElement(selected);
          syncEditorEmptyState();
          updateSendState();
          return;
        }
        const after = getAdjacentToken("after");
        if (after) {
          event.preventDefault();
          removeTokenElement(after);
          syncEditorEmptyState();
          updateSendState();
        }
      }
    });

    promptEditor.addEventListener("paste", (event) => {
      event.preventDefault();
      const text = event.clipboardData?.getData("text/plain").replace(/[\r\n]+/g, " ") || "";
      document.execCommand("insertText", false, text);
    });

    sendBtn.addEventListener("click", async () => {
      if (sendBtn.disabled || isLoading || panelDisabled) return;
      const snapshot = captureEditorSnapshot();
      const prompt = snapshot.text;

      if (!prefersReducedMotion) {
        motion.fromTo(sendBtn, { scale: 1 }, { scale: 0.88, duration: 0.1 });
      }

      enterLoadingState(snapshot);

      try {
        await handlers.onSend?.(prompt, snapshot);
        await finishLoading();
      } catch (_error) {
        failLoading();
        throw _error;
      }
    });

    syncEditorEmptyState();
    updateLayoutMode();
    updateSendState();

    new ResizeObserver(() => updateLayoutMode()).observe(aiInput);

    return {
      focus: () => promptEditor.focus(),
      getPromptText: serializeEditor,
      setPromptText,
      insertToken,
      enterLoadingState,
      finishLoading,
      failLoading,
      setDisabled,
      clearEditor
    };
  }

  return { MARKUP, init };
})();
