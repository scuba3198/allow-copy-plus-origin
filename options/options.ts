// TypeScript options page controller for Allow Copy+ Origin

export {};

const DOMAINS_KEY = "DOMAINS_KEY";
const SETTINGS_KEY = "SETTINGS_KEY";

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

let allDomains: Record<string, string> = {};
let currentSettings: ExtensionSettings = { ...DEFAULT_SETTINGS };

// UI Elements
const contextMenuToggle = document.getElementById("context-menu-toggle") as HTMLInputElement;
const searchInput = document.getElementById("websites-search") as HTMLInputElement;
const addInput = document.getElementById("add-domain-input") as HTMLInputElement;
const addBtn = document.getElementById("add-domain-btn") as HTMLButtonElement;
const exportBtn = document.getElementById("export-websites-btn") as HTMLButtonElement;
const importBtn = document.getElementById("import-websites-btn") as HTMLButtonElement;
const importFile = document.getElementById("import-websites-file") as HTMLInputElement;
const websitesList = document.getElementById("websites-list") as HTMLDivElement;
const websitesCount = document.getElementById("websites-count") as HTMLSpanElement;

// Modal elements
const importModal = document.getElementById("import-modal") as HTMLDivElement;
const modalTextContent = document.getElementById("modal-text-content") as HTMLParagraphElement;
const importCancelBtn = document.getElementById("import-cancel-btn") as HTMLButtonElement;
const importOverwriteBtn = document.getElementById("import-overwrite-btn") as HTMLButtonElement;
const importMergeBtn = document.getElementById("import-merge-btn") as HTMLButtonElement;

// Toast notification
function showToast(message: string, isSuccess = true) {
  const existing = document.querySelector(".toast-notification");
  if (existing) existing.remove();

  const toast = document.createElement("div");
  toast.className = `toast-notification ${isSuccess ? "toast-success" : "toast-error"}`;
  toast.innerText = message;
  document.body.appendChild(toast);

  // Trigger reflow for animation
  toast.getBoundingClientRect();
  toast.style.opacity = "1";

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(20px)";
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// HTML Escaping helper
function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
}

// Load configurations from storage
async function loadConfig() {
  // Load Settings
  const settingsStorage = await chrome.storage.sync.get(SETTINGS_KEY);
  currentSettings = settingsStorage[SETTINGS_KEY] || { ...DEFAULT_SETTINGS };
  
  contextMenuToggle.checked = currentSettings.hideContextMenu;

  // Load Domains
  const domainsStorage = await chrome.storage.sync.get(DOMAINS_KEY);
  allDomains = domainsStorage[DOMAINS_KEY] || {};

  updateCountAndList();
}

function updateCountAndList() {
  const count = Object.keys(allDomains).length;
  websitesCount.innerText = String(count);
  renderDomainsList(searchInput.value.trim().toLowerCase());
}

// Sync settings back to Chrome storage
async function saveSettings() {
  currentSettings.hideContextMenu = contextMenuToggle.checked;
  await chrome.storage.sync.set({ [SETTINGS_KEY]: currentSettings });
  showToast("Settings saved successfully.");
}

// Render domains in Allowed list
function renderDomainsList(filterText = "") {
  websitesList.innerHTML = "";
  const domains = Object.keys(allDomains).filter(d => d.includes(filterText)).sort();

  if (domains.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.className = "empty-list-message";
    emptyMsg.innerText = filterText ? "No matching websites found." : "No websites bypassed yet.";
    websitesList.appendChild(emptyMsg);
    return;
  }

  domains.forEach(domain => {
    const item = document.createElement("div");
    item.className = "website-item";

    const domainSpan = document.createElement("span");
    domainSpan.className = "website-domain";
    domainSpan.innerText = domain;
    item.appendChild(domainSpan);

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "website-delete-btn";
    deleteBtn.innerHTML = "&#x1F5D1;"; // Trash bin emoji
    deleteBtn.title = `Remove ${domain}`;
    deleteBtn.addEventListener("click", () => handleDeleteDomain(domain));
    
    item.appendChild(deleteBtn);
    websitesList.appendChild(item);
  });
}

// Delete domain
async function handleDeleteDomain(domain: string) {
  if (allDomains[domain]) {
    delete allDomains[domain];
    await chrome.storage.sync.set({ [DOMAINS_KEY]: allDomains });
    showToast(`Removed ${domain}`);
    updateCountAndList();
  }
}

