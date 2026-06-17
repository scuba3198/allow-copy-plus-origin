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
