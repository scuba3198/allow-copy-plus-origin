import init, { should_bypass, add_domain, delete_domain } from './pkg/allow_copy_plus_origin.js';

const DOMAINS_KEY = "DOMAINS_KEY";
const SETTINGS_KEY = "SETTINGS_KEY";
const CONTEXT_MENU_ID = "allow-copy-context-menu";

let wasmInitialized = false;

// Initialize WebAssembly
const initWasm = async () => {
  if (wasmInitialized) return;
  await init();
  wasmInitialized = true;
};

// Helper: Extract host from Tab
const getTabHost = (tab) => {
  if (!tab || !tab.url) return "";
  try {
    const url = new URL(tab.url);
    if (url.protocol.startsWith("http")) {
      return url.host;
    }
  } catch (e) {}
  return "";
};

// Get settings and allowed domains from storage
const getStorageData = async () => {
  return new Promise((resolve) => {
    chrome.storage.sync.get([DOMAINS_KEY, SETTINGS_KEY], (res) => {
      const domains = res[DOMAINS_KEY] || {};
      const settings = res[SETTINGS_KEY] || {
        allowProtectedTextToCopy: true,
        hideContextMenu: false
      };
      resolve({ domains, settings });
    });
  });
};

// Update active state (Icon & Context Menu) for a specific Tab
const updateTabState = async (tab) => {
  if (!tab || !tab.id) return;
  
  const host = getTabHost(tab);
  if (!host) {
    chrome.action.setIcon({ path: "/images/32.png", tabId: tab.id });
    return;
  }

  await initWasm();
  const { domains, settings } = await getStorageData();
  const domainsJson = JSON.stringify(domains);
  const settingsJson = JSON.stringify(settings);

  const active = should_bypass(host, domainsJson, settingsJson);
  const iconPath = active ? "/images/32-on.png" : "/images/32.png";
  chrome.action.setIcon({ path: iconPath, tabId: tab.id });

  // Update context menu if this is the active tab in current window
  const [activeTab] = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
  if (activeTab && activeTab.id === tab.id) {
    updateContextMenu(active && !settings.hideContextMenu);
  }
};

// Update Chrome Context Menu
const updateContextMenu = (show) => {
  chrome.contextMenus.removeAll(() => {
    if (show) {
      chrome.contextMenus.create({
        id: CONTEXT_MENU_ID,
        title: chrome.i18n.getMessage("copy") || "Copy",
        contexts: ["selection"]
      }, () => {
        if (chrome.runtime.lastError) {
          // Ignore menu registration errors
        }
      });
    }
  });
};

// Toggle bypass state for a tab's domain
const toggleBypassForTab = async (tab) => {
  const host = getTabHost(tab);
  if (!host) return;

  await initWasm();
  const { domains, settings } = await getStorageData();
  const domainsJson = JSON.stringify(domains);
  const settingsJson = JSON.stringify(settings);

  const active = should_bypass(host, domainsJson, settingsJson);
  let updatedDomainsJson;

  try {
    if (active) {
      // It is currently active, so remove it
      updatedDomainsJson = delete_domain(host, domainsJson);
    } else {
      // It is currently inactive, so add it
      updatedDomainsJson = add_domain(host, domainsJson);
    }

    const updatedDomains = JSON.parse(updatedDomainsJson);
    chrome.storage.sync.set({ [DOMAINS_KEY]: updatedDomains }, () => {
      // Re-evaluate tab state after storage updates
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(t => {
          if (getTabHost(t) === host) {
            applyBypassToTab(t, !active);
          }
        });
      });
    });
  } catch (err) {
    console.error("Error toggling bypass domain:", err);
  }
};

// Inject or remove bypass scripts and styles
const applyBypassToTab = async (tab, enable) => {
  if (!tab || !tab.id) return;
  const tabId = tab.id;

  if (enable) {
    // Inject CSS styling
    chrome.scripting.insertCSS({
      target: { tabId: tabId, allFrames: true },
      files: ["inject.css"]
    }).catch(() => {});

    // Inject content scripts
    chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      files: ["inject_isolated.js"],
      world: "ISOLATED"
    }).catch(() => {});
  } else {
    // Remove CSS styling
    chrome.scripting.removeCSS({
      target: { tabId: tabId, allFrames: true },
      files: ["inject.css"]
    }).catch(() => {});

    // Message the isolated script to clean up listeners and element states
    chrome.tabs.sendMessage(tabId, { type: "deactivate" }).catch(() => {});
  }

  updateTabState(tab);
};

// Tab onUpdated listener
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const host = getTabHost(tab);
  if (!host) return;

  await initWasm();
  const { domains, settings } = await getStorageData();
  const domainsJson = JSON.stringify(domains);
  const settingsJson = JSON.stringify(settings);

  const active = should_bypass(host, domainsJson, settingsJson);

  if (changeInfo.status === "loading") {
    // Always inject the MAIN world event interceptor early in the loading cycle
    chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      files: ["inject_main.js"],
      world: "MAIN",
      injectImmediately: true
    }).catch(() => {});

    // Set correct icon status
    chrome.action.setIcon({
      path: active ? "/images/32-on.png" : "/images/32.png",
      tabId: tabId
    });
  } else if (changeInfo.status === "complete") {
    if (active) {
      applyBypassToTab(tab, true);
    }
  }
});

// Tab onActivated listener
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    updateTabState(tab);
  } catch (e) {}
});

// Extension Action Click listener
chrome.action.onClicked.addListener((tab) => {
  toggleBypassForTab(tab);
});

// Context Menu selection clicked
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === CONTEXT_MENU_ID && info.selectionText && tab && tab.id) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (text) => {
        try {
          const textarea = document.createElement("textarea");
          textarea.value = text;
          textarea.style.position = "fixed";
          textarea.style.opacity = "0";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
        } catch (e) {}
      },
      args: [info.selectionText]
    }).catch(() => {});
  }
});

// Storage sync change listener
chrome.storage.onChanged.addListener(async (changes) => {
  if (changes[DOMAINS_KEY] || changes[SETTINGS_KEY]) {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach(tab => updateTabState(tab));
    });
  }
});

// Initialize on extension installation/update
chrome.runtime.onInstalled.addListener(async (details) => {
  const { domains, settings } = await getStorageData();
  
  // Write default state if not initialized
  if (!settings || Object.keys(settings).length === 0) {
    chrome.storage.sync.set({
      [SETTINGS_KEY]: {
        allowProtectedTextToCopy: true,
        hideContextMenu: false
      }
    });
  }
  
  if (!domains) {
    chrome.storage.sync.set({ [DOMAINS_KEY]: {} });
  }

  // Pre-evaluate tab states
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => updateTabState(tab));
  });
});

// Initial startup scan
chrome.tabs.query({}, (tabs) => {
  tabs.forEach(tab => updateTabState(tab));
});
