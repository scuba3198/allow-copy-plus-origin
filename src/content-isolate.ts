// Content Script running in the ISOLATED world of the extension

(function () {
  const EXT_ID = chrome.runtime.id;
  const RUN_FLAG = `____CORE_INJECTED_FLAG____${EXT_ID}`;
  if ((window as any)[RUN_FLAG]) return;
  (window as any)[RUN_FLAG] = true;

  const PREFIX = "ACP";
  const PREV_VAL_CLASS = "was-empty";

  // Cache keys for element datasets
  const MARK_KEY = `${PREFIX.toLowerCase()}_mark`;
  const USER_SELECT_KEY = `${PREFIX.toLowerCase()}_prevUserSelect`;
  const POINTER_EVENTS_KEY = `${PREFIX.toLowerCase()}_prevPointerEvents`;
  const DRAGGABLE_KEY = `${PREFIX.toLowerCase()}_prevDraggableAttr`;

  let pingIntervalId: any = null;

  // Custom alert utility
  const showAlert = (message: string) => {
    document.getElementById("allow-copy-alert-host")?.remove();
    
    const host = document.createElement("acp-alert");
    host.id = "allow-copy-alert-host";
    
    const style = document.createElement("style");
    style.innerHTML = `
      .acp-alert-overlay {
        all: unset;
        z-index: 2147483647;
        background-color: #ffffff;
        border-radius: 8px;
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        max-height: calc(100% - 20px);
        max-width: calc(100% - 20px);
        width: 400px;
        box-sizing: border-box;
        padding: 24px;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
        color: #333333;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .acp-alert-message {
        font-size: 16px;
        line-height: 1.5;
        font-weight: 500;
      }
      .acp-alert-btn {
        align-self: flex-end;
        font-weight: 600;
        font-size: 14px;
        background-color: #ffd76f;
        border: 1px solid #ffbb09;
        border-radius: 4px;
        padding: 8px 16px;
        cursor: pointer;
        transition: background-color 0.2s;
      }
      .acp-alert-btn:hover {
        background-color: #ffc93c;
      }
    `;
    host.appendChild(style);

    const dialog = document.createElement("div");
    dialog.className = "acp-alert-overlay";

    const msg = document.createElement("p");
    msg.className = "acp-alert-message";
    msg.textContent = message; // Safe textContent injection to prevent DOM XSS
    dialog.appendChild(msg);

    const btn = document.createElement("button");
    btn.className = "acp-alert-btn";
    btn.innerText = "OK";
    btn.onclick = () => host.remove();
    dialog.appendChild(btn);

    host.appendChild(dialog);
    document.body.appendChild(host);
  };

  // Event handlers to intercept and stop propagation of restriction events
  const stopEvent = (e: Event) => {
    e.stopPropagation();
    if (e.stopImmediatePropagation) {
      e.stopImmediatePropagation();
    }
  };

  const handleMousedown = (e: Event) => {
    const mouseEvent = e as MouseEvent;
    // Let user interact with form elements
    const target = mouseEvent.target as HTMLElement;
    if (target && ["INPUT", "TEXTAREA", "SELECT", "OPTION"].includes(target.tagName)) {
      return;
    }
    stopEvent(mouseEvent);
  };

  const handleKeydown = (e: Event) => {
    const keyEvent = e as KeyboardEvent;
    // Allow standard copy (Ctrl+C), Cut (Ctrl+X), and Select All (Ctrl+A)
    const isCopyCutSelectAll = (keyEvent.ctrlKey || keyEvent.metaKey) && 
      (keyEvent.key === "c" || keyEvent.key === "x" || keyEvent.key === "a" || keyEvent.keyCode === 67 || keyEvent.keyCode === 88 || keyEvent.keyCode === 65);
    if (!isCopyCutSelectAll) {
      stopEvent(keyEvent);
    }
  };

  const restoreInlineHandlers = (el: any) => {
    const events = [
      "dragstart", "selectstart", "contextmenu", "keydown", "copy", "cut",
      "mousedown", "mouseup", "mousemove", "keypress", "keyup", "selectionchange"
    ];
    events.forEach(evt => {
      const inlineKey = `on${evt}`;
      const prevKey = `on${evt}_prev`;
      if (el[prevKey]) {
        el[inlineKey] = el[prevKey];
        delete el[prevKey];
      }
    });
  };

  const restoreUserSelectOnElement = (el: HTMLElement) => {
    if (el.dataset[MARK_KEY]) {
      const prevSelect = el.dataset[USER_SELECT_KEY];
      const prevPointer = el.dataset[POINTER_EVENTS_KEY];

      if (prevSelect) {
        if (prevSelect === PREV_VAL_CLASS) {
          el.style.removeProperty("user-select");
        } else {
          el.style.userSelect = prevSelect;
        }
        delete el.dataset[USER_SELECT_KEY];
      }

      if (prevPointer) {
        if (prevPointer === PREV_VAL_CLASS) {
          el.style.removeProperty("pointer-events");
        } else {
          el.style.pointerEvents = prevPointer;
        }
        delete el.dataset[POINTER_EVENTS_KEY];
      }

      delete el.dataset[MARK_KEY];
    }
  };

  const restoreDraggable = (el: HTMLElement) => {
    if (el.dataset[DRAGGABLE_KEY]) {
      el.setAttribute("draggable", el.dataset[DRAGGABLE_KEY]!);
      delete el.dataset[DRAGGABLE_KEY];
    }
  };

  const revertElement = (el: HTMLElement) => {
    restoreInlineHandlers(el);
    removeCaptureListeners(el);
    restoreUserSelectOnElement(el);
    restoreDraggable(el);
  };

  const removeCaptureListeners = (el: EventTarget) => {
    el.removeEventListener("selectstart", stopEvent, true);
    el.removeEventListener("contextmenu", stopEvent, true);
    el.removeEventListener("dragstart", stopEvent, true);
    el.removeEventListener("copy", stopEvent, true);
    el.removeEventListener("cut", stopEvent, true);
    el.removeEventListener("mousedown", handleMousedown, true);
    el.removeEventListener("mouseup", stopEvent, true);
    el.removeEventListener("mousemove", stopEvent, true);
    el.removeEventListener("keydown", handleKeydown, true);
    el.removeEventListener("keypress", handleKeydown, true);
    el.removeEventListener("keyup", handleKeydown, true);
    el.removeEventListener("selectionchange", stopEvent, true);
  };

  // Batched operations queues to prevent layout thrashing
  const pendingElements = new Set<HTMLElement>();
  let processingScheduled = false;

  const scheduleProcessing = (callback: () => void) => {
    if (document.hidden) {
      setTimeout(callback, 0);
    } else if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(callback);
    } else {
      setTimeout(callback, 0);
    }
  };

  const queueElementsForProcessing = (elements: HTMLElement[] | NodeListOf<HTMLElement>) => {
    elements.forEach(el => {
      if (el && el.nodeType === Node.ELEMENT_NODE) {
        pendingElements.add(el);
      }
    });

    if (!processingScheduled && pendingElements.size > 0) {
      processingScheduled = true;
      scheduleProcessing(processPendingElements);
    }
  };

  const processPendingElements = () => {
    const elements = Array.from(pendingElements);
    pendingElements.clear();
    processingScheduled = false;

    // Phase 1: Batch reads (No DOM writes in this loop!)
    const readResults = elements.map(el => {
      if (!el || !el.tagName) return null;

      const isOverlayCandidate = ["DIV", "SECTION", "SPAN", "ASIDE", "LI", "MAIN", "ARTICLE", "IMG", "CANVAS"].includes(el.tagName);
      const isSelectionCandidate = !["SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "CANVAS", "VIDEO", "AUDIO", "IMG", "SVG"].includes(el.tagName);

      let hasText = false;
      if (isSelectionCandidate) {
        hasText = Array.from(el.childNodes).some(
          node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim() !== ""
        );
      }

      // Check inline events to save
      const eventsToSave: string[] = [];
      const inlineEvents = [
        "dragstart", "selectstart", "contextmenu", "keydown", "copy", "cut",
        "mousedown", "mouseup", "mousemove", "keypress", "keyup", "selectionchange"
      ];
      inlineEvents.forEach(evt => {
        const inlineKey = `on${evt}`;
        if ((el as any)[inlineKey]) {
          eventsToSave.push(evt);
        }
      });

      let isSelectNone = false;
      let isPointerNone = false;
      let shouldOverlayClickThrough = false;

      // Avoid window.getComputedStyle if not needed
      if (isSelectionCandidate && hasText) {
        const style = window.getComputedStyle(el);
        isSelectNone = style.userSelect === "none" && style.opacity !== "0";
        isPointerNone = style.pointerEvents === "none" && style.opacity !== "0";
      }

      if (isOverlayCandidate) {
        const style = window.getComputedStyle(el);
        const position = style.position;
        // Avoid getBoundingClientRect if position is not positioned
        if (["absolute", "fixed", "sticky"].includes(position)) {
          if (style.pointerEvents !== "none" && style.display !== "none" && style.visibility !== "hidden" && style.cursor !== "pointer") {
            const rect = el.getBoundingClientRect();
            if (rect.width * rect.height >= 1000 && rect.width >= 20 && rect.height >= 20) {
              if (rect.bottom >= 0 && rect.top <= window.innerHeight && rect.right >= 0 && rect.left <= window.innerWidth) {
                const isTransparent = style.backgroundColor === "transparent" || 
                  (style.backgroundColor.includes("rgba") && style.backgroundColor.endsWith(", 0)"));
                if (isTransparent) {
                  const hasInteractives = !!el.querySelector("img, video, input, button, textarea, svg");
                  const hasBorder = !!(style.borderWidth && parseFloat(style.borderWidth) > 0 && style.borderColor !== "transparent");
                  const hasTextContent = (el.textContent?.trim() || "").length > 0; // Faster than innerText
                  
                  if (!hasInteractives && !hasBorder && !hasTextContent) {
                    shouldOverlayClickThrough = true;
                  }
                }
              }
            }
          }
        }
      }

      const hasDraggable = el.hasAttribute("draggable");

      return {
        el,
        eventsToSave,
        isSelectionCandidate,
        hasText,
        isSelectNone,
        isPointerNone,
        shouldOverlayClickThrough,
        hasDraggable
      };
    }).filter(Boolean);

    // Phase 2: Batch writes (No DOM reads in this loop!)
    readResults.forEach(r => {
      if (!r) return;
      const el = r.el;

      // Save and clear inline handlers
      r.eventsToSave.forEach(evt => {
        const inlineKey = `on${evt}`;
        const prevKey = `on${evt}_prev`;
        (el as any)[prevKey] = (el as any)[inlineKey];
        (el as any)[inlineKey] = null;
      });

      // Add capture phase listeners
      el.addEventListener("selectstart", stopEvent, true);
      el.addEventListener("contextmenu", stopEvent, true);
      el.addEventListener("dragstart", stopEvent, true);
      el.addEventListener("copy", stopEvent, true);
      el.addEventListener("cut", stopEvent, true);
      el.addEventListener("mousedown", handleMousedown, true);
      el.addEventListener("mouseup", stopEvent, true);
      el.addEventListener("mousemove", stopEvent, true);
      el.addEventListener("keydown", handleKeydown, true);
      el.addEventListener("keypress", handleKeydown, true);
      el.addEventListener("keyup", handleKeydown, true);
      el.addEventListener("selectionchange", stopEvent, true);

      // User select override
      if (r.isSelectionCandidate && r.hasText) {
        if (r.isSelectNone) {
          el.dataset[USER_SELECT_KEY] = el.style.userSelect || PREV_VAL_CLASS;
          el.style.setProperty("user-select", "text", "important");
        }
        if (r.isPointerNone) {
          el.dataset[POINTER_EVENTS_KEY] = el.style.pointerEvents || PREV_VAL_CLASS;
          el.style.setProperty("pointer-events", "initial", "important");
        }
        if (r.isSelectNone || r.isPointerNone) {
          el.dataset[MARK_KEY] = "1";
        }
      }

      // Strip draggable attribute
      if (r.hasDraggable) {
        el.dataset[DRAGGABLE_KEY] = el.getAttribute("draggable") || "true";
        el.removeAttribute("draggable");
      }

      // Make transparent overlay click-through
      if (r.shouldOverlayClickThrough) {
        el.dataset[POINTER_EVENTS_KEY] = el.style.pointerEvents || PREV_VAL_CLASS;
        el.style.setProperty("pointer-events", "none", "important");
        el.dataset[MARK_KEY] = "1";
      }
    });
  };

  // Set up mutation observer to process dynamically added DOM nodes
  let mutationObserver: MutationObserver | null = null;

  const startBypass = () => {
    // Process document and existing body elements
    const inlineEvents = [
      "dragstart", "selectstart", "contextmenu", "keydown", "copy", "cut",
      "mousedown", "mouseup", "mousemove", "keypress", "keyup", "selectionchange"
    ];
    inlineEvents.forEach(evt => {
      const inlineKey = `on${evt}`;
      const prevKey = `on${evt}_prev`;
      if ((document as any)[inlineKey]) {
        (document as any)[prevKey] = (document as any)[inlineKey];
        (document as any)[inlineKey] = null;
      }
    });

    document.addEventListener("selectstart", stopEvent, true);
    document.addEventListener("contextmenu", stopEvent, true);
    document.addEventListener("dragstart", stopEvent, true);
    document.addEventListener("copy", stopEvent, true);
    document.addEventListener("cut", stopEvent, true);
    document.addEventListener("mousedown", handleMousedown, true);
    document.addEventListener("mouseup", stopEvent, true);
    document.addEventListener("mousemove", stopEvent, true);
    document.addEventListener("keydown", handleKeydown, true);
    document.addEventListener("keypress", handleKeydown, true);
    document.addEventListener("keyup", handleKeydown, true);
    document.addEventListener("selectionchange", stopEvent, true);

    const allElements = document.querySelectorAll("*");
    queueElementsForProcessing(allElements as NodeListOf<HTMLElement>);

    // Monitor future DOM changes
    mutationObserver = new MutationObserver(mutations => {
      const addedElements: HTMLElement[] = [];
      const changedElements: HTMLElement[] = [];

      mutations.forEach(mutation => {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node as HTMLElement;
              if (!["STYLE", "SCRIPT"].includes(el.tagName)) {
                addedElements.push(el);
                el.querySelectorAll("*").forEach(child => addedElements.push(child as HTMLElement));
              }
            }
          });
        } else if (mutation.type === "attributes" && mutation.target instanceof HTMLElement) {
          changedElements.push(mutation.target);
        }
      });

      if (addedElements.length > 0) {
        queueElementsForProcessing(addedElements);
      }
      if (changedElements.length > 0) {
        queueElementsForProcessing(changedElements);
      }
    });

    mutationObserver.observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class", "draggable"]
    });
  };

  const stopBypass = () => {
    if (mutationObserver) {
      mutationObserver.disconnect();
      mutationObserver = null;
    }

    restoreInlineHandlers(document);
    removeCaptureListeners(document);

    const allElements = document.querySelectorAll("*");
    allElements.forEach(el => revertElement(el as HTMLElement));

    (window as any)[RUN_FLAG] = false;
  };

  // Copy via helper textarea (used by Context Menu copy option)
  const executeCopyText = (text: string) => {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    
    try {
      document.execCommand("copy");
    } catch (err) {
      console.error("ACP: Copy failed", err);
    }
    
    document.body.removeChild(textarea);
  };

  // Message listener from background worker
  const messageListener = (message: any, sender: chrome.runtime.MessageSender, sendResponse: (r?: any) => void) => {
    switch (message.type) {
      case "Core_Deactivate":
        stopBypass();
        sendResponse({ success: true });
        break;
      case "Core_ShowAlert":
        showAlert(message.data);
        sendResponse({ success: true });
        break;
      case "CopyByContextMenu":
        executeCopyText(message.data);
        sendResponse({ success: true });
        break;
    }
    return true;
  };

  chrome.runtime.onMessage.addListener(messageListener);

  // Background ping-check to self-destruct content script if background script gets reloaded/uninstalled
  const startPingInterval = () => {
    pingIntervalId = setInterval(() => {
      chrome.runtime.sendMessage({ type: "PingBgFromActiveTab" }, (response) => {
        const error = chrome.runtime.lastError;
        if (error || !response?.isSuccess) {
          clearInterval(pingIntervalId);
          stopBypass();
          chrome.runtime.onMessage.removeListener(messageListener);
        }
      });
    }, 3000);
  };

  // Start operations
  startBypass();
  startPingInterval();
})();
