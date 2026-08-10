// Main-world capture handlers for pages that install copy restrictions.

(function () {
  const win = window as any;
  const STATE_KEY = "__ACP_MAIN_WORLD_STATE__";
  const TEARDOWN_EVENT = "ACP_TEARDOWN";

  const isEditableTarget = (target: EventTarget | null): boolean => {
    const element = target instanceof HTMLElement ? target : null;
    return !!element && (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT|OPTION)$/.test(element.tagName));
  };

  const init = (_hostname: string, bodyClass: string) => {
    win[STATE_KEY]?.dispose();

    const handleEvent = (event: Event) => {
      if (!document.body?.classList.contains(bodyClass) || isEditableTarget(event.target)) return;

      if (event.type === "keydown" || event.type === "keyup") {
        const keyEvent = event as KeyboardEvent;
        const isCopyShortcut = (keyEvent.ctrlKey || keyEvent.metaKey) &&
          ["c", "x", "a"].includes(keyEvent.key.toLowerCase());
        if (!isCopyShortcut) return;
      }

      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };

    const events = ["copy", "cut", "contextmenu", "selectstart", "dragstart", "keydown", "keyup"];
    events.forEach(type => window.addEventListener(type, handleEvent, true));

    const dispose = () => {
      events.forEach(type => window.removeEventListener(type, handleEvent, true));
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
