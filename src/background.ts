// Background Service Worker for Allow Copy+ Origin in TypeScript

export {};

const SETTINGS_KEY = "SETTINGS_KEY";
const DOMAINS_KEY = "DOMAINS_KEY";

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
html, body, body:not(.web_whatsapp_com) *, html body:not(.web_whatsapp_com) *, html body.ds *, 
html body:not(.web_whatsapp_com) div *, html body:not(.web_whatsapp_com) span *, html body p *, 
html body h1 *, html body h2 *, html body h3 *, html body h4 *, html body h5 *,
html body:not(.web_whatsapp_com) *:not(input):not(textarea):not([contenteditable=""]):not([contenteditable="true"]) {
  user-select: text !important;
}

html body *:not(input):not(textarea)::selection,
body *:not(input):not(textarea)::selection,
html body div *:not(input):not(textarea)::selection,
html body span *:not(input):not(textarea)::selection,
html body p *:not(input):not(textarea)::selection,
html body h1 *:not(input):not(textarea)::selection,
html body h2 *:not(input):not(textarea)::selection,
html body h3 *:not(input):not(textarea)::selection,
html body h4 *:not(input):not(textarea)::selection,
html body h5 *:not(input):not(textarea)::selection {
  background-color: #3297fd !important;
  color: #ffffff !important;
}

/* Site specific overrides */
.www_linkedin_com .sa-assessment-flow__card.sa-assessment-quiz .sa-assessment-quiz__scroll-content .sa-assessment-quiz__response .sa-question-multichoice__item.sa-question-basic-multichoice__item .sa-question-multichoice__input.sa-question-basic-multichoice__input.ember-checkbox.ember-view {
  width: 40px;
}
.www_instagram_com ._aagw {
  display: none;
}
.web_telegram_org .emoji-animation-container {
  display: none;
}
html body.web_telegram_org .bubbles-group > .bubbles-group-avatar-container:not(input):not(textarea):not([contenteditable=""]):not([contenteditable="true"]),
html body.web_telegram_org .custom-emoji-renderer:not(input):not(textarea):not([contenteditable=""]):not([contenteditable="true"]) {
  pointer-events: none !important;
}
.ladno_ru [style*="position: absolute; left: 0; right: 0; top: 0; bottom: 0;"] {
  display: none !important;
}
.mycomfyshoes_fr #fader.fade-out {
  display: none !important;
}
.www_mindmeister_com .kr-view {
  z-index: -1 !important;
}
.www_newvision_co_ug .v-snack:not(.v-snack--absolute) {
  z-index: -1 !important;
}
.derstarih_com .bs-sks {
  z-index: -1;
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

// Check if bypass is enabled for a domain
async function isBypassEnabledForDomain(domain: string): Promise<boolean> {
  if (!domain) return false;
  const storage = await chrome.storage.sync.get(DOMAINS_KEY);
  const domains = storage[DOMAINS_KEY] || {};
  return !!domains[domain];
}

// Update Extension Action Icon
function updateActionIcon(enabled: boolean, tabId: number) {
  const iconPath = enabled ? "/images/32-on.png" : "/images/32.png";
  chrome.action.setIcon({ path: iconPath, tabId });
}

// Register or remove context menu items
async function updateContextMenu() {
  chrome.contextMenus.removeAll(async () => {
    const settingsStorage = await chrome.storage.sync.get(SETTINGS_KEY);
    const settings: ExtensionSettings = settingsStorage[SETTINGS_KEY] || DEFAULT_SETTINGS;
    if (settings.hideContextMenu) return;

    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab && activeTab.url) {
      const hostname = getCleanHostname(activeTab.url);
      const isEnabled = await isBypassEnabledForDomain(hostname);
      if (isEnabled) {
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
      target: { tabId, allFrames: true },
      css: CSS_INJECTION_CODE
    });

    // Inject isolated content script
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["dist/content-isolate.js"]
    });

    // Injected MAIN world script to block event listener restrictions
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      files: ["dist/content-main.js"],
      world: "MAIN"
    });

    const bodyClass = hostname.replace(/\./g, "_");
    // Initialize the main world event overrides
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
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
      target: { tabId, allFrames: true },
      func: (cls: string) => {
        document.body.classList.add(cls);
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

    // Remove the tracking class on body
    await chrome.scripting.executeScript({
      target: { tabId, allFrames: true },
      func: (cls: string) => {
        document.body.classList.remove(cls);
      },
      args: [bodyClass]
    }).catch(() => {});

    // Clean up CSS style injection
    await chrome.scripting.removeCSS({
      target: { tabId, allFrames: true },
      css: CSS_INJECTION_CODE
    }).catch(() => {});
  } catch (err) {
    console.error("ACP: Error removing bypass:", err);
  }
}

// Check and update tab bypass state
async function evaluateTabState(tab: chrome.tabs.Tab) {
  if (!tab.id || !tab.url) return;
  const hostname = getCleanHostname(tab.url);
  if (!hostname) return;

  const isEnabled = await isBypassEnabledForDomain(hostname);
  updateActionIcon(isEnabled, tab.id);

  if (isEnabled) {
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
  if (!tab.id || !tab.url) return;
  const hostname = getCleanHostname(tab.url);
  if (!hostname) return;

  const storage = await chrome.storage.sync.get(DOMAINS_KEY);
  const domains = storage[DOMAINS_KEY] || {};

  if (domains[hostname]) {
    delete domains[hostname];
  } else {
    domains[hostname] = new Date().toISOString();
  }

  await chrome.storage.sync.set({ [DOMAINS_KEY]: domains });
  await evaluateTabState(tab);
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
  }
  return true;
});

// On Installed / Startup initialization
chrome.runtime.onInstalled.addListener(async (details) => {
  const settingsStorage = await chrome.storage.sync.get(SETTINGS_KEY);
  if (!settingsStorage[SETTINGS_KEY]) {
    await chrome.storage.sync.set({ [SETTINGS_KEY]: DEFAULT_SETTINGS });
  }

  const domainsStorage = await chrome.storage.sync.get(DOMAINS_KEY);
  if (!domainsStorage[DOMAINS_KEY]) {
    await chrome.storage.sync.set({ [DOMAINS_KEY]: {} });
  }

  await updateContextMenu();
});
