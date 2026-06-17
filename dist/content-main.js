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
    const preventRestrictingEvents = (e) => {
      if (document.body.classList.contains(bodyClass)) {
        if (e.type === "keydown" || e.type === "keyup") {
          const keyEvent = e;
          const isShortcut = (keyEvent.ctrlKey || keyEvent.metaKey) && (keyEvent.key === "c" || keyEvent.key === "x" || keyEvent.key === "a");
          if (!isShortcut) return;
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
