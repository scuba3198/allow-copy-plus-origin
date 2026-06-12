import init, { evaluate_tab_update, add_domain, delete_domain } from './pkg/allow_copy_plus_origin.js';

const DOMAINS_KEY = "DOMAINS_KEY";
const SETTINGS_KEY = "SETTINGS_KEY";
const CONTEXT_MENU_ID = "allow-copy-context-menu";

let wasmInitialized = false;

interface TabAction {
  icon: string;
  showMenu: boolean;
  action: "inject_main" | "inject_isolated_and_css" | "remove_bypass" | "";
}

interface Settings {
  allowProtectedTextToCopy: boolean;
  hideContextMenu: boolean;
}

/**
 * Initializes the WebAssembly module if it hasn't been initialized already.
 */
const initWasm = async (): Promise<void> => {
  if (wasmInitialized) return;
  await init();
  wasmInitialized = true;
};

/**
 * Extracts the host domain name from a tab's URL.
 * @param tab - The Chrome tab object.
 * @returns The host domain name (e.g. "example.com"), or an empty string.
 */
const getTabHost = (tab: chrome.tabs.Tab | undefined): string => {
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
 * @returns Resolved settings and domains list.
 */
const getStorageData = async (): Promise<{ domains: Record<string, string>; settings: Settings }> => {
  return new Promise((resolve) => {
    chrome.storage.sync.get([DOMAINS_KEY, SETTINGS_KEY], (res) => {
      const domains = (res[DOMAINS_KEY] as Record<string, string>) ?? {};
      const settings = (res[SETTINGS_KEY] as Settings) ?? {
        allowProtectedTextToCopy: true,
        hideContextMenu: false
      };
      resolve({ domains, settings });
    });
  });
};

/**
 * Updates the visual status (active icon/context menu) of a tab based on bypass state.
 * @param tab - The Chrome tab object.
 */
const updateTabState = async (tab: chrome.tabs.Tab | undefined): Promise<void> => {
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

  const actionObj = evaluate_tab_update("complete", host, domainsJson, settingsJson) as TabAction | undefined;
  if (actionObj) {
    chrome.action.setIcon({ path: actionObj.icon, tabId: tab.id });

    const [activeTab] = await new Promise<[chrome.tabs.Tab | undefined]>(r => 
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => r([tabs[0]]))
    );
    if (activeTab?.id === tab.id) {
      updateContextMenu(actionObj.showMenu && !settings.hideContextMenu);
    }
  }
};

/**
 * Creates or removes the "Copy" context menu item.
 * @param show - True to display, false to hide.
 */
const updateContextMenu = (show: boolean): void => {
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
 * @param tab - The Chrome tab object.
 */
const toggleBypassForTab = async (tab: chrome.tabs.Tab): Promise<void> => {
  const host = getTabHost(tab);
  if (!host) return;

  await initWasm();
  const { domains, settings } = await getStorageData();
  const domainsJson = JSON.stringify(domains);
  const settingsJson = JSON.stringify(settings);

  // We evaluate status in complete state to see if it is currently active
  const actionObj = evaluate_tab_update("complete", host, domainsJson, settingsJson) as TabAction | undefined;
  const active = actionObj ? actionObj.showMenu : false;
  let updatedDomainsJson: string;

  try {
    if (active) {
      updatedDomainsJson = delete_domain(host, domainsJson);
    } else {
      updatedDomainsJson = add_domain(host, domainsJson);
    }

    const updatedDomains = JSON.parse(updatedDomainsJson) as Record<string, string>;
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
 * @param tab - The Chrome tab object.
 * @param enable - True to inject, false to clean up.
 */
const applyBypassToTab = async (tab: chrome.tabs.Tab, enable: boolean): Promise<void> => {
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
  const actionObj = evaluate_tab_update(changeInfo.status ?? "", host, domainsJson, settingsJson) as TabAction | undefined;
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
      func: (text: string) => {
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
chrome.runtime.onInstalled.addListener(async () => {
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
