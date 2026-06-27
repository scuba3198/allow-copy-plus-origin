// src/content-main.ts
(function() {
  const RUN_FLAG = "ACP_MAIN_WORLD_INJECTED";
  if (window[RUN_FLAG]) return;
  window[RUN_FLAG] = true;
  const INTERCEPT_DOMAINS = /* @__PURE__ */ new Set([
    "jusbrasil.com.br",
    "jusbrasil.com",
    "app.littleexits.com",
    "lx9t5cgtsl.feishu.cn",
    "feishu.cn",
    "alllhealth.com",
    "lms.catchon.jp",
    "amcatglobal.aspiringminds.com",
    "aspiringminds.com",
    "netacad.com",
    "bytexl.app",
    "abhyas.ai",
    "school.haoduo.vip",
    "digitalnttf.com",
    "subsiditepatlpg.mypertamina.id",
    "mypertamina.id",
    "ks.cqsdx.cn",
    "cqsdx.cn",
    "ime.digiicampus.com",
    "digiicampus.com",
    "app.sophia.org",
    "sophia.org",
    "darkscript.com.br",
    "darkscript.com",
    "siiopp.gnr.local",
    "gnr.local",
    "biblioteca.nubedelectura.com",
    "nubedelectura.com",
    "missov.ma"
  ]);
  window.initAllowCopyMainWorld = function(hostname, bodyClass) {
    const isDomainTargeted = [...INTERCEPT_DOMAINS].some((domain) => hostname.includes(domain));
    if (isDomainTargeted) {
      const originalAddEventListener = EventTarget.prototype.addEventListener;
      const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
      const attachedListeners = [];
      const restrictedEvents = /* @__PURE__ */ new Set(["copy", "cut", "selectstart", "contextmenu", "dragstart", "keydown"]);
      EventTarget.prototype.addEventListener = function(type, listener, options) {
        if (restrictedEvents.has(type) && typeof listener === "function") {
          const wrapper = function(...args) {
            if (document.body.classList.contains(bodyClass)) {
              const event = args[0];
              if (event) {
                event.stopPropagation();
                if (event.stopImmediatePropagation) {
                  event.stopImmediatePropagation();
                }
              }
              return;
            }
            return listener.apply(this, args);
          };
          attachedListeners.push({
            target: this,
            type,
            original: listener,
            wrapper,
            options
          });
          originalAddEventListener.call(this, type, wrapper, options);
        } else {
          originalAddEventListener.call(this, type, listener, options);
        }
      };
      EventTarget.prototype.removeEventListener = function(type, listener, options) {
        if (restrictedEvents.has(type)) {
          const index = attachedListeners.findIndex(
            (item) => item.target === this && item.type === type && item.original === listener
          );
          if (index !== -1) {
            const item = attachedListeners[index];
            if (item) {
              originalRemoveEventListener.call(this, type, item.wrapper, options);
              attachedListeners.splice(index, 1);
              return;
            }
          }
        }
        originalRemoveEventListener.call(this, type, listener, options);
      };
    }
    const handleCopy = (e) => {
      const clipEvent = e;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;
      try {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const rootNode = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement || document.body;
        const walker = document.createTreeWalker(
          rootNode,
          NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
          {
            acceptNode: (node) => {
              if (node.nodeName === "BR") {
                return NodeFilter.FILTER_ACCEPT;
              }
              if (node.nodeType === Node.TEXT_NODE && range.intersectsNode(node)) {
                return NodeFilter.FILTER_ACCEPT;
              }
              return NodeFilter.FILTER_SKIP;
            }
          }
        );
        const parts = [];
        let lastNode = null;
        let currentNode = walker.nextNode();
        while (currentNode) {
          if (currentNode.nodeName === "BR") {
            parts.push("\n");
          } else if (currentNode.nodeType === Node.TEXT_NODE) {
            let nodeText = currentNode.textContent || "";
            let startIdx = 0;
            let endIdx = nodeText.length;
            if (currentNode === range.startContainer) {
              startIdx = range.startOffset;
            }
            if (currentNode === range.endContainer) {
              endIdx = range.endOffset;
            }
            const extracted = nodeText.substring(startIdx, endIdx);
            if (lastNode && lastNode.nodeType === Node.TEXT_NODE) {
              const getClosestBlockAncestor = (node) => {
                let parent = node.parentElement;
                while (parent && parent !== document.body && parent !== document.documentElement) {
                  const display = window.getComputedStyle(parent).display;
                  const isBlock = display.includes("block") && display !== "inline-block" || display.includes("flex") && display !== "inline-flex" || display.includes("grid") && display !== "inline-grid" || display === "table" || display === "table-row";
                  if (isBlock) return parent;
                  parent = parent.parentElement;
                }
                return null;
              };
              const lastBlock = getClosestBlockAncestor(lastNode);
              const currentBlock = getClosestBlockAncestor(currentNode);
              if (lastBlock !== currentBlock) {
                parts.push("\n\n");
              } else {
                const lastParent = lastNode.parentElement;
                const currentParent = currentNode.parentElement;
                if (lastParent && currentParent && lastParent !== currentParent) {
                  parts.push(" ");
                } else {
                  parts.push(" ");
                }
              }
            }
            parts.push(extracted);
            lastNode = currentNode;
          }
          currentNode = walker.nextNode();
        }
        if (parts.length > 0) {
          let reconstructed = parts.join("");
          reconstructed = reconstructed.split("\n").map((line) => {
            let cleaned = line.replace(/\s+/g, " ");
            cleaned = cleaned.replace(/\s+([,.;:!?\)\]\}])/g, "$1");
            cleaned = cleaned.replace(/([\(\[\{])\s+/g, "$1");
            return cleaned.trim();
          }).join("\n");
          if (clipEvent.clipboardData) {
            clipEvent.clipboardData.setData("text/plain", reconstructed);
            e.preventDefault();
            e.stopPropagation();
          }
        }
      } catch (err) {
        console.error("ACP: Failed to reconstruct copied text spaces:", err);
      }
    };
    const preventRestrictingEvents = (e) => {
      if (document.body.classList.contains(bodyClass)) {
        if (e.type === "keydown" || e.type === "keyup") {
          const keyEvent = e;
          const isShortcut = (keyEvent.ctrlKey || keyEvent.metaKey) && (keyEvent.key === "c" || keyEvent.key === "x" || keyEvent.key === "a");
          if (!isShortcut) return;
        }
        if (e.type === "copy") {
          handleCopy(e);
          return;
        }
        e.stopPropagation();
        if (e.stopImmediatePropagation) {
          e.stopImmediatePropagation();
        }
      }
    };
    const eventsToBlock = ["copy", "cut", "contextmenu", "selectstart", "dragstart", "keydown", "keyup"];
    eventsToBlock.forEach((evt) => {
      window.addEventListener(evt, preventRestrictingEvents, true);
    });
    try {
      delete window.initAllowCopyMainWorld;
    } catch (e) {
    }
  };
})();
