// src/content-main.ts
(function() {
  const win = window;
  const STATE_KEY = "__ACP_MAIN_WORLD_STATE__";
  const TEARDOWN_EVENT = "ACP_TEARDOWN";
  const KIEC_HOSTNAME = "portal.kiec.edu.np";
  const isEditableTarget = (target) => {
    const element = target instanceof HTMLElement ? target : null;
    return !!element && (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT|OPTION)$/.test(element.tagName));
  };
  const reconstructKiecCopy = (event) => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !event.clipboardData) return false;
    try {
      const range = selection.getRangeAt(0);
      const container = range.commonAncestorContainer;
      const rootNode = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement || document.body;
      const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
        acceptNode: (node) => {
          if (node.nodeName === "BR" && range.intersectsNode(node)) return NodeFilter.FILTER_ACCEPT;
          return node.nodeType === Node.TEXT_NODE && range.intersectsNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
      });
      const parts = [];
      let lastNode = null;
      let currentNode = walker.nextNode();
      const isBlock = (display) => display.includes("block") && display !== "inline-block" || display.includes("flex") && display !== "inline-flex" || display.includes("grid") && display !== "inline-grid" || display === "table" || display === "table-row";
      const getClosestBlockAncestor = (node) => {
        let parent = node.parentElement;
        while (parent && parent !== document.body && parent !== document.documentElement) {
          if (isBlock(window.getComputedStyle(parent).display)) return parent;
          parent = parent.parentElement;
        }
        return null;
      };
      while (currentNode) {
        if (currentNode.nodeName === "BR") {
          parts.push("\n");
        } else if (currentNode.nodeType === Node.TEXT_NODE) {
          const text = currentNode.textContent || "";
          const start = currentNode === range.startContainer ? range.startOffset : 0;
          const end = currentNode === range.endContainer ? range.endOffset : text.length;
          if (lastNode?.nodeType === Node.TEXT_NODE) {
            const lastBlock = getClosestBlockAncestor(lastNode);
            const currentBlock = getClosestBlockAncestor(currentNode);
            if (lastBlock !== currentBlock) {
              parts.push("\n\n");
            } else {
              parts.push(" ");
            }
          }
          parts.push(text.substring(start, end));
          lastNode = currentNode;
        }
        currentNode = walker.nextNode();
      }
      if (!parts.length) return false;
      const reconstructed = parts.join("").split("\n").map((line) => {
        let cleaned = line.replace(/\s+/g, " ");
        cleaned = cleaned.replace(/\s+([,.;:!?\)\]\}])/g, "$1");
        cleaned = cleaned.replace(/([\(\[\{])\s+/g, "$1");
        return cleaned.trim();
      }).join("\n");
      event.clipboardData.setData("text/plain", reconstructed);
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      return true;
    } catch (error) {
      console.error("ACP: Failed to reconstruct copied text spaces:", error);
      return false;
    }
  };
  const init = (hostname, bodyClass) => {
    win[STATE_KEY]?.dispose();
    const isKiecHost = hostname === KIEC_HOSTNAME;
    const handleEvent = (event) => {
      if (!document.body?.classList.contains(bodyClass) || isEditableTarget(event.target)) return;
      if (event.type === "keydown" || event.type === "keyup") {
        const keyEvent = event;
        const isCopyShortcut = (keyEvent.ctrlKey || keyEvent.metaKey) && ["c", "x", "a"].includes(keyEvent.key.toLowerCase());
        if (!isCopyShortcut) return;
      }
      if (event.type === "copy" && isKiecHost && reconstructKiecCopy(event)) return;
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };
    const events = ["copy", "cut", "contextmenu", "selectstart", "dragstart", "keydown", "keyup"];
    events.forEach((type) => window.addEventListener(type, handleEvent, true));
    const dispose = () => {
      events.forEach((type) => window.removeEventListener(type, handleEvent, true));
      document.removeEventListener(TEARDOWN_EVENT, dispose, true);
      if (win[STATE_KEY]?.dispose === dispose) delete win[STATE_KEY];
    };
    win[STATE_KEY] = { dispose };
    document.addEventListener(TEARDOWN_EVENT, dispose, true);
  };
  win.initAllowCopyMainWorld = init;
  win.disableAllowCopyMainWorld = () => {
    win[STATE_KEY]?.dispose();
    delete win.disableAllowCopyMainWorld;
    delete win.initAllowCopyMainWorld;
  };
})();
