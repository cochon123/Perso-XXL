/**
 * Perso XXL — Prompt bar matching the chat-interface playground (no GSAP, extension context).
 */
(function () {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /** @type {Map<string, { type: string, label: string, url?: string, file?: File, selection?: object }>} */
  let tokenStore = new Map();

  let tokenCounter = 0;
  /** @type {Range | null} */
  let savedEditorRange = null;

  let aiInput = null;
  /** @type {HTMLElement | null} */
  let panel = null;
  let attachToggle = null;
  let attachMenu = null;
  let imageInput = null;
  let promptEditor = null;
  let promptPlaceholder = null;
  let sendBtn = null;
  let sentList = null;
  let inputStatus = null;
  let statusLabel = null;
  let statusLine = null;
  let statusDots = null;

  /** @type {{ toast?: (msg: string) => void, onPick?: () => Promise<object | null>, onSend?: () => Promise<void>, onRevert?: () => Promise<void> } | null} */
  let hooks = null;

  let interactLocked = false;
  /** @type {(() => void) | null} */
  let outsideClickListenId = null;
  /** @type {((e: KeyboardEvent) => void) | null} */
  let escapeKeyListenId = null;
  /** @type {ResizeObserver | null} */
  let inputResizeObserver = null;

  const LOADING_MESSAGES = [
    "analysing your intent",
    "thinking about the next step",
    "considering edge case",
    "finalising the result",
  ];
  const LOADING_MESSAGE_INTERVAL_MS = 2000;

  let loadingInterval = null;
  let loadingMessageIndex = 0;
  let isLoading = false;
  let isDone = false;

  function toast(msg) {
    hooks?.toast?.(msg);
  }

  function getComputedVar(key, root) {
    return getComputedStyle(root).getPropertyValue(key).trim();
  }

  function getNumericVar(name, fallback) {
    return parseFloat(getComputedVar(name, panel)) || fallback;
  }

  function getSingleRowEditorWidth() {
    const btnSize = getNumericVar("--ai-btn-size", 40);
    const gap = getNumericVar("--ai-gap", 8);
    const padX = getNumericVar("--ai-padding-x", 6);
    return Math.max(120, aiInput.clientWidth - (btnSize * 2) - (gap * 2) - (padX * 2) - 12);
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

  function queueEditorStateSync() {
    requestAnimationFrame(() => {
      syncEditorEmptyState();
      updateLayoutMode();
      updateSendState();
    });
  }

  function hidePlaceholderForPendingInput(e) {
    if (!e.inputType?.startsWith("insert") && e.inputType !== "formatSetBlockTextDirection") return;
    promptEditor.dataset.empty = "false";
    promptPlaceholder.hidden = true;
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

  function createTokenElement(entry, forcedId) {
    let id = forcedId;
    if (!id) {
      tokenCounter += 1;
      id = `token_${tokenCounter}`;
    } else {
      const numericId = Number(id.replace(/^token_/, ""));
      if (Number.isFinite(numericId)) tokenCounter = Math.max(tokenCounter, numericId);
    }
    tokenStore.set(id, entry);

    const token = document.createElement("span");
    token.className = `ai-input__token${entry.type === "pick" ? " ai-input__token--pick" : ""}`;
    token.contentEditable = "false";
    token.dataset.tokenId = id;
    token.dataset.tokenType = entry.type;

    if (entry.type === "image" && entry.url) {
      const img = document.createElement("img");
      img.src = entry.url;
      img.alt = "";
      token.appendChild(img);
    }

    const labelEl = document.createElement("span");
    labelEl.className = "ai-input__token-label";
    labelEl.textContent = entry.label;
    token.appendChild(labelEl);

    return token;
  }

  function insertToken(entry) {
    const token = createTokenElement(entry);
    insertAtCaret(token);
    syncEditorEmptyState();
    updateLayoutMode();
    updateSendState();
  }

  function removeTokenElement(tok) {
    const id = tok.dataset.tokenId;
    const stored = tokenStore.get(id);
    if (stored?.type === "image" && stored.url) URL.revokeObjectURL(stored.url);
    tokenStore.delete(id);

    const prev = tok.previousSibling;
    const next = tok.nextSibling;
    tok.remove();
    if (next?.nodeType === Node.TEXT_NODE && next.textContent === "\u200B") next.remove();
    if (prev?.nodeType === Node.TEXT_NODE && prev.textContent === "\u200B") prev.remove();
  }

  function getTokensIntersectingRange(range) {
    return Array.from(promptEditor.querySelectorAll(".ai-input__token")).filter((tok) => {
      try {
        return range.intersectsNode(tok);
      } catch {
        return false;
      }
    });
  }

  function getAdjacentToken(direction) {
    const sel = window.getSelection();
    if (!sel?.rangeCount || !sel.isCollapsed) return null;

    const { anchorNode, anchorOffset } = sel;
    if (!anchorNode || !promptEditor.contains(anchorNode)) return null;

    if (direction === "before") {
      if (anchorNode.nodeType === Node.TEXT_NODE) {
        const text = anchorNode.textContent || "";
        if (text === "\u200B" && anchorOffset > 0) return null;
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
        if (text === "\u200B" && anchorOffset < text.length) return null;
        if (anchorOffset >= text.length) {
          const next = anchorNode.nextSibling;
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

  function placeCaretInTextNode(textNode, offset) {
    const range = document.createRange();
    range.setStart(textNode, Math.max(0, Math.min(offset, textNode.textContent?.length || 0)));
    range.collapse(true);

    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  function deleteTextNodeChar(textNode, offset, direction) {
    const text = textNode.textContent || "";
    const index = direction === "before" ? offset - 1 : offset;
    if (index < 0 || index >= text.length) return false;

    textNode.textContent = text.slice(0, index) + text.slice(index + 1);
    placeCaretInTextNode(textNode, index);
    return true;
  }

  function deleteEditorText(direction) {
    const sel = window.getSelection();
    if (!sel?.rangeCount) return false;

    const range = sel.getRangeAt(0);
    if (!promptEditor.contains(range.commonAncestorContainer)) return false;

    if (!sel.isCollapsed) {
      const removedTokens = getTokensIntersectingRange(range);
      range.deleteContents();
      removedTokens.forEach(removeTokenElement);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      return true;
    }

    const { anchorNode, anchorOffset } = sel;
    if (!anchorNode || !promptEditor.contains(anchorNode)) return false;

    if (anchorNode.nodeType === Node.TEXT_NODE) {
      if (deleteTextNodeChar(anchorNode, anchorOffset, direction)) return true;

      const sibling = direction === "before" ? anchorNode.previousSibling : anchorNode.nextSibling;
      if (sibling?.nodeType === Node.TEXT_NODE) {
        const offset = direction === "before" ? sibling.textContent?.length || 0 : 0;
        return deleteTextNodeChar(sibling, offset, direction);
      }

      return false;
    }

    if (anchorNode !== promptEditor) return false;

    const child = promptEditor.childNodes[direction === "before" ? anchorOffset - 1 : anchorOffset];
    if (child?.nodeType === Node.TEXT_NODE) {
      const offset = direction === "before" ? child.textContent?.length || 0 : 0;
      return deleteTextNodeChar(child, offset, direction);
    }

    return false;
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

  function captureTokenPayload() {
    return Array.from(tokenStore.entries()).map(([id, stored]) => [id, { ...stored }]);
  }

  function captureEditorSnapshot() {
    const nodes = [];
    promptEditor.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        nodes.push({ type: "text", text: node.textContent || "" });
        return;
      }
      if (node.nodeType === Node.ELEMENT_NODE && node.classList?.contains("ai-input__token")) {
        const stored = tokenStore.get(node.dataset.tokenId);
        if (stored) {
          nodes.push({
            type: "token",
            tokenId: node.dataset.tokenId,
            stored: { ...stored }
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
    if (snapshotNode.type === "text") {
      parent.appendChild(document.createTextNode(snapshotNode.text || ""));
      return;
    }

    if (snapshotNode.type !== "token" || !snapshotNode.stored) return;

    const token = document.createElement("span");
    token.className = `ai-input__token${snapshotNode.stored.type === "pick" ? " ai-input__token--pick" : ""}`;
    token.contentEditable = "false";
    token.dataset.tokenType = snapshotNode.stored.type;
    if (interactive && snapshotNode.tokenId) token.dataset.tokenId = snapshotNode.tokenId;

    if (snapshotNode.stored.type === "image" && snapshotNode.stored.url) {
      const img = document.createElement("img");
      img.src = snapshotNode.stored.url;
      img.alt = "";
      token.appendChild(img);
    }

    const labelEl = document.createElement("span");
    labelEl.className = "ai-input__token-label";
    labelEl.textContent = snapshotNode.stored.label || "";
    token.appendChild(labelEl);
    parent.appendChild(token);
  }

  function appendSentBubble(snapshot) {
    if (!sentList) return;
    const bubble = document.createElement("div");
    bubble.className = "ai-sent-bubble";
    if (snapshot.nodes?.length) {
      snapshot.nodes.forEach((node) => appendSnapshotNode(bubble, node));
    } else {
      bubble.textContent = snapshot.text || "";
    }
    sentList.appendChild(bubble);
  }

  function appendAssistantBubble(text) {
    if (!sentList) return;
    const bubble = document.createElement("div");
    bubble.className = "ai-sent-bubble perso-xxl-chat-bubble--assistant";
    bubble.textContent = text || "";

    // Add like/dislike buttons to the AI response bubble
    const feedbackBar = document.createElement("div");
    feedbackBar.className = "ai-sent-bubble__feedback";

    const likeBtn = document.createElement("button");
    likeBtn.type = "button";
    likeBtn.className = "ai-sent-bubble__feedback-btn ai-sent-bubble__feedback-btn--like";
    likeBtn.setAttribute("aria-label", "Thumbs up");
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
    likeBtn.addEventListener("click", () => {
      feedbackBar.querySelectorAll(".ai-sent-bubble__feedback-btn").forEach(btn => btn.classList.remove("is-active"));
      likeBtn.classList.add("is-active");
      toast("Feedback recorded: thumbs up");
    });

    const dislikeBtn = document.createElement("button");
    dislikeBtn.type = "button";
    dislikeBtn.className = "ai-sent-bubble__feedback-btn ai-sent-bubble__feedback-btn--dislike";
    dislikeBtn.setAttribute("aria-label", "Thumbs down");
    // Flipped vertically (scaleY(-1)) version of the like SVG
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
    dislikeBtn.addEventListener("click", () => {
      feedbackBar.querySelectorAll(".ai-sent-bubble__feedback-btn").forEach(btn => btn.classList.remove("is-active"));
      dislikeBtn.classList.add("is-active");
      toast("Feedback recorded: thumbs down");
    });

    feedbackBar.appendChild(likeBtn);
    feedbackBar.appendChild(dislikeBtn);
    bubble.appendChild(feedbackBar);

    sentList.appendChild(bubble);
  }

  function restoreEditorSnapshot(snapshot) {
    clearEditor({ revokeAssets: false });
    if (!snapshot?.nodes?.length) {
      hydratePlainPrompt(snapshot?.text || "");
      return;
    }

    promptEditor.innerHTML = "";
    snapshot.nodes.forEach((node) => {
      appendSnapshotNode(promptEditor, node, { interactive: true });
      if (node.type === "token" && node.tokenId && node.stored) {
        tokenStore.set(node.tokenId, { ...node.stored });
      }
    });
    syncEditorEmptyState();
    updateLayoutMode();
    updateSendState();
  }

  function restoreEditorFromPayload({ snapshot, tokens }) {
    const tokenMap = new Map(tokens);
    if (snapshot?.nodes?.length) {
      snapshot.nodes.forEach((node) => {
        if (node.type === "token" && node.tokenId && tokenMap.has(node.tokenId)) {
          node.stored = { ...tokenMap.get(node.tokenId) };
        }
      });
    }
    restoreEditorSnapshot(snapshot);
  }

  function setStatusMessage(text, { showDots = true } = {}) {
    statusLabel.textContent = text;
    statusDots.hidden = !showDots;
    aiInput.dataset.statusDone = showDots ? "false" : "true";
    statusLine.style.transform = "";
    statusLine.style.opacity = "1";
  }

  function cycleStatusMessage() {
    if (!isLoading) return;
    loadingMessageIndex = (loadingMessageIndex + 1) % LOADING_MESSAGES.length;
    setStatusMessage(LOADING_MESSAGES[loadingMessageIndex]);
  }

  function enterLoadingState(snapshot) {
    if (isLoading) return;
    isLoading = true;
    isDone = false;
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
    setStatusMessage(LOADING_MESSAGES[0]);

    clearEditor({ revokeAssets: false });
    updateLayoutMode();

    loadingInterval = setInterval(cycleStatusMessage, LOADING_MESSAGE_INTERVAL_MS);
  }

  function finishLoadingSequence() {
    if (!isLoading) return;
    clearInterval(loadingInterval);
    loadingInterval = null;
    // Reset composer immediately to allow follow-up prompts instead of showing "Done!"
    resetComposerAfterSuccess();
  }

  function enterDoneState() {
    isLoading = false;
    isDone = true;
    aiInput.dataset.state = "done";
    promptEditor.contentEditable = "false";
    attachToggle.disabled = true;
    sendBtn.disabled = false;
    sendBtn.setAttribute("aria-label", "Revert changes");
  }

  function resetComposerAfterSuccess() {
    isLoading = false;
    isDone = false;
    aiInput.dataset.state = "idle";
    delete aiInput.dataset.statusDone;
    inputStatus.hidden = true;
    promptEditor.contentEditable = "true";
    attachToggle.disabled = false;
    attachToggle.setAttribute("aria-label", "Add attachment");
    sendBtn.setAttribute("aria-label", "Send prompt");
    clearEditor();
    syncEditorEmptyState();
    updateLayoutMode();
    updateSendState();
    promptEditor.focus();
  }

  function abortLoadingState(restorePayload) {
    clearInterval(loadingInterval);
    loadingInterval = null;
    isLoading = false;
    isDone = false;
    aiInput.dataset.state = "idle";
    delete aiInput.dataset.statusDone;
    inputStatus.hidden = true;
    promptEditor.contentEditable = "true";
    attachToggle.disabled = false;
    attachToggle.setAttribute("aria-label", "Add attachment");
    sendBtn.setAttribute("aria-label", "Send prompt");
    if (sentList) sentList.innerHTML = "";
    if (restorePayload) {
      restoreEditorFromPayload(restorePayload);
    } else {
      syncEditorEmptyState();
      updateLayoutMode();
      updateSendState();
    }
  }

  async function revertBarUi() {
    if (typeof hooks?.onRevert === "function") {
      await hooks.onRevert();
    }
    isDone = false;
    if (sentList) sentList.innerHTML = "";
    aiInput.dataset.state = "idle";
    delete aiInput.dataset.statusDone;
    inputStatus.hidden = true;
    promptEditor.contentEditable = "true";
    attachToggle.disabled = false;
    attachToggle.setAttribute("aria-label", "Add attachment");
    sendBtn.setAttribute("aria-label", "Send prompt");
    clearEditor();
    syncEditorEmptyState();
    updateLayoutMode();
    updateSendState();
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
    promptEditor.parentElement.appendChild(clone);

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

  function updateLayoutMode() {
    const shouldMultiline = contentWrapsToMultipleLines();
    const isMultiline = aiInput.dataset.multiline === "true";
    if (shouldMultiline === isMultiline) return;
    setLayoutMode(shouldMultiline);
  }

  function updateSendState() {
    if (isDone) {
      sendBtn.disabled = false;
      return;
    }
    if (interactLocked || isLoading) {
      sendBtn.disabled = true;
      return;
    }
    sendBtn.disabled = !editorHasContent();
  }

  function setInteractLocked(lock) {
    interactLocked = lock;
    attachToggle.disabled = lock;
    if (lock) {
      promptEditor.contentEditable = "false";
      sendBtn.disabled = true;
    } else {
      promptEditor.contentEditable = "true";
      attachToggle.setAttribute("aria-label", "Add attachment");
      updateSendState();
    }
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

  function handleImageSelect(file) {
    if (!file || !file.type.startsWith("image/")) return;
    insertToken({
      type: "image",
      label: file.name,
      url: URL.createObjectURL(file),
      file
    });
    toast(`Image attached — ${file.name}`);
    closeMenu();
  }

  async function handlePickMenu() {
    if (!hooks?.onPick || interactLocked) return;
    saveEditorCaret();
    closeMenu();
    try {
      const selection = await hooks.onPick();
      if (!selection) {
        savedEditorRange = null;
        return;
      }
      const label = selection.selectorHints?.[0]
        || `${selection.tag}${selection.idAttr ? `#${selection.idAttr}` : ""}`.slice(0, 120);
      insertToken({ type: "pick", label, selection });
      toast(`Element selected — ${label}`);
    } catch {
      savedEditorRange = null;
    }
  }

  function clearEditor(opts = {}) {
    const revokeAssets = opts.revokeAssets !== false;
    if (revokeAssets) {
      tokenStore.forEach((stored) => {
        if (stored.type === "image" && stored.url) URL.revokeObjectURL(stored.url);
      });
    }
    tokenStore.clear();
    promptEditor.innerHTML = "";
    syncEditorEmptyState();
    updateLayoutMode();
    updateSendState();
  }

  function getPickSelections() {
    const out = [];
    tokenStore.forEach((st) => {
      if (st.type === "pick" && st.selection) out.push(st.selection);
    });
    return out;
  }

  function getPrimaryImageAttachment() {
    for (const st of tokenStore.values()) {
      if (st.type === "image" && st.file) {
        return st;
      }
    }
    return null;
  }

  function hydratePlainPrompt(text) {
    clearEditor();
    if (!text) return;
    promptEditor.textContent = text.replace(/[\r\n]+/g, " ");
    syncEditorEmptyState();
    updateLayoutMode();
    updateSendState();
  }

  /** @returns {HTMLElement | false} root */
  function attach(root, h) {
    if (root.dataset.persoAiBarMounted === "1") return true;

    panel = root;
    hooks = h;

    aiInput = root.querySelector('[data-bar="root"]');
    attachToggle = root.querySelector('[data-bar="attach-toggle"]');
    attachMenu = root.querySelector('[data-bar="attach-menu"]');
    imageInput = root.querySelector('[data-bar="image-input"]');
    promptEditor = root.querySelector('[data-bar="prompt"]');
    promptPlaceholder = root.querySelector('[data-bar="prompt-placeholder"]');
    sendBtn = root.querySelector('[data-bar="send"]');
    sentList = root.querySelector('[data-bar="sent-list"]');
    inputStatus = root.querySelector('[data-bar="status"]');
    statusLabel = root.querySelector('[data-bar="status-label"]');
    statusLine = root.querySelector('[data-bar="status-line"]');
    statusDots = root.querySelector('[data-bar="status-dots"]');

    if (!(aiInput && attachToggle && attachMenu && imageInput && promptEditor && promptPlaceholder && sendBtn)) {
      return false;
    }

    attachToggle.addEventListener("mousedown", (e) => {
      saveEditorCaret();
      e.preventDefault();
    });

    attachToggle.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleMenu();
    });

    attachMenu.addEventListener("mousedown", (e) => {
      if (e.target.closest('[data-action="pick"]')) saveEditorCaret();
    });

    attachMenu.addEventListener("click", (e) => {
      const item = e.target.closest("[data-action]");
      if (!item) return;
      if (interactLocked) return;
      if (item.dataset.action === "image") imageInput.click();
      if (item.dataset.action === "pick") handlePickMenu();
    });

    imageInput.addEventListener("change", () => {
      handleImageSelect(imageInput.files?.[0]);
      imageInput.value = "";
    });

    function onDocClick(ev) {
      if (
        attachMenu.hidden
        || !panel
        || panel.hidden
      ) return;
      if (ev.target.closest("#perso-xxl-panel .ai-input__left")) return;
      if (attachMenu.contains(ev.target)) return;
      closeMenu();
    }

    outsideClickListenId = onDocClick;
    document.addEventListener("click", onDocClick);

    function onEscapeKey(e) {
      if (!panel.hidden && e.key === "Escape") closeMenu();
    }

    escapeKeyListenId = onEscapeKey;
    document.addEventListener("keydown", onEscapeKey);

    promptEditor.addEventListener("beforeinput", hidePlaceholderForPendingInput);
    promptEditor.addEventListener("compositionstart", () => {
      promptEditor.dataset.empty = "false";
      promptPlaceholder.hidden = true;
    });
    promptEditor.addEventListener("input", queueEditorStateSync);

    promptEditor.addEventListener("focus", () => {
      if (isLoading || isDone) return;
      aiInput.dataset.state = "focused";
    });
    promptEditor.addEventListener("blur", () => {
      if (isLoading || isDone) return;
      aiInput.dataset.state = "idle";
    });

    promptEditor.addEventListener("keydown", (e) => {
      if (interactLocked) return;
      if (e.key === "Enter") {
        e.preventDefault();
        if (isDone) {
          revertBarUi();
          return;
        }
        if (!sendBtn.disabled && !isLoading) sendBtn.click();
        return;
      }

      if (e.key === "Backspace") {
        const selected = getSelectedToken();
        if (selected) {
          e.preventDefault();
          removeTokenElement(selected);
          syncEditorEmptyState();
          updateLayoutMode();
          updateSendState();
          return;
        }
        const before = getAdjacentToken("before");
        if (before) {
          e.preventDefault();
          removeTokenElement(before);
          syncEditorEmptyState();
          updateLayoutMode();
          updateSendState();
          return;
        }
        if (deleteEditorText("before")) {
          e.preventDefault();
          syncEditorEmptyState();
          updateLayoutMode();
          updateSendState();
        }
        return;
      }

      if (e.key === "Delete") {
        const selTok = getSelectedToken();
        if (selTok) {
          e.preventDefault();
          removeTokenElement(selTok);
          syncEditorEmptyState();
          updateLayoutMode();
          updateSendState();
          return;
        }
        const after = getAdjacentToken("after");
        if (after) {
          e.preventDefault();
          removeTokenElement(after);
          syncEditorEmptyState();
          updateLayoutMode();
          updateSendState();
          return;
        }
        if (deleteEditorText("after")) {
          e.preventDefault();
          syncEditorEmptyState();
          updateLayoutMode();
          updateSendState();
        }
      }
    });

    promptEditor.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = e.clipboardData?.getData("text/plain").replace(/[\r\n]+/g, " ") || "";
      if (text) insertTextAtCaret(text);
    });

    inputResizeObserver = new ResizeObserver(() => updateLayoutMode());
    inputResizeObserver.observe(aiInput);

    syncEditorEmptyState();
    updateLayoutMode();
    updateSendState();

    sendBtn.addEventListener("click", async () => {
      if (isDone) {
        await revertBarUi();
        return;
      }
      if (interactLocked || sendBtn.disabled || isLoading) return;
      if (typeof hooks?.onSend !== "function") return;

      const snapshot = captureEditorSnapshot();
      const prompt = serializeEditor();
      const tokens = captureTokenPayload();
      enterLoadingState(snapshot);

      try {
        await hooks.onSend({ prompt, tokens });
        finishLoadingSequence();
      } catch (err) {
        abortLoadingState({ snapshot, tokens });
        console.warn("PersoAiBar:onSend failed", err);
      }
    });

    root.dataset.persoAiBarMounted = "1";
    return true;
  }

  function detachCleanup() {
    if (outsideClickListenId) {
      document.removeEventListener("click", outsideClickListenId);
      outsideClickListenId = null;
    }
    if (escapeKeyListenId) {
      document.removeEventListener("keydown", escapeKeyListenId);
      escapeKeyListenId = null;
    }
    inputResizeObserver?.disconnect();
    inputResizeObserver = null;
    clearEditor({ revokeAssets: true });
    if (panel) delete panel.dataset.persoAiBarMounted;
    panel = null;
    hooks = null;
  }

  window.PersoAiBar = {
    attach,
    detachCleanup,

    hydratePlainPrompt,
    clearEditor,
    serializePrompt: serializeEditor,
    captureTokenPayload,

    getPickSelections,
    getPrimaryImageAttachment,

    setInteractLocked,

    appendAssistantBubble
  };
})();
