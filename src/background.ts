// Background Service Worker for Allow Copy+ Origin in TypeScript

export {};

const SETTINGS_KEY = "SETTINGS_KEY";
const DOMAINS_KEY = "DOMAINS_KEY";
const SYNC_MIGRATED_KEY = "SYNC_MIGRATED_KEY";

interface ExtensionSettings {
  showSupportIcon: boolean;
  showDetectTextOverlay: boolean;
  hideContextMenu: boolean;
}

const DEFAULT_SETTINGS: ExtensionSettings = {
  showSupportIcon: false,
  showDetectTextOverlay: false,
  hideContextMenu: false
};

const CSS_INJECTION_CODE = `
html, body,
html body *:not(input):not(textarea):not(select):not(option):not([contenteditable=""]):not([contenteditable="true"]) {
  user-select: text !important;
}

html body *:not(input):not(textarea):not(select):not(option)::selection {
  background-color: #3297fd !important;
  color: #ffffff !important;
}
`;

// Helper to extract clean domain/hostname from a URL
function getCleanHostname(urlStr?: string): string {
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

function getHostPermissionPattern(hostname: string): string {
  return `*://${hostname}/*`;
}

async function hasHostAccess(hostname: string): Promise<boolean> {
  return chrome.permissions.contains({ origins: [getHostPermissionPattern(hostname)] });
}

// Migrate legacy synced settings once. Host access cannot be granted here: Chrome only
// permits permission requests during a user gesture, so toolbar/options actions handle it.
async function migrateSyncToLocal() {
  const local = await chrome.storage.local.get([SYNC_MIGRATED_KEY, SETTINGS_KEY, DOMAINS_KEY]);
  if (local[SYNC_MIGRATED_KEY]) return;

  const synced = await chrome.storage.sync.get([SETTINGS_KEY, DOMAINS_KEY]);
  const legacyKeys = [SETTINGS_KEY, DOMAINS_KEY].filter(key => synced[key] !== undefined);
  const migrated: Record<string, unknown> = {};
  if (local[SETTINGS_KEY] === undefined && synced[SETTINGS_KEY] !== undefined) {
    migrated[SETTINGS_KEY] = synced[SETTINGS_KEY];
  }
  if (local[DOMAINS_KEY] === undefined && synced[DOMAINS_KEY] !== undefined) {
    migrated[DOMAINS_KEY] = synced[DOMAINS_KEY];
  }
  await chrome.storage.local.set(migrated);
  if (legacyKeys.length > 0) {
    await chrome.storage.sync.remove(legacyKeys);
  }
  await chrome.storage.local.set({ [SYNC_MIGRATED_KEY]: true });
}

// Check if bypass is enabled for a domain
async function isBypassEnabledForDomain(domain: string): Promise<boolean> {
  if (!domain) return false;
  const storage = await chrome.storage.local.get(DOMAINS_KEY);
  const domains = storage[DOMAINS_KEY] || {};
  return !!domains[domain];
}

// Update Extension Action Icon
function updateActionIcon(enabled: boolean, tabId: number) {
  const iconPath = enabled ? "/images/32-on.png" : "/images/32.png";
  chrome.action.setIcon({ path: iconPath, tabId }, () => {
    // Accessing chrome.runtime.lastError clears the warning if the tab was closed
    const err = chrome.runtime.lastError;
  });
}

// Register or remove context menu items
async function updateContextMenu() {
  chrome.contextMenus.removeAll(async () => {
    const settingsStorage = await chrome.storage.local.get(SETTINGS_KEY);
    const settings: ExtensionSettings = settingsStorage[SETTINGS_KEY] || DEFAULT_SETTINGS;
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

// Apply bypass scripting and styles to a tab
async function applyBypass(tabId: number, hostname: string) {
  try {
    // Inject custom styling
    await chrome.scripting.insertCSS({
      target: { tabId },
      css: CSS_INJECTION_CODE
    });

    // Inject isolated content script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["dist/content-isolate.js"]
    });

    // Injected MAIN world script to block event listener restrictions
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["dist/content-main.js"],
      world: "MAIN"
    });

    const bodyClass = hostname.replace(/\./g, "_");
    // Initialize the main world event overrides
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (host: string, cls: string) => {
        if (typeof (window as any).initAllowCopyMainWorld === "function") {
          (window as any).initAllowCopyMainWorld(host, cls);
        }
      },
      args: [hostname, bodyClass],
      world: "MAIN"
    });

    // Apply active class representation to body
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (cls: string) => {
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

// Deactivate bypass script representation on a tab
async function removeBypass(tabId: number, hostname: string) {
  try {
    const bodyClass = hostname.replace(/\./g, "_");
    
    // Send message to content script to revert modifications
    await chrome.tabs.sendMessage(tabId, { type: "Core_Deactivate" }).catch(() => {});

    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (typeof (window as any).disableAllowCopyMainWorld === "function") {
          (window as any).disableAllowCopyMainWorld();
        }
      },
      world: "MAIN"
    }).catch(() => {});

    // Remove the tracking class on body
    await chrome.scripting.executeScript({
      target: { tabId },
      func: (cls: string) => {
        if (document.body) {
          document.body.classList.remove(cls);
          if (document.body.dataset["acpActiveClass"] === cls) {
            delete document.body.dataset["acpActiveClass"];
          }
        }
      },
      args: [bodyClass]
    }).catch(() => {});

    // Clean up CSS style injection
    await chrome.scripting.removeCSS({
      target: { tabId },
      css: CSS_INJECTION_CODE
    }).catch(() => {});
  } catch (err) {
    console.error("ACP: Error removing bypass:", err);
  }
}

