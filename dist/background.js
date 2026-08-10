// src/background.ts
var SETTINGS_KEY = "SETTINGS_KEY";
var DOMAINS_KEY = "DOMAINS_KEY";
var SYNC_MIGRATED_KEY = "SYNC_MIGRATED_KEY";
var DEFAULT_SETTINGS = {
  showSupportIcon: false,
  showDetectTextOverlay: false,
  hideContextMenu: false
};
var CSS_INJECTION_CODE = `
html, body,
html body *:not(input):not(textarea):not(select):not(option):not([contenteditable=""]):not([contenteditable="true"]) {
  user-select: text !important;
}

html body *:not(input):not(textarea):not(select):not(option)::selection {
  background-color: #3297fd !important;
  color: #ffffff !important;
}
`;
function getCleanHostname(urlStr) {
  if (!urlStr) return "";
  if (urlStr.startsWith("chrome://") || urlStr.startsWith("chrome-extension://") || urlStr.startsWith("https://chromewebstore.google.com")) {
    return "";
  }
  try {
    const url = new URL(urlStr);
    return url.hostname.toLowerCase();
  } catch (e) {
    return "";
  }
}
function getHostPermissionPattern(hostname) {
  return `*://${hostname}/*`;
}
async function hasHostAccess(hostname) {
  return chrome.permissions.contains({ origins: [getHostPermissionPattern(hostname)] });
}
async function migrateSyncToLocal() {
  const local = await chrome.storage.local.get([SYNC_MIGRATED_KEY, SETTINGS_KEY, DOMAINS_KEY]);
  if (local[SYNC_MIGRATED_KEY]) return;
  const synced = await chrome.storage.sync.get([SETTINGS_KEY, DOMAINS_KEY]);
  const legacyKeys = [SETTINGS_KEY, DOMAINS_KEY].filter((key) => synced[key] !== void 0);
  const migrated = {};
  if (local[SETTINGS_KEY] === void 0 && synced[SETTINGS_KEY] !== void 0) {
    migrated[SETTINGS_KEY] = synced[SETTINGS_KEY];
  }
  if (local[DOMAINS_KEY] === void 0 && synced[DOMAINS_KEY] !== void 0) {
    migrated[DOMAINS_KEY] = synced[DOMAINS_KEY];
  }
  await chrome.storage.local.set(migrated);
  if (legacyKeys.length > 0) {
    await chrome.storage.sync.remove(legacyKeys);
  }
  await chrome.storage.local.set({ [SYNC_MIGRATED_KEY]: true });
}
async function isBypassEnabledForDomain(domain) {
  if (!domain) return false;
  const storage = await chrome.storage.local.get(DOMAINS_KEY);
  const domains = storage[DOMAINS_KEY] || {};
  return !!domains[domain];
}
function updateActionIcon(enabled, tabId) {
  const iconPath = enabled ? "/images/32-on.png" : "/images/32.png";
  chrome.action.setIcon({ path: iconPath, tabId }, () => {
    const err = chrome.runtime.lastError;
  });
}
async function updateContextMenu() {
  chrome.contextMenus.removeAll(async () => {
    const settingsStorage = await chrome.storage.local.get(SETTINGS_KEY);
    const settings = settingsStorage[SETTINGS_KEY] || DEFAULT_SETTINGS;
    if (settings.hideContextMenu) return;
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.url) {
      const hostname = getCleanHostname(activeTab.url);
      const isEnabled = await isBypassEnabledForDomain(hostname);
      if (isEnabled && await hasHostAccess(hostname)) {
        chrome.contextMenus.create({
          id: "allow-copy-context",
          title: "Copy (Bypassed)",
          contexts: ["selection"]
        });
      }
    }
  });
}
async function applyBypass(tabId, hostname) {
  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      css: CSS_INJECTION_CODE
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["dist/content-isolate.js"]
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["dist/content-main.js"],
      world: "MAIN"
    });
    const bodyClass = hostname.replace(/\./g, "_");
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (host, cls) => {
        if (typeof window.initAllowCopyMainWorld === "function") {
          window.initAllowCopyMainWorld(host, cls);
        }
      },
      args: [hostname, bodyClass],
      world: "MAIN"
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (cls) => {
        if (document.body) {
          document.body.classList.add(cls);
          document.body.dataset["acpActiveClass"] = cls;
        }
      },
      args: [bodyClass]
    });
  } catch (err) {
    console.error("ACP: Error applying bypass:", err);
  }
}
async function removeBypass(tabId, hostname) {
  try {
    const bodyClass = hostname.replace(/\./g, "_");
    await chrome.tabs.sendMessage(tabId, { type: "Core_Deactivate" }).catch(() => {
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (typeof window.disableAllowCopyMainWorld === "function") {
          window.disableAllowCopyMainWorld();
        }
      },
      world: "MAIN"
    }).catch(() => {
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (cls) => {
        if (document.body) {
          document.body.classList.remove(cls);
          if (document.body.dataset["acpActiveClass"] === cls) {
            delete document.body.dataset["acpActiveClass"];
          }
        }
      },
      args: [bodyClass]
    }).catch(() => {
    });
    await chrome.scripting.removeCSS({
      target: { tabId },
      css: CSS_INJECTION_CODE
    }).catch(() => {
    });
  } catch (err) {
    console.error("ACP: Error removing bypass:", err);
  }
}
async function disableDomain(domain) {
  if (!domain) return false;
  const pattern = getHostPermissionPattern(domain);
  const hasAccess = await hasHostAccess(domain);
  if (hasAccess) {
    let tabs;
    try {
      tabs = await chrome.tabs.query({ url: [pattern] });
    } catch (err) {
      console.error("ACP: Could not enumerate domain tabs:", err);
      return false;
    }
    await Promise.all(tabs.filter((tab) => tab.id !== void 0).map((tab) => removeBypass(tab.id, domain)));
  }
  const storage = await chrome.storage.local.get(DOMAINS_KEY);
  const domains = storage[DOMAINS_KEY] || {};
  if (domains[domain]) {
    delete domains[domain];
    await chrome.storage.local.set({ [DOMAINS_KEY]: domains });
  }
  if (hasAccess) {
    await chrome.permissions.remove({ origins: [pattern] });
  }
  return true;
}
async function evaluateTabState(tab) {
  if (!tab.id || !tab.url) return;
  const hostname = getCleanHostname(tab.url);
  if (!hostname) return;
  const isEnabled = await isBypassEnabledForDomain(hostname);
  const hasAccess = isEnabled && await hasHostAccess(hostname);
  updateActionIcon(hasAccess, tab.id);
  if (hasAccess) {
    await applyBypass(tab.id, hostname);
  } else {
    await removeBypass(tab.id, hostname);
  }
}
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    await evaluateTabState(tab);
    await updateContextMenu();
  }
});
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    await evaluateTabState(tab);
    await updateContextMenu();
  } catch (e) {
  }
});
chrome.action.onClicked.addListener((tab) => {
  const activeTab = tab;
  if (!activeTab?.id || !activeTab.url) return;
  const hostname = getCleanHostname(activeTab.url);
  if (!hostname) return;
  const storagePromise = chrome.storage.local.get(DOMAINS_KEY);
  const hasAccessPromise = hasHostAccess(hostname);
  let permissionPromise;
  try {
    permissionPromise = chrome.permissions.request({ origins: [getHostPermissionPattern(hostname)] }).then(
      (granted) => ({ granted }),
      (error) => ({ granted: false, error })
    );
  } catch (error) {
    console.error(`ACP: Permission request failed for ${hostname}:`, error);
    updateActionIcon(false, activeTab.id);
    return;
  }
  (async () => {
    const [storage, hasAccess] = await Promise.all([storagePromise, hasAccessPromise]);
    const domains = storage[DOMAINS_KEY] || {};
    if (domains[hostname] && hasAccess) {
      if (!await disableDomain(hostname)) {
        updateActionIcon(true, activeTab.id);
        return;
      }
      updateActionIcon(false, activeTab.id);
    } else {
      const permission = await permissionPromise;
      if (!permission.granted) {
        if (permission.error) {
          console.error(`ACP: Permission request failed for ${hostname}:`, permission.error);
        } else {
          console.warn(`ACP: Permission request denied for ${hostname}`);
        }
        updateActionIcon(false, activeTab.id);
        return;
      }
      if (!domains[hostname]) domains[hostname] = (/* @__PURE__ */ new Date()).toISOString();
      await chrome.storage.local.set({ [DOMAINS_KEY]: domains });
      await evaluateTabState(activeTab);
    }
    await updateContextMenu();
  })().catch((error) => {
    console.error(`ACP: Action click failed for ${hostname}:`, error);
    updateActionIcon(false, activeTab.id);
  });
});
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "allow-copy-context" && info.selectionText && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: "CopyByContextMenu",
      data: info.selectionText
    }).catch(() => {
    });
  }
});
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PingBgFromActiveTab") {
    sendResponse({ isSuccess: true });
  } else if (message.type === "DisableDomain" && typeof message.domain === "string") {
    disableDomain(message.domain).then((success) => sendResponse({ success })).catch(() => sendResponse({ success: false }));
    return true;
  }
  return true;
});
chrome.runtime.onInstalled.addListener(async (details) => {
  await migrateSyncToLocal();
  const settingsStorage = await chrome.storage.local.get(SETTINGS_KEY);
  if (!settingsStorage[SETTINGS_KEY]) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
  }
  const domainsStorage = await chrome.storage.local.get(DOMAINS_KEY);
  if (!domainsStorage[DOMAINS_KEY]) {
    await chrome.storage.local.set({ [DOMAINS_KEY]: {} });
  }
  await updateContextMenu();
});
