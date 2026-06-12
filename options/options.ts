import init, {
  add_domain,
  delete_domain,
  import_domains,
  render_domains_list_html,
  export_domains_json
} from '../pkg/allow_copy_plus_origin.js';

const DOMAINS_KEY = "DOMAINS_KEY";
const SETTINGS_KEY = "SETTINGS_KEY";

interface Settings {
  allowProtectedTextToCopy: boolean;
  hideContextMenu: boolean;
}

let allDomains: Record<string, string> = {};
let importedData: string | null = null; // Temp storage for loaded import JSON

/**
 * Translates UI text labels using chrome.i18n API.
 */
const translateUI = (): void => {
  try {
    document.title = chrome.i18n.getMessage("settings") || "Allow Copy+ Options";
    
    const elementsToTranslate: Record<string, string> = {
      "settings-title": "settings",
      "bypass-label": "enableProtectedTextToCopyLbl",
      "bypass-desc": "enableProtectedTextToCopyDscr",
      "context-label": "showContextMenuLbl",
      "context-desc": "showContextMenuDscr"
    };

    Object.entries(elementsToTranslate).forEach(([id, messageKey]) => {
      const el = document.getElementById(id);
      if (el) {
        el.innerText = chrome.i18n.getMessage(messageKey) || el.innerText;
      }
    });

    const extTitle = document.getElementById("ext-title");
    if (extTitle) {
      extTitle.innerHTML = `Allow Copy+ <span class="accent-text">Origin</span>`;
    }

    const extDesc = document.getElementById("ext-desc-subtitle");
    if (extDesc) {
      extDesc.innerText = chrome.i18n.getMessage("ext_desc") || extDesc.innerText;
    }
  } catch (e) {}
};

/**
 * Displays a toast notification on the page.
 * @param message - Notification text.
 * @param isSuccess - True for success styling, false for error styling.
 */