// Disable a domain everywhere before dropping its stored state or permission.
async function disableDomain(domain: string): Promise<boolean> {
  if (!domain) return false;
  const pattern = getHostPermissionPattern(domain);
  const hasAccess = await hasHostAccess(domain);
  if (hasAccess) {
    let tabs: chrome.tabs.Tab[];
    try {
      tabs = await chrome.tabs.query({ url: [pattern] });
    } catch (err) {
      console.error("ACP: Could not enumerate domain tabs:", err);
      return false;
    }
    await Promise.all(tabs.filter(tab => tab.id !== undefined).map(tab => removeBypass(tab.id!, domain)));
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

// Check and update tab bypass state
async function evaluateTabState(tab: chrome.tabs.Tab) {
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

// Event Listeners: Tab Updates
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete") {
    await evaluateTabState(tab);
    await updateContextMenu();
  }
});

// Event Listeners: Tab Activation
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    await evaluateTabState(tab);
    await updateContextMenu();
  } catch (e) {}
});

// Action Click (Toggles copy bypass for current tab domain)
chrome.action.onClicked.addListener(async (tab) => {
  const activeTab = tab.id && tab.url
    ? tab
    : (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (!activeTab?.id || !activeTab.url) return;
  const hostname = getCleanHostname(activeTab.url);
  if (!hostname) return;

  const storage = await chrome.storage.local.get(DOMAINS_KEY);
  const domains = storage[DOMAINS_KEY] || {};

  const hasAccess = await hasHostAccess(hostname);
  if (domains[hostname] && hasAccess) {
    if (!await disableDomain(hostname)) {
      updateActionIcon(true, activeTab.id);
      return;
    }
    updateActionIcon(false, activeTab.id);
  } else {
    const granted = await chrome.permissions.request({ origins: [getHostPermissionPattern(hostname)] });
    if (!granted) {
      updateActionIcon(false, activeTab.id);
      return;
    }
    if (!domains[hostname]) domains[hostname] = new Date().toISOString();
    await chrome.storage.local.set({ [DOMAINS_KEY]: domains });
    await evaluateTabState(activeTab);
  }

  await updateContextMenu();
});

// Context Menu Clicks
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "allow-copy-context" && info.selectionText && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: "CopyByContextMenu",
      data: info.selectionText
    }).catch(() => {});
  }
});

// Listen to messages from content script pings or options panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PingBgFromActiveTab") {
    sendResponse({ isSuccess: true });
  } else if (message.type === "DisableDomain" && typeof message.domain === "string") {
    disableDomain(message.domain)
      .then(success => sendResponse({ success }))
      .catch(() => sendResponse({ success: false }));
    return true;
  }
  return true;
});

// On Installed / Startup initialization
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
