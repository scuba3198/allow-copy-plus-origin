import init, {
  add_domain,
  delete_domain,
  import_domains,
  render_domains_list_html,
  export_domains_json
} from '../pkg/allow_copy_plus_origin.js';

const DOMAINS_KEY = "DOMAINS_KEY";
const SETTINGS_KEY = "SETTINGS_KEY";

let allDomains = {};
let importedData = null; // Temp storage for loaded import JSON

/**
 * Translates UI text labels using chrome.i18n API.
 */
const translateUI = () => {
  try {
    document.title = chrome.i18n.getMessage("settings") || "Allow Copy+ Options";
    
    const elementsToTranslate = {
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
 * @param {string} message - Notification text.
 * @param {boolean} isSuccess - True for success styling, false for error styling.
 */
const showToast = (message, isSuccess = true) => {
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
const refreshWebsitesList = () => {
  chrome.storage.sync.get(DOMAINS_KEY, (result) => {
    allDomains = result[DOMAINS_KEY] || {};
    const countLabel = document.getElementById('websites-count');
    if (countLabel) {
      countLabel.innerText = Object.keys(allDomains).length;
    }
    const searchInput = document.getElementById('websites-search');
    renderDomainsList(searchInput ? searchInput.value.trim().toLowerCase() : '');
  });
};

/**
 * Renders the domain list UI using Rust Wasm HTML generator.
 * @param {string} filterText - Search query to filter list.
 */
const renderDomainsList = (filterText = '') => {
  const listContainer = document.getElementById('websites-list');
  if (!listContainer) return;
  
  const currentJson = JSON.stringify(allDomains);
  listContainer.innerHTML = render_domains_list_html(currentJson, filterText);
};

/**
 * Deletes a domain from the allowed list, communicating with Rust Wasm.
 * @param {string} domain - Domain to delete.
 */
const handleDeleteDomain = async (domain) => {
  const currentJson = JSON.stringify(allDomains);
  try {
    const updatedJson = delete_domain(domain, currentJson);
    const updatedDomains = JSON.parse(updatedJson);

    chrome.storage.sync.set({ [DOMAINS_KEY]: updatedDomains }, () => {
      showToast(`Removed ${domain}`);
      refreshWebsitesList();
    });
  } catch (err) {
    showToast(err.toString(), false);
  }
};

/**
 * Adds a domain manually to the allowed list, communicating with Rust Wasm.
 */
const handleAddDomain = async () => {
  const addInput = document.getElementById('add-domain-input');
  if (!addInput) return;

  const domain = addInput.value.trim();
  if (!domain) return;

  const currentJson = JSON.stringify(allDomains);
  try {
    const updatedJson = add_domain(domain, currentJson);
    const updatedDomains = JSON.parse(updatedJson);

    chrome.storage.sync.set({ [DOMAINS_KEY]: updatedDomains }, () => {
      showToast(`Added ${domain}`);
      addInput.value = '';
      refreshWebsitesList();
    });
  } catch (err) {
    showToast(err.toString(), false);
  }
};

/**
 * Exports the allowed domains list to a local JSON file.
 */
const handleExport = () => {
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
const handleImportFile = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
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

      importedData = event.target.result;
      showImportModal(count, file.name);
    } catch (err) {
      showToast('Failed to parse JSON file', false);
    } finally {
      e.target.value = '';
    }
  };
  reader.readAsText(file);
};

const showImportModal = (count, fileName) => {
  const modal = document.getElementById("import-modal");
  document.getElementById("import-count").innerText = count;
  document.getElementById("import-filename").innerText = fileName;
  modal.classList.remove("hidden");
};

const closeModal = () => {
  document.getElementById("import-modal").classList.add("hidden");
  importedData = null;
};

/**
 * Submits the import operation using Rust Wasm.
 * @param {string} mode - "merge" or "overwrite".
 */
const processImport = async (mode) => {
  if (!importedData) return;

  const currentJson = JSON.stringify(allDomains);
  try {
    const updatedJson = import_domains(importedData, currentJson, mode);
    const updatedDomains = JSON.parse(updatedJson);

    chrome.storage.sync.set({ [DOMAINS_KEY]: updatedDomains }, () => {
      showToast(mode === 'overwrite' ? 'Website list overwritten successfully' : 'Merged lists successfully');
      closeModal();
      refreshWebsitesList();
    });
  } catch (err) {
    showToast(err.toString(), false);
    closeModal();
  }
};

/**
 * Saves setting toggles back to chrome.storage.
 * @param {string} key - Configuration property name.
 * @param {boolean} value - Configured status.
 */
const updateSettings = (key, value) => {
  chrome.storage.sync.get([SETTINGS_KEY], (res) => {
    const settings = res[SETTINGS_KEY] || {
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
const setupHandlers = () => {
  // Website list search
  document.getElementById('websites-search')?.addEventListener('input', (e) => {
    renderDomainsList(e.target.value.trim().toLowerCase());
  });

  // Dynamic event delegation on website list to catch delete button clicks
  document.getElementById('websites-list')?.addEventListener('click', (e) => {
    const deleteBtn = e.target.closest('.website-delete-btn');
    if (deleteBtn) {
      const domain = deleteBtn.getAttribute('data-domain');
      if (domain) {
        handleDeleteDomain(domain);
      }
    }
  });

  const addBtn = document.getElementById('add-domain-btn');
  const addInput = document.getElementById('add-domain-input');
  if (addBtn && addInput) {
    addBtn.addEventListener('click', handleAddDomain);
    addInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleAddDomain();
    });
  }

  document.getElementById('export-websites-btn')?.addEventListener('click', handleExport);

  const importBtn = document.getElementById('import-websites-btn');
  const importFile = document.getElementById('import-websites-file');
  if (importBtn && importFile) {
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', handleImportFile);
  }

  // Modal actions listeners
  document.getElementById("import-cancel-btn").addEventListener("click", closeModal);
  document.getElementById("import-overwrite-btn").addEventListener("click", () => processImport("overwrite"));
  document.getElementById("import-merge-btn").addEventListener("click", () => processImport("merge"));
};

/**
 * Initializes Options Page.
 */
const initOptions = async () => {
  await init(); // Initialize Rust Wasm
  translateUI();

  // Load settings configurations
  chrome.storage.sync.get([SETTINGS_KEY], (res) => {
    const settings = res[SETTINGS_KEY] || {
      allowProtectedTextToCopy: true,
      hideContextMenu: false
    };

    const toggleBypass = document.getElementById("toggle-bypass");
    const toggleContext = document.getElementById("toggle-context");

    if (toggleBypass) {
      toggleBypass.checked = settings.allowProtectedTextToCopy;
      toggleBypass.addEventListener("change", (e) => {
        updateSettings("allowProtectedTextToCopy", e.target.checked);
      });
    }

    if (toggleContext) {
      toggleContext.checked = !settings.hideContextMenu;
      toggleContext.addEventListener("change", (e) => {
        updateSettings("hideContextMenu", !e.target.checked);
      });
    }
  });

  setupHandlers();
  refreshWebsitesList();
};

document.addEventListener("DOMContentLoaded", initOptions);
