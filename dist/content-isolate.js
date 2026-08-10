// src/content-isolate.ts
(function() {
  const EXT_ID = chrome.runtime.id;
  const RUN_FLAG = `____CORE_INJECTED_FLAG____${EXT_ID}`;
  if (window[RUN_FLAG]) return;
  window[RUN_FLAG] = true;
  const isEditableTarget = (target) => {
    const element = target instanceof HTMLElement ? target : null;
    return !!element && (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT|OPTION)$/.test(element.tagName));
  };
  const stopEvent = (event) => {
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  };
  const handleKeyboard = (event) => {
    if (isEditableTarget(event.target)) return;
    const keyEvent = event;
    const isCopyShortcut = (keyEvent.ctrlKey || keyEvent.metaKey) && ["c", "x", "a"].includes(keyEvent.key.toLowerCase());
    if (isCopyShortcut) stopEvent(event);
  };
  const handleRestrictedEvent = (event) => {
    if (!isEditableTarget(event.target)) stopEvent(event);
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
    textarea.remove();
  };
  const restrictedEvents = ["selectstart", "contextmenu", "dragstart", "copy", "cut"];
  const TEARDOWN_EVENT = "ACP_TEARDOWN";
  let pingIntervalId = null;
  let stopped = false;
  const startBypass = () => {
    restrictedEvents.forEach((type) => document.addEventListener(type, handleRestrictedEvent, true));
    document.addEventListener("keydown", handleKeyboard, true);
    document.addEventListener("keyup", handleKeyboard, true);
  };
  const stopBypass = () => {
    if (stopped) return;
    stopped = true;
    restrictedEvents.forEach((type) => document.removeEventListener(type, handleRestrictedEvent, true));
    document.removeEventListener("keydown", handleKeyboard, true);
    document.removeEventListener("keyup", handleKeyboard, true);
    if (pingIntervalId !== null) {
      clearInterval(pingIntervalId);
      pingIntervalId = null;
    }
    const body = document.body;
    const activeClass = body?.dataset["acpActiveClass"];
    if (body && activeClass) {
      body.classList.remove(activeClass);
      delete body.dataset["acpActiveClass"];
    }
    document.dispatchEvent(new CustomEvent(TEARDOWN_EVENT));
    window[RUN_FLAG] = false;
    try {
      chrome.runtime.onMessage.removeListener(messageListener);
    } catch {
    }
  };
  const messageListener = (message, sender, sendResponse) => {
    switch (message.type) {
      case "Core_Deactivate":
        stopBypass();
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
  pingIntervalId = setInterval(() => {
    try {
      chrome.runtime.sendMessage({ type: "PingBgFromActiveTab" }, (response) => {
        const error = chrome.runtime.lastError;
        if (error || !response?.isSuccess) {
          stopBypass();
        }
      });
    } catch {
      stopBypass();
    }
  }, 3e3);
  startBypass();
})();
