(function() {
  'use strict';

  const host = window.location.host;
  const hostClass = host.replace(/\./g, '_');
  const marker = "ALLOW_COPY_PLUS_ORIGIN_ISOLATED_INJECTED";

  if (window[marker]) return;
  window[marker] = true;

  // Add the class to body to enable CSS rules
  const addBodyClass = () => {
    if (document.body) {
      document.body.classList.add(hostClass);
    }
  };
  
  if (document.body) {
    addBodyClass();
  } else {
    document.addEventListener("DOMContentLoaded", addBodyClass);
  }

  // Event handler overrides & caching
  const eventProps = [
    "ondragstart", "onselectstart", "oncontextmenu", "onkeydown", 
    "oncopy", "oncut", "onmousedown", "onmouseup", "onmousemove", 
    "onkeypress", "onkeyup", "onselectionchange"
  ];

  const backupHandlers = new Map();

  const clearDirectHandlers = (el) => {
    eventProps.forEach(prop => {
      try {
        if (el[prop] !== null && el[prop] !== undefined) {
          if (!backupHandlers.has(el)) {
            backupHandlers.set(el, {});
          }
          backupHandlers.get(el)[prop] = el[prop];
          el[prop] = null;
        }
      } catch (e) {}
    });
  };

  const restoreDirectHandlers = () => {
    backupHandlers.forEach((handlers, el) => {
      try {
        eventProps.forEach(prop => {
          if (handlers[prop] !== undefined) {
            el[prop] = handlers[prop];
          }
        });
      } catch (e) {}
    });
    backupHandlers.clear();
  };

  // Draggable overrides
  const backupDraggables = new Map();
  const removeDraggable = (el) => {
    try {
      if (el.hasAttribute && el.hasAttribute("draggable")) {
        backupDraggables.set(el, el.getAttribute("draggable"));
        el.removeAttribute("draggable");
      }
    } catch (e) {}
  };

  const restoreDraggables = () => {
    backupDraggables.forEach((val, el) => {
      try {
        el.setAttribute("draggable", val);
      } catch (e) {}
    });
    backupDraggables.clear();
  };

  // user-select / pointer-events dynamic fix
  const backupStyles = new Map();
  const fixStyling = (el) => {
    if (!el.tagName || !el.childNodes) return;
    
    // Check if element contains any text content directly
    const hasDirectText = Array.from(el.childNodes).some(
      node => node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0
    );

    if (hasDirectText) {
      try {
        const style = window.getComputedStyle(el);
        const userSelect = style.userSelect || style.webkitUserSelect;
        const pointerEvents = style.pointerEvents;
        
        const selectBlocked = userSelect === "none";
        const pointerBlocked = pointerEvents === "none";
        
        if (selectBlocked || pointerBlocked) {
          backupStyles.set(el, {
            userSelect: el.style.userSelect,
            webkitUserSelect: el.style.webkitUserSelect,
            pointerEvents: el.style.pointerEvents
          });

          if (selectBlocked) {
            el.style.setProperty("user-select", "text", "important");
            el.style.setProperty("-webkit-user-select", "text", "important");
          }
          if (pointerBlocked) {
            el.style.setProperty("pointer-events", "initial", "important");
          }
        }
      } catch (e) {}
    }
  };

  const restoreStyling = () => {
    backupStyles.forEach((styles, el) => {
      try {
        if (styles.userSelect) el.style.userSelect = styles.userSelect;
        else el.style.removeProperty("user-select");

        if (styles.webkitUserSelect) el.style.webkitUserSelect = styles.webkitUserSelect;
        else el.style.removeProperty("-webkit-user-select");

        if (styles.pointerEvents) el.style.pointerEvents = styles.pointerEvents;
        else el.style.removeProperty("pointer-events");
      } catch (e) {}
    });
    backupStyles.clear();
  };

  // Element processor
  const processElement = (el) => {
    if (el.nodeType !== Node.ELEMENT_NODE) return;
    
    const tagName = el.tagName.toUpperCase();
    const skipTags = new Set([
      "SCRIPT", "STYLE", "LINK", "META", "HEAD", "TITLE", "NOSCRIPT",
      "IFRAME", "CANVAS", "VIDEO", "AUDIO", "IMG", "SVG", "BUTTON",
      "INPUT", "TEXTAREA", "SELECT", "PATH"
    ]);

    if (skipTags.has(tagName)) return;

    clearDirectHandlers(el);
    removeDraggable(el);
    fixStyling(el);

    // Recursively handle elements inside shadow roots
    if (el.shadowRoot) {
      el.shadowRoot.querySelectorAll("*").forEach(processElement);
      observeMutations(el.shadowRoot);
    }
  };

  // Event handlers to intercept and cancel blockings
  const preventBypass = (e) => {
    if (e.type === "keydown" || e.type === "keyup") {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.key !== 'c' && e.key !== 'x' && e.key !== 'a') return;
    }
    e.stopPropagation();
    if (e.stopImmediatePropagation) {
      e.stopImmediatePropagation();
    }
  };

  const eventsToBlock = [
    "copy", "cut", "paste", "selectstart", "contextmenu", "dragstart",
    "mousedown", "mouseup", "mousemove", "keypress", "keyup", "selectionchange"
  ];

  const registerListeners = () => {
    eventsToBlock.forEach(ev => {
      document.addEventListener(ev, preventBypass, { capture: true, passive: false });
    });
  };

  const unregisterListeners = () => {
    eventsToBlock.forEach(ev => {
      document.removeEventListener(ev, preventBypass, { capture: true });
    });
  };

  // Set up listeners and initial scan
  registerListeners();
  clearDirectHandlers(document);
  document.querySelectorAll("*").forEach(processElement);

  // Mutation observer to handle dynamically loaded elements
  const observers = [];
  const observeMutations = (target) => {
    try {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
          if (mutation.type === "childList") {
            mutation.addedNodes.forEach(node => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                processElement(node);
                node.querySelectorAll("*").forEach(processElement);
              }
            });
          } else if (mutation.type === "attributes") {
            if (mutation.target instanceof HTMLElement) {
              processElement(mutation.target);
            }
          }
        });
      });

      observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class", "draggable"]
      });

      observers.push(observer);
    } catch (e) {}
  };

  observeMutations(document);

  // Listen for deactivation messages from background
  const messageListener = (msg, sender, sendResponse) => {
    if (msg.type === "deactivate") {
      cleanup();
      if (sendResponse) sendResponse({ success: true });
    }
  };

  chrome.runtime.onMessage.addListener(messageListener);

  const cleanup = () => {
    // Disconnect observers
    observers.forEach(obs => obs.disconnect());
    observers.length = 0;

    // Restore changes
    unregisterListeners();
    restoreDirectHandlers();
    restoreDraggables();
    restoreStyling();

    // Remove body class
    if (document.body) {
      document.body.classList.remove(hostClass);
    }

    chrome.runtime.onMessage.removeListener(messageListener);
    delete window[marker];
  };

})();