// Add domain manual handler
async function handleAddDomain(domain: string) {
  if (!domain) return;

  // Strip scheme and format
  const hostPart = domain.toLowerCase().replace(/^(https?:\/\/)?/, "").split("/")[0];
  if (!hostPart) return;
  const cleanDomain = hostPart.trim();

  // Basic domain regex validation
  const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/;
  if (!domainRegex.test(cleanDomain)) {
    showToast("Please enter a valid website domain name.", false);
    return;
  }

  if (allDomains[cleanDomain]) {
    showToast("Domain is already in the list.", false);
    return;
  }

  allDomains[cleanDomain] = new Date().toISOString();
  await chrome.storage.sync.set({ [DOMAINS_KEY]: allDomains });
  showToast(`Added ${cleanDomain}`);
  addInput.value = "";
  updateCountAndList();
}

// Export domains list
function handleExport() {
  if (Object.keys(allDomains).length === 0) {
    showToast("No domains to export.", false);
    return;
  }
  const dataStr = JSON.stringify(allDomains, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = "allow-copy-websites-origin.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast("Domains exported successfully.");
}

// Validate domain structure during JSON imports
function sanitizeAndValidateDomain(domain: unknown): string | null {
  if (typeof domain !== "string") return null;
  const hostPart = domain.trim().toLowerCase().replace(/^(https?:\/\/)?/, "").split("/")[0];
  if (!hostPart) return null;
  const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/;
  if (domainRegex.test(hostPart)) {
    return hostPart;
  }
  return null;
}

// Import JSON file parsing
function handleImportFile(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target?.result as string);
      const importedDomains: Record<string, string> = {};

      if (Array.isArray(parsed)) {
        parsed.forEach(item => {
          const clean = sanitizeAndValidateDomain(item);
          if (clean) {
            importedDomains[clean] = new Date().toISOString();
          }
        });
      } else if (parsed && typeof parsed === "object") {
        Object.keys(parsed).forEach(key => {
          const clean = sanitizeAndValidateDomain(key);
          if (clean) {
            const val = parsed[key];
            const date = (typeof val === "string" && !isNaN(Date.parse(val))) ? val : new Date().toISOString();
            importedDomains[clean] = date;
          }
        });
      } else {
        showToast("Invalid format. Expected JSON list array or key-value object.", false);
        return;
      }

      const count = Object.keys(importedDomains).length;
      if (count === 0) {
        showToast("No valid domains detected in JSON.", false);
        return;
      }

      showImportModal(importedDomains, file.name);
    } catch (err) {
      showToast("Failed to parse JSON file.", false);
    } finally {
      target.value = "";
    }
  };
  reader.readAsText(file);
}

// Show Choice Modal
let tempImportDomains: Record<string, string> = {};

function showImportModal(domains: Record<string, string>, fileName: string) {
  tempImportDomains = domains;
  const count = Object.keys(domains).length;
  modalTextContent.innerHTML = `Found <strong>${count}</strong> website(s) in <strong>${escapeHtml(fileName)}</strong>.<br><br>Do you want to merge these websites with your existing list, or overwrite it completely?`;
  importModal.style.display = "flex";
}

function hideImportModal() {
  importModal.style.display = "none";
  tempImportDomains = {};
}

// Setup Event Handlers
function setupEventListeners() {
  contextMenuToggle.addEventListener("change", saveSettings);

  searchInput.addEventListener("input", () => {
    renderDomainsList(searchInput.value.trim().toLowerCase());
  });

  addBtn.addEventListener("click", () => handleAddDomain(addInput.value.trim()));
  addInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      handleAddDomain(addInput.value.trim());
    }
  });

  exportBtn.addEventListener("click", handleExport);
  importBtn.addEventListener("click", () => importFile.click());
  importFile.addEventListener("change", handleImportFile);

  // Modal actions
  importCancelBtn.addEventListener("click", hideImportModal);
  
  importOverwriteBtn.addEventListener("click", async () => {
    allDomains = { ...tempImportDomains };
    await chrome.storage.sync.set({ [DOMAINS_KEY]: allDomains });
    showToast("Website list overwritten successfully.");
    updateCountAndList();
    hideImportModal();
  });

  importMergeBtn.addEventListener("click", async () => {
    const previousCount = Object.keys(allDomains).length;
    allDomains = { ...allDomains, ...tempImportDomains };
    await chrome.storage.sync.set({ [DOMAINS_KEY]: allDomains });
    const addedCount = Object.keys(allDomains).length - previousCount;
    showToast(`Merged lists successfully. Added ${addedCount} domain(s).`);
    updateCountAndList();
    hideImportModal();
  });

  // Close modal when clicking on overlay background
  importModal.addEventListener("click", (e) => {
    if (e.target === importModal) {
      hideImportModal();
    }
  });
}

// Initialize options script
document.addEventListener("DOMContentLoaded", () => {
  loadConfig();
  setupEventListeners();
});
