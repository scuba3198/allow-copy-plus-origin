// src/content-isolate.ts
(function() {
  const EXT_ID = chrome.runtime.id;
  const RUN_FLAG = `____CORE_INJECTED_FLAG____${EXT_ID}`;
  if (window[RUN_FLAG]) return;
  window[RUN_FLAG] = true;
  const PREFIX = "ACP";
  const PREV_VAL_CLASS = "was-empty";
  const MARK_KEY = `${PREFIX.toLowerCase()}_mark`;
  const USER_SELECT_KEY = `${PREFIX.toLowerCase()}_prevUserSelect`;
  const POINTER_EVENTS_KEY = `${PREFIX.toLowerCase()}_prevPointerEvents`;
  const DRAGGABLE_KEY = `${PREFIX.toLowerCase()}_prevDraggableAttr`;
  let pingIntervalId = null;
  const showAlert = (message) => {
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
    msg.innerHTML = message;
    dialog.appendChild(msg);
    const btn = document.createElement("button");
    btn.className = "acp-alert-btn";
    btn.innerText = "OK";
    btn.onclick = () => host.remove();
    dialog.appendChild(btn);
    host.appendChild(dialog);
    document.body.appendChild(host);
  };
  const stopEvent = (e) => {
    e.stopPropagation();
    if (e.stopImmediatePropagation) {
      e.stopImmediatePropagation();
    }
  };
  const handleMousedown = (e) => {
    const mouseEvent = e;
    const target = mouseEvent.target;
    if (target && ["INPUT", "TEXTAREA", "SELECT", "OPTION"].includes(target.tagName)) {
      return;
    }
    stopEvent(mouseEvent);
  };
  const handleKeydown = (e) => {
    const keyEvent = e;
    const isCopyCutSelectAll = (keyEvent.ctrlKey || keyEvent.metaKey) && (keyEvent.key === "c" || keyEvent.key === "x" || keyEvent.key === "a" || keyEvent.keyCode === 67 || keyEvent.keyCode === 88 || keyEvent.keyCode === 65);
    if (!isCopyCutSelectAll) {
      stopEvent(keyEvent);
    }
  };
  const saveAndClearInlineHandlers = (el) => {
    const events = [
      "dragstart",
      "selectstart",
      "contextmenu",
      "keydown",
      "copy",
      "cut",
      "mousedown",
      "mouseup",
      "mousemove",
      "keypress",
      "keyup",
      "selectionchange"
    ];
    events.forEach((evt) => {
      const inlineKey = `on${evt}`;
      const prevKey = `on${evt}_prev`;
      if (el[inlineKey]) {
        el[prevKey] = el[inlineKey];
        el[inlineKey] = null;
      }
    });
  };
  const restoreInlineHandlers = (el) => {
    const events = [
      "dragstart",
      "selectstart",
      "contextmenu",
      "keydown",
      "copy",
      "cut",
      "mousedown",
      "mouseup",
      "mousemove",
      "keypress",
      "keyup",
      "selectionchange"
    ];
    events.forEach((evt) => {
      const inlineKey = `on${evt}`;
      const prevKey = `on${evt}_prev`;
      if (el[prevKey]) {
        el[inlineKey] = el[prevKey];
        delete el[prevKey];
      }
    });
  };
  const addCaptureListeners = (el) => {
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
  };
  const removeCaptureListeners = (el) => {
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
  const enableUserSelectOnElement = (el) => {
    if (["SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "CANVAS", "VIDEO", "AUDIO", "IMG", "SVG"].includes(el.tagName)) {
      return;
    }
    const hasText = Array.from(el.childNodes).some(
      (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim() !== ""
    );
    if (hasText) {
      const style = window.getComputedStyle(el);
      const isSelectNone = style.userSelect === "none" && style.opacity !== "0";
      const isPointerNone = style.pointerEvents === "none" && style.opacity !== "0";
      if (isSelectNone) {
        el.dataset[USER_SELECT_KEY] = el.style.userSelect || PREV_VAL_CLASS;
        el.style.setProperty("user-select", "text", "important");
      }
      if (isPointerNone) {
        el.dataset[POINTER_EVENTS_KEY] = el.style.pointerEvents || PREV_VAL_CLASS;
        el.style.setProperty("pointer-events", "initial", "important");
      }
      if (isSelectNone || isPointerNone) {
        el.dataset[MARK_KEY] = "1";
      }
    }
  };
  const restoreUserSelectOnElement = (el) => {
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
  const stripDraggable = (el) => {
    if (el.hasAttribute("draggable")) {
      el.dataset[DRAGGABLE_KEY] = el.getAttribute("draggable") || "true";
      el.removeAttribute("draggable");
    }
  };
  const restoreDraggable = (el) => {
    if (el.dataset[DRAGGABLE_KEY]) {
      el.setAttribute("draggable", el.dataset[DRAGGABLE_KEY]);
      delete el.dataset[DRAGGABLE_KEY];
    }
  };
  const makeOverlaysClickThrough = (el) => {
    if (!["DIV", "SECTION", "SPAN", "ASIDE", "LI", "MAIN", "ARTICLE", "IMG", "CANVAS"].includes(el.tagName)) {
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width * rect.height < 1e3 || rect.width < 20 || rect.height < 20) return;
    if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) return;
    const style = window.getComputedStyle(el);
    if (!["absolute", "fixed", "sticky"].includes(style.position)) return;
    if (style.pointerEvents === "none" || style.display === "none" || style.visibility === "hidden") return;
    if (style.cursor === "pointer") return;
    const isTransparent = style.backgroundColor === "transparent" || style.backgroundColor.includes("rgba") && style.backgroundColor.endsWith(", 0)");
    if (isTransparent) {
      if (el.querySelector("img, video, input, button, textarea, svg")) return;
      if (style.borderWidth && parseFloat(style.borderWidth) > 0 && style.borderColor !== "transparent") return;
      const hasText = (el.innerText?.trim() || "").length > 0;
      if (!hasText) {
        el.dataset[POINTER_EVENTS_KEY] = el.style.pointerEvents || PREV_VAL_CLASS;
        el.style.setProperty("pointer-events", "none", "important");
        el.dataset[MARK_KEY] = "1";
      }
    }
  };
  const processElement = (el) => {
    saveAndClearInlineHandlers(el);
    addCaptureListeners(el);
    enableUserSelectOnElement(el);
    stripDraggable(el);
    makeOverlaysClickThrough(el);
  };
  const revertElement = (el) => {
    restoreInlineHandlers(el);
    removeCaptureListeners(el);
    restoreUserSelectOnElement(el);
    restoreDraggable(el);
  };
  let mutationObserver = null;
  const startBypass = () => {
    saveAndClearInlineHandlers(document);
    addCaptureListeners(document);
    const allElements = document.querySelectorAll("*");
    allElements.forEach((el) => processElement(el));
    mutationObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node;
              if (!["STYLE", "SCRIPT"].includes(el.tagName)) {
                processElement(el);
                el.querySelectorAll("*").forEach((child) => processElement(child));
              }
            }
          });
        } else if (mutation.type === "attributes" && mutation.target instanceof HTMLElement) {
          processElement(mutation.target);
        }
      });
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
    allElements.forEach((el) => revertElement(el));
    window[RUN_FLAG] = false;
  };
  const executeCopyText = (text) => {
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
  const messageListener = (message, sender, sendResponse) => {
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
    }, 3e3);
  };
  startBypass();
  startPingInterval();
})();
