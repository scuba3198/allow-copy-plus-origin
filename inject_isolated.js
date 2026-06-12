(function() {
  'use strict';

  const host = window.location.host;
  const hostClass = host.replace(/\./g, '_');
  const marker = "ALLOW_COPY_PLUS_ORIGIN_ISOLATED_INJECTED";

  if (window[marker]) return;
  window[marker] = true;

  /**
   * Applies the host-specific class to document.body to enable stylesheet rules.
   */
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

  // Event properties that are commonly overridden by websites to block selection/copy
  const eventProps = [
    "ondragstart", "onselectstart", "oncontextmenu", "onkeydown", 
    "oncopy", "oncut", "onmousedown", "onmouseup", "onmousemove", 
    "onkeypress", "onkeyup", "onselectionchange"
  ];

  const backupHandlers = new Map();

  /**
   * Clears inline/direct blocker event handlers assigned directly as element properties.
   * Caches them in backupHandlers to restore during cleanup.
   * @param {HTMLElement} el - The DOM element.
   */
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

  /**
   * Restores cached inline/direct event handlers on elements.
   */
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

  const backupDraggables = new Map();

  /**
   * Temporarily removes the "draggable" attribute from elements.
   * Caches the attribute value to restore during cleanup.
   * @param {HTMLElement} el - The DOM element.
   */
  const removeDraggable = (el) => {
    try {
      if (el.hasAttribute && el.hasAttribute("draggable")) {
        backupDraggables.set(el, el.getAttribute("draggable"));
        el.removeAttribute("draggable");
      }
    } catch (e) {}
  };

  /**
   * Restores the original "draggable" attributes to modified elements.
   */
  const restoreDraggables = () => {
    backupDraggables.forEach((val, el) => {
      try {
        el.setAttribute("draggable", val);
      } catch (e) {}
    });
    backupDraggables.clear();
  };

  const backupStyles = new Map();

  /**
   * Enforces CSS selectability and pointer interaction on text-bearing elements.
   * Caches original styling configurations to restore during cleanup.
   * @param {HTMLElement} el - The DOM element.
   */
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

  /**
   * Restores original select and pointer styling attributes to elements.
   */
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

  /**
   * Iterates through an element's handlers, styling, and children to clear copy locks.
   * Recursively processes elements inside Shadow DOMs.
   * @param {HTMLElement} el - The DOM element to process.
   */
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

    if (el.shadowRoot) {
      el.shadowRoot.querySelectorAll("*").forEach(processElement);
      observeMutations(el.shadowRoot);
    }
  };

  /**
   * Captures selection/copy events and cancels event propagation to preempt page locks.
   * @param {Event} e - The fired event.
   */
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

  /**
   * Registers capturing event listeners on document to intercept blocking behavior.
   */
  const registerListeners = () => {
    eventsToBlock.forEach(ev => {
      document.addEventListener(ev, preventBypass, { capture: true, passive: false });
    });
  };

  /**
   * Unregisters capturing event listeners from document.
   */
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

  /**
   * Configures and starts a MutationObserver on a target node to bypass new element blocks.
   * @param {Node} target - The target node (document or shadow root).
   */
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

  /**
   * Event listener callback to process deactivation signals.
   * @param {Object} msg - Message payload.
   * @param {Object} sender - Sender metadata.
   * @param {Function} sendResponse - Response callback.
   */
  const messageListener = (msg, sender, sendResponse) => {
    if (msg.type === "deactivate") {
      cleanup();
      if (sendResponse) sendResponse({ success: true });
    }
  };

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(messageListener);
  }

  /**
   * Performs cleanup by disconnecting observers, removing listeners,
   * restoring styles and custom attributes, and deleting global variables.
   */
  const cleanup = () => {
    observers.forEach(obs => obs.disconnect());
    observers.length = 0;

    unregisterListeners();
    restoreDirectHandlers();
    restoreDraggables();
    restoreStyling();

    if (document.body) {
      document.body.classList.remove(hostClass);
    }

    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      try {
        chrome.runtime.onMessage.removeListener(messageListener);
      } catch (e) {
        // Ignore context invalidation errors
      }
    }
    delete window[marker];
  };

})();
