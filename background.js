import init, { evaluate_tab_update, add_domain, delete_domain } from './pkg/allow_copy_plus_origin.js';

const DOMAINS_KEY = "DOMAINS_KEY";
const SETTINGS_KEY = "SETTINGS_KEY";
const CONTEXT_MENU_ID = "allow-copy-context-menu";

let wasmInitialized = false;

/**
 * Initializes the WebAssembly module if it hasn't been initialized already.
 * @returns {Promise<void>}
 */
const initWasm = async () => {
  if (wasmInitialized) return;
  await init();
  wasmInitialized = true;
};

/**
 * Extracts the host domain name from a tab's URL.
 * @param {chrome.tabs.Tab} tab - The Chrome tab object.
 * @returns {string} The host domain name (e.g. "example.com"), or an empty string.
 */
const getTabHost = (tab) => {
  if (!tab?.url) return "";
  try {
    const url = new URL(tab.url);
    if (url.protocol.startsWith("http")) {
      return url.host;
    }
  } catch (e) {}
  return "";
};

/**
 * Retrieves the domains and settings config objects from storage.
 * @returns {Promise<{domains: Object, settings: Object}>} Resolved settings and domains list.
 */
const getStorageData = async () => {
  return new Promise((resolve) => {
    chrome.storage.sync.get([DOMAINS_KEY, SETTINGS_KEY], (res) => {
      const domains = res[DOMAINS_KEY] ?? {};
      const settings = res[SETTINGS_KEY] ?? {
        allowProtectedTextToCopy: true,
        hideContextMenu: false
      };
      resolve({ domains, settings });
    });
  });
};

/**
 * Updates the visual status (active icon/context menu) of a tab based on bypass state.
 * @param {chrome.tabs.Tab} tab - The Chrome tab object.
 * @returns {Promise<void>}
 */
const updateTabState = async (tab) => {
  if (!tab?.id) return;
  
  const host = getTabHost(tab);
  if (!host) {
    chrome.action.setIcon({ path: "/images/32.png", tabId: tab.id });
    return;
  }

  await initWasm();
  const { domains, settings } = await getStorageData();
  const domainsJson = JSON.stringify(domains);
  const settingsJson = JSON.stringify(settings);

  const actionObj = evaluate_tab_update("complete", host, domainsJson, settingsJson);
  if (actionObj) {
    chrome.action.setIcon({ path: actionObj.icon, tabId: tab.id });

    const [activeTab] = await new Promise(r => chrome.tabs.query({ active: true, currentWindow: true }, r));
    if (activeTab?.id === tab.id) {
      updateContextMenu(actionObj.showMenu && !settings.hideContextMenu);
    }
  }
};

/**
 * Creates or removes the "Copy" context menu item.
 * @param {boolean} show - True to display, false to hide.
 */
const updateContextMenu = (show) => {
  chrome.contextMenus.removeAll(() => {
    if (show) {
      chrome.contextMenus.create({
        id: CONTEXT_MENU_ID,
        title: chrome.i18n.getMessage("copy") ?? "Copy",
        contexts: ["selection"]
      }, () => {
        if (chrome.runtime.lastError) {
          // Ignore menu registration errors
        }
      });
    }
  });
};

/**
 * Toggles the bypass status of a tab's domain in storage.
 * @param {chrome.tabs.Tab} tab - The Chrome tab object.
 * @returns {Promise<void>}
 */
const toggleBypassForTab = async (tab) => {
  const host = getTabHost(tab);
  if (!host) return;

  await initWasm();
  const { domains, settings } = await getStorageData();
  const domainsJson = JSON.stringify(domains);
  const settingsJson = JSON.stringify(settings);

  // We evaluate status in complete state to see if it is currently active
  const actionObj = evaluate_tab_update("complete", host, domainsJson, settingsJson);
  const active = actionObj ? actionObj.showMenu : false;
  let updatedDomainsJson;

  try {
    if (active) {
      updatedDomainsJson = delete_domain(host, domainsJson);
    } else {
      updatedDomainsJson = add_domain(host, domainsJson);
    }

    const updatedDomains = JSON.parse(updatedDomainsJson);
    chrome.storage.sync.set({ [DOMAINS_KEY]: updatedDomains }, () => {
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

/**
 * Injects or removes bypass scripts and styles for a specific tab.
 * @param {chrome.tabs.Tab} tab - The Chrome tab object.
 * @param {boolean} enable - True to inject, false to clean up.
 * @returns {Promise<void>}
 */
const applyBypassToTab = async (tab, enable) => {
  if (!tab?.id) return;
  const tabId = tab.id;

  if (enable) {
    chrome.scripting.insertCSS({
      target: { tabId: tabId, allFrames: true },
      files: ["inject.css"]
    }).catch(() => {});

    chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      files: ["inject_isolated.js"],
      world: "ISOLATED"
    }).catch(() => {});
  } else {
    chrome.scripting.removeCSS({
      target: { tabId: tabId, allFrames: true },
      files: ["inject.css"]
    }).catch(() => {});

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

  // Evaluate action entirely in Rust
  const actionObj = evaluate_tab_update(changeInfo.status ?? "", host, domainsJson, settingsJson);
  if (!actionObj) return;

  chrome.action.setIcon({ path: actionObj.icon, tabId: tabId });
  updateContextMenu(actionObj.showMenu && !settings.hideContextMenu);

  if (actionObj.action === "inject_main") {
    chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      files: ["inject_main.js"],
      world: "MAIN",
      injectImmediately: true
    }).catch(() => {});
  } else if (actionObj.action === "inject_isolated_and_css") {
    applyBypassToTab(tab, true);
  } else if (actionObj.action === "remove_bypass") {
    applyBypassToTab(tab, false);
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
  if (info.menuItemId === CONTEXT_MENU_ID && info.selectionText && tab?.id) {
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

  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => updateTabState(tab));
  });
});

// Initial startup scan
chrome.tabs.query({}, (tabs) => {
  tabs.forEach(tab => updateTabState(tab));
});