const showToast = (message: string, isSuccess = true): void => {
  const existing = document.querySelector('.toast-notification');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast-notification ${isSuccess ? 'toast-success' : 'toast-error'}`;
  toast.innerText = message;
  document.body.appendChild(toast);

  toast.getBoundingClientRect();
  toast.style.opacity = '1';

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
};

/**
 * Refreshes the allowed domains list from storage.
 */
const refreshWebsitesList = (): void => {
  chrome.storage.sync.get(DOMAINS_KEY, (result) => {
    allDomains = (result[DOMAINS_KEY] as Record<string, string>) || {};
    const countLabel = document.getElementById('websites-count');
    if (countLabel) {
      countLabel.innerText = String(Object.keys(allDomains).length);
    }
    const searchInput = document.getElementById('websites-search') as HTMLInputElement | null;
    renderDomainsList(searchInput ? searchInput.value.trim().toLowerCase() : '');
  });
};

/**
 * Renders the domain list UI using Rust Wasm HTML generator.
 * @param filterText - Search query to filter list.
 */
const renderDomainsList = (filterText = ''): void => {
  const listContainer = document.getElementById('websites-list');
  if (!listContainer) return;
  
  const currentJson = JSON.stringify(allDomains);
  listContainer.innerHTML = render_domains_list_html(currentJson, filterText);
};

/**
 * Deletes a domain from the allowed list, communicating with Rust Wasm.
 * @param domain - Domain to delete.
 */
const handleDeleteDomain = async (domain: string): Promise<void> => {
  const currentJson = JSON.stringify(allDomains);
  try {
    const updatedJson = delete_domain(domain, currentJson);
    const updatedDomains = JSON.parse(updatedJson) as Record<string, string>;

    chrome.storage.sync.set({ [DOMAINS_KEY]: updatedDomains }, () => {
      showToast(`Removed ${domain}`);
      refreshWebsitesList();
    });
  } catch (err: any) {
    showToast(err.toString(), false);
  }
};

/**
 * Adds a domain manually to the allowed list, communicating with Rust Wasm.
 */
const handleAddDomain = async (): Promise<void> => {
  const addInput = document.getElementById('add-domain-input') as HTMLInputElement | null;
  if (!addInput) return;

  const domain = addInput.value.trim();
  if (!domain) return;

  const currentJson = JSON.stringify(allDomains);
  try {
    const updatedJson = add_domain(domain, currentJson);
    const updatedDomains = JSON.parse(updatedJson) as Record<string, string>;

    chrome.storage.sync.set({ [DOMAINS_KEY]: updatedDomains }, () => {
      showToast(`Added ${domain}`);
      addInput.value = '';
      refreshWebsitesList();
    });
  } catch (err: any) {
    showToast(err.toString(), false);
  }
};

/**
 * Exports the allowed domains list to a local JSON file.
 */
const handleExport = (): void => {
  if (Object.keys(allDomains).length === 0) {
    showToast('No domains to export', false);
    return;
  }
  const currentJson = JSON.stringify(allDomains);
  const dataStr = export_domains_json(currentJson);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'allow-copy-websites.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Domains exported successfully');
};

/**
 * Handles JSON file loading for imports.
 */
const handleImportFile = (e: Event): void => {
  const target = e.target as HTMLInputElement | null;
  const file = target?.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const result = event.target?.result;
      if (typeof result !== 'string') return;
      
      const parsed = JSON.parse(result) as unknown;
      let count = 0;

      if (Array.isArray(parsed)) {
        count = parsed.length;
      } else if (parsed && typeof parsed === 'object') {
        count = Object.keys(parsed).length;
      } else {
        showToast('Invalid file format. Expected JSON array or object.', false);
        return;
      }

      if (count === 0) {
        showToast('No valid domains found in the selected file', false);
        return;
      }

      importedData = result;
      showImportModal(count, file.name);
    } catch (err) {
      showToast('Failed to parse JSON file', false);
    } finally {
      if (target) {
        target.value = '';
      }
    }
  };
  reader.readAsText(file);
};

const showImportModal = (count: number, fileName: string): void => {
  const modal = document.getElementById("import-modal");
  const countEl = document.getElementById("import-count");
  const fileNameEl = document.getElementById("import-filename");

  if (countEl) countEl.innerText = String(count);
  if (fileNameEl) fileNameEl.innerText = fileName;
  if (modal) modal.classList.remove("hidden");
};

const closeModal = (): void => {
  const modal = document.getElementById("import-modal");
  if (modal) modal.classList.add("hidden");
  importedData = null;
};

/**
 * Submits the import operation using Rust Wasm.
 * @param mode - "merge" or "overwrite".
 */
const processImport = async (mode: 'merge' | 'overwrite'): Promise<void> => {
  if (!importedData) return;

  const currentJson = JSON.stringify(allDomains);
  try {
    const updatedJson = import_domains(importedData, currentJson, mode);
    const updatedDomains = JSON.parse(updatedJson) as Record<string, string>;

    chrome.storage.sync.set({ [DOMAINS_KEY]: updatedDomains }, () => {
      showToast(mode === 'overwrite' ? 'Website list overwritten successfully' : 'Merged lists successfully');
      closeModal();
      refreshWebsitesList();
    });
  } catch (err: any) {
    showToast(err.toString(), false);
    closeModal();
  }
};

/**
 * Saves setting toggles back to chrome.storage.
 * @param key - Configuration property name.
 * @param value - Configured status.
 */
const updateSettings = (key: keyof Settings, value: boolean): void => {
  chrome.storage.sync.get([SETTINGS_KEY], (res) => {
    const settings = (res[SETTINGS_KEY] as Settings) || {
      allowProtectedTextToCopy: true,
      hideContextMenu: false
    };

    settings[key] = value;
    chrome.storage.sync.set({ [SETTINGS_KEY]: settings }, () => {
      showToast(chrome.i18n.getMessage("successSaveMsg") || "Settings saved successfully");
    });
  });
};

/**
 * Binds DOM triggers to interactive methods.
 */
const setupHandlers = (): void => {
  // Website list search
  document.getElementById('websites-search')?.addEventListener('input', (e) => {
    const target = e.target as HTMLInputElement;
    renderDomainsList(target.value.trim().toLowerCase());
  });

  // Dynamic event delegation on website list to catch delete button clicks
  document.getElementById('websites-list')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    
    const deleteBtn = target.closest('.website-delete-btn');
    if (deleteBtn) {
      const domain = deleteBtn.getAttribute('data-domain');
      if (domain) {
        handleDeleteDomain(domain).catch(console.error);
      }
    }
  });

  const addBtn = document.getElementById('add-domain-btn');
  const addInput = document.getElementById('add-domain-input') as HTMLInputElement | null;
  if (addBtn && addInput) {
    addBtn.addEventListener('click', () => {
      handleAddDomain().catch(console.error);
    });
    addInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleAddDomain().catch(console.error);
      }
    });
  }

  document.getElementById('export-websites-btn')?.addEventListener('click', handleExport);

  const importBtn = document.getElementById('import-websites-btn');
  const importFile = document.getElementById('import-websites-file') as HTMLInputElement | null;
  if (importBtn && importFile) {
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', handleImportFile);
  }

  // Modal actions listeners
  document.getElementById("import-cancel-btn")?.addEventListener("click", closeModal);
  document.getElementById("import-overwrite-btn")?.addEventListener("click", () => {
    processImport("overwrite").catch(console.error);
  });
  document.getElementById("import-merge-btn")?.addEventListener("click", () => {
    processImport("merge").catch(console.error);
  });
};

/**
 * Initializes Options Page.
 */
const initOptions = async (): Promise<void> => {
  await init(); // Initialize Rust Wasm
  translateUI();

  // Load settings configurations
  chrome.storage.sync.get([SETTINGS_KEY], (res) => {
    const settings = (res[SETTINGS_KEY] as Settings) || {
      allowProtectedTextToCopy: true,
      hideContextMenu: false
    };

    const toggleBypass = document.getElementById("toggle-bypass") as HTMLInputElement | null;
    const toggleContext = document.getElementById("toggle-context") as HTMLInputElement | null;

    if (toggleBypass) {
      toggleBypass.checked = settings.allowProtectedTextToCopy;
      toggleBypass.addEventListener("change", (e) => {
        const target = e.target as HTMLInputElement;
        updateSettings("allowProtectedTextToCopy", target.checked);
      });
    }

    if (toggleContext) {
      toggleContext.checked = !settings.hideContextMenu;
      toggleContext.addEventListener("change", (e) => {
        const target = e.target as HTMLInputElement;
        updateSettings("hideContextMenu", !target.checked);
      });
    }
  });

  setupHandlers();
  refreshWebsitesList();
};

document.addEventListener("DOMContentLoaded", () => {
  initOptions().catch(console.error);
});
