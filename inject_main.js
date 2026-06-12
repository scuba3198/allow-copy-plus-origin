(function () {
    'use strict';
    const host = window.location.host;
    const hostClass = host.replace(/\./g, '_');
    const marker = "ALLOW_COPY_PLUS_ORIGIN_MAIN_INJECTED";
    if (window[marker])
        return;
    window[marker] = { attachedListeners: [] };
    const getRegistry = () => {
        return window[marker];
    };
    /**
     * List of domains known for using highly aggressive event-level blockers.
     * On these domains, the script overrides addEventListener and removeEventListener.
     */
    const targetDomains = new Set([
        "jusbrasil.com.br", "jusbrasil.com", "app.littleexits.com",
        "lx9t5cgtsl.feishu.cn", "feishu.cn", "alllhealth.com",
        "lms.catchon.jp", "amcatglobal.aspiringminds.com",
        "aspiringminds.com", "netacad.com", "bytexl.app",
        "abhyas.ai", "school.haoduo.vip", "digitalnttf.com",
        "subsiditepatlpg.mypertamina.id", "mypertamina.id",
        "ks.cqsdx.cn", "cqsdx.cn", "ime.digiicampus.com",
        "digiicampus.com", "app.sophia.org", "sophia.org",
        "darkscript.com.br", "darkscript.com", "siiopp.gnr.local",
        "gnr.local", "biblioteca.nubedelectura.com",
        "nubedelectura.com", "missov.ma"
    ]);
    /**
     * Overrides EventTarget addEventListener/removeEventListener to prevent target pages
     * from attaching blocking select/copy event handlers.
     */
    const initOverride = () => {
        const registry = getRegistry();
        const copyEvents = new Set(["copy", "cut", "paste", "selectstart", "contextmenu", "dragstart", "keydown"]);
        const originalAdd = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (type, listener, options) {
            if (!listener) {
                return originalAdd.call(this, type, listener, options);
            }
            if (copyEvents.has(type)) {
                const wrapper = function (...args) {
                    if (document.body && document.body.classList.contains(hostClass)) {
                        const event = args[0];
                        if (event) {
                            event.stopPropagation();
                            if (event.stopImmediatePropagation) {
                                event.stopImmediatePropagation();
                            }
                        }
                        return;
                    }
                    if (typeof listener === 'function') {
                        return listener.apply(this, args);
                    }
                    else if (listener && typeof listener.handleEvent === 'function') {
                        return listener.handleEvent(args[0]);
                    }
                };
                registry.attachedListeners.push({
                    target: this,
                    type: type,
                    original: listener,
                    wrapper: wrapper,
                    options: options
                });
                originalAdd.call(this, type, wrapper, options);
            }
            else {
                originalAdd.call(this, type, listener, options);
            }
        };
        const originalRemove = EventTarget.prototype.removeEventListener;
        EventTarget.prototype.removeEventListener = function (type, listener, options) {
            if (!listener) {
                return originalRemove.call(this, type, listener, options);
            }
            if (copyEvents.has(type)) {
                const found = registry.attachedListeners.find(item => item.target === this && item.type === type && item.original === listener);
                if (found) {
                    originalRemove.call(this, type, found.wrapper, options);
                    registry.attachedListeners = registry.attachedListeners.filter(item => item !== found);
                }
                else {
                    originalRemove.call(this, type, listener, options);
                }
            }
            else {
                originalRemove.call(this, type, listener, options);
            }
        };
    };
    try {
        const isTarget = Array.from(targetDomains.values()).some(domain => host.includes(domain));
        if (isTarget) {
            initOverride();
        }
        /**
         * Intercepts window-level copy/select events at the capture phase to block page-level locks.
         * @param e - The captured event.
         */
        const captureBlocker = (e) => {
            if (document.body && document.body.classList.contains(hostClass)) {
                if (e.type === "keydown" || e.type === "keyup") {
                    const keyEvent = e;
                    if (!keyEvent.ctrlKey && !keyEvent.metaKey)
                        return;
                    if (keyEvent.key !== 'c' && keyEvent.key !== 'x' && keyEvent.key !== 'a')
                        return;
                }
                e.stopPropagation();
                if (e.stopImmediatePropagation) {
                    e.stopImmediatePropagation();
                }
            }
        };
        ["copy", "cut", "contextmenu", "selectstart", "dragstart", "keydown", "keyup"].forEach(event => {
            window.addEventListener(event, captureBlocker, true);
        });
    }
    catch (err) { }
})();
export {};
