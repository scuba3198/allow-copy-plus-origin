// Content Script running in the MAIN world to override EventTarget.prototype.addEventListener
// and block websites from registering event listeners that restrict copy/paste.

(function () {
  const RUN_FLAG = "ACP_MAIN_WORLD_INJECTED";
  if ((window as any)[RUN_FLAG]) return;
  (window as any)[RUN_FLAG] = true;

  // Retrieve parameters from script tag datasets or window properties.
  // When executing via scripting.executeScript, esbuild bundle wrapper wraps this in an IIFE.
  // We can pass values using window property or by finding the current script,
  // but since scripting.executeScript executes the function directly with args,
  // let's define a global listener initialization function that the background script can invoke
  // or define the function so it can be called with arguments.
  
  const INTERCEPT_DOMAINS = new Set([
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

  (window as any).initAllowCopyMainWorld = function (hostname: string, bodyClass: string) {
    const isDomainTargeted = [...INTERCEPT_DOMAINS].some(domain => hostname.includes(domain));
    
    if (isDomainTargeted) {
      const originalAddEventListener = EventTarget.prototype.addEventListener;
      const originalRemoveEventListener = EventTarget.prototype.removeEventListener;
      
      const attachedListeners: Array<{
        target: EventTarget;
        type: string;
        original: any;
        wrapper: any;
        options?: any;
      }> = [];

      const restrictedEvents = new Set(["copy", "cut", "selectstart", "contextmenu", "dragstart", "keydown"]);

      EventTarget.prototype.addEventListener = function (type: string, listener: any, options?: any) {
        if (restrictedEvents.has(type) && typeof listener === "function") {
          const wrapper = function (this: any, ...args: any[]) {
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

      EventTarget.prototype.removeEventListener = function (type: string, listener: any, options?: any) {
        if (restrictedEvents.has(type)) {
          const index = attachedListeners.findIndex(
            item => item.target === this && item.type === type && item.original === listener
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

    // Reconstructs visually separated inline words into normally spaced text on copy events
    const handleCopy = (e: Event) => {
      const clipEvent = e as ClipboardEvent;
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      try {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const rootNode = container.nodeType === Node.ELEMENT_NODE 
          ? (container as Element) 
          : (container.parentElement || document.body);

        // Walk all text nodes and line breaks inside the common selection ancestor in document order
        const walker = document.createTreeWalker(
          rootNode,
          NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
          {
            acceptNode: (node) => {
              if (node.nodeName === 'BR') {
                return NodeFilter.FILTER_ACCEPT;
              }
              if (node.nodeType === Node.TEXT_NODE && range.intersectsNode(node)) {
                return NodeFilter.FILTER_ACCEPT;
              }
              return NodeFilter.FILTER_SKIP;
            }
          }
        );

        const parts: string[] = [];
        let lastNode: Node | null = null;
        let currentNode = walker.nextNode();

        while (currentNode) {
          if (currentNode.nodeName === 'BR') {
            parts.push('\n');
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
            
            // Detect element-boundary transitions and insert spaces or newlines accordingly
            if (lastNode && lastNode.nodeType === Node.TEXT_NODE) {
              const lastParent = lastNode.parentElement;
              const currentParent = currentNode.parentElement;
              if (lastParent && currentParent && lastParent !== currentParent) {
                const lastDisplay = window.getComputedStyle(lastParent).display;
                const currentDisplay = window.getComputedStyle(currentParent).display;
                
                // Exclude inline-block, inline-flex, and inline-grid so they aren't parsed as blocks
                const isBlock = (display: string) => {
                  return (display.includes('block') && display !== 'inline-block') ||
                         (display.includes('flex') && display !== 'inline-flex') ||
                         (display.includes('grid') && display !== 'inline-grid') ||
                         display === 'table' || display === 'table-row';
                };

                const isBlockTransition = isBlock(lastDisplay) || isBlock(currentDisplay);
                
                if (isBlockTransition) {
                  parts.push('\n');
                } else {
                  parts.push(' '); // Standard inline word separation
                }
              } else {
                parts.push(' ');
              }
            }
            
            parts.push(extracted);
            lastNode = currentNode;
          }
          currentNode = walker.nextNode();
        }

        if (parts.length > 0) {
          let reconstructed = parts.join("");
          
          // Clean up multi-space runs and formatting artifacts per line
          reconstructed = reconstructed.split('\n')
            .map(line => {
              let cleaned = line.replace(/\s+/g, ' ');
              cleaned = cleaned.replace(/\s+([,.;:!?')\]}])/g, '$1');
              cleaned = cleaned.replace(/([('\[{])\s+/g, '$1');
              return cleaned.trim();
            })
            .join('\n');

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

    // Always intercept on window in capture phase to prevent copy/paste blocks
    const preventRestrictingEvents = (e: Event) => {
      if (document.body.classList.contains(bodyClass)) {
        if (e.type === "keydown" || e.type === "keyup") {
          const keyEvent = e as KeyboardEvent;
          // Only stop propagation for Copy (Ctrl+C), Cut (Ctrl+X), and Select All (Ctrl+A)
          const isShortcut = (keyEvent.ctrlKey || keyEvent.metaKey) && 
            (keyEvent.key === "c" || keyEvent.key === "x" || keyEvent.key === "a");
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
    eventsToBlock.forEach(evt => {
      window.addEventListener(evt, preventRestrictingEvents, true);
    });

    // Delete temporary initializer to avoid polluting the page context
    try {
      delete (window as any).initAllowCopyMainWorld;
    } catch (e) {}
  };
})();
