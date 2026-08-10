// options/options.ts
var DOMAINS_KEY = "DOMAINS_KEY";
var SETTINGS_KEY = "SETTINGS_KEY";
var DEFAULT_SETTINGS = {
  showSupportIcon: false,
  showDetectTextOverlay: false,
  hideContextMenu: false
};
var hostPermission = (domain) => `*://${domain}/*`;
async function requestDomainAccess(domains) {
  const origins = [...new Set(domains)].map(hostPermission);
  if (origins.length === 0) return true;
  if (!await chrome.permissions.request({ origins })) return false;
  const granted = await Promise.all(origins.map((origin) => chrome.permissions.contains({ origins: [origin] })));
  return granted.every(Boolean);
}
async function disableDomain(domain) {
  const response = await chrome.runtime.sendMessage({ type: "DisableDomain", domain });
  return response?.success === true;
}
var allDomains = {};
var currentSettings = { ...DEFAULT_SETTINGS };
var contextMenuToggle = document.getElementById("context-menu-toggle");
var searchInput = document.getElementById("websites-search");
var addInput = document.getElementById("add-domain-input");
var addBtn = document.getElementById("add-domain-btn");
var exportBtn = document.getElementById("export-websites-btn");
var importBtn = document.getElementById("import-websites-btn");
var importFile = document.getElementById("import-websites-file");
var websitesList = document.getElementById("websites-list");
var websitesCount = document.getElementById("websites-count");
var importModal = document.getElementById("import-modal");
var modalTextContent = document.getElementById("modal-text-content");
var importCancelBtn = document.getElementById("import-cancel-btn");
var importOverwriteBtn = document.getElementById("import-overwrite-btn");
var importMergeBtn = document.getElementById("import-merge-btn");
function showToast(message, isSuccess = true) {
  const existing = document.querySelector(".toast-notification");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = `toast-notification ${isSuccess ? "toast-success" : "toast-error"}`;
  toast.innerText = message;
  document.body.appendChild(toast);
  toast.getBoundingClientRect();
  toast.style.opacity = "1";
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(20px)";
    setTimeout(() => toast.remove(), 300);
  }, 3e3);
}
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
async function loadConfig() {
  const settingsStorage = await chrome.storage.local.get(SETTINGS_KEY);
  currentSettings = settingsStorage[SETTINGS_KEY] || { ...DEFAULT_SETTINGS };
  contextMenuToggle.checked = currentSettings.hideContextMenu;
  const domainsStorage = await chrome.storage.local.get(DOMAINS_KEY);
  allDomains = domainsStorage[DOMAINS_KEY] || {};
  updateCountAndList();
}
function updateCountAndList() {
  const count = Object.keys(allDomains).length;
  websitesCount.innerText = String(count);
  renderDomainsList(searchInput.value.trim().toLowerCase());
}
async function saveSettings() {
  currentSettings.hideContextMenu = contextMenuToggle.checked;
  await chrome.storage.local.set({ [SETTINGS_KEY]: currentSettings });
  showToast("Settings saved successfully.");
}
function renderDomainsList(filterText = "") {
  websitesList.innerHTML = "";
  const domains = Object.keys(allDomains).filter((d) => d.includes(filterText)).sort();
  if (domains.length === 0) {
    const emptyMsg = document.createElement("div");
    emptyMsg.className = "empty-list-message";
    emptyMsg.innerText = filterText ? "No matching websites found." : "No websites bypassed yet.";
    websitesList.appendChild(emptyMsg);
    return;
  }
  domains.forEach((domain) => {
    const item = document.createElement("div");
    item.className = "website-item";
    const domainSpan = document.createElement("span");
    domainSpan.className = "website-domain";
    domainSpan.innerText = domain;
    item.appendChild(domainSpan);
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "website-delete-btn";
    deleteBtn.innerHTML = "&#x1F5D1;";
    deleteBtn.title = `Remove ${domain}`;
    deleteBtn.addEventListener("click", () => handleDeleteDomain(domain));
    item.appendChild(deleteBtn);
    websitesList.appendChild(item);
  });
}
async function handleDeleteDomain(domain) {
  if (allDomains[domain]) {
    if (!await disableDomain(domain)) {
      showToast(`Could not remove access for ${domain}.`, false);
      return;
    }
    const nextDomains = { ...allDomains };
    delete nextDomains[domain];
    allDomains = nextDomains;
    await chrome.storage.local.set({ [DOMAINS_KEY]: nextDomains });
    showToast(`Removed ${domain}`);
    updateCountAndList();
  }
}
async function handleAddDomain(domain) {
  if (!domain) return;
  const hostPart = domain.toLowerCase().replace(/^(https?:\/\/)?/, "").split("/")[0];
  if (!hostPart) return;
  const cleanDomain = hostPart.trim();
  const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/;
  if (!domainRegex.test(cleanDomain)) {
    showToast("Please enter a valid website domain name.", false);
    return;
  }
  if (allDomains[cleanDomain]) {
    showToast("Domain is already in the list.", false);
    return;
  }
  if (!await requestDomainAccess([cleanDomain])) {
    showToast("Site access is required to enable this domain.", false);
    return;
  }
  allDomains = { ...allDomains, [cleanDomain]: (/* @__PURE__ */ new Date()).toISOString() };
  await chrome.storage.local.set({ [DOMAINS_KEY]: allDomains });
  showToast(`Added ${cleanDomain}`);
  addInput.value = "";
  updateCountAndList();
}
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
function sanitizeAndValidateDomain(domain) {
  if (typeof domain !== "string") return null;
  const hostPart = domain.trim().toLowerCase().replace(/^(https?:\/\/)?/, "").split("/")[0];
  if (!hostPart) return null;
  const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/;
  if (domainRegex.test(hostPart)) {
    return hostPart;
  }
  return null;
}
function handleImportFile(e) {
  const target = e.target;
  const file = target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target?.result);
      const importedDomains = {};
      if (Array.isArray(parsed)) {
        parsed.forEach((item) => {
          const clean = sanitizeAndValidateDomain(item);
          if (clean) {
            importedDomains[clean] = (/* @__PURE__ */ new Date()).toISOString();
          }
        });
      } else if (parsed && typeof parsed === "object") {
        Object.keys(parsed).forEach((key) => {
          const clean = sanitizeAndValidateDomain(key);
          if (clean) {
            const val = parsed[key];
            const date = typeof val === "string" && !isNaN(Date.parse(val)) ? val : (/* @__PURE__ */ new Date()).toISOString();
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
var tempImportDomains = {};
function showImportModal(domains, fileName) {
  tempImportDomains = domains;
  const count = Object.keys(domains).length;
  modalTextContent.innerHTML = `Found <strong>${count}</strong> website(s) in <strong>${escapeHtml(fileName)}</strong>.<br><br>Do you want to merge these websites with your existing list, or overwrite it completely?`;
  importModal.style.display = "flex";
}
function hideImportModal() {
  importModal.style.display = "none";
  tempImportDomains = {};
}
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
  importCancelBtn.addEventListener("click", hideImportModal);
  importOverwriteBtn.addEventListener("click", async () => {
    const importedDomains = { ...tempImportDomains };
    if (!await requestDomainAccess(Object.keys(importedDomains))) {
      showToast("Site access was not granted; list unchanged.", false);
      return;
    }
    const nextDomains = { ...importedDomains };
    for (const domain of Object.keys(allDomains)) {
      if (!importedDomains[domain] && !await disableDomain(domain)) {
        const timestamp = allDomains[domain];
        if (timestamp) nextDomains[domain] = timestamp;
      }
    }
    allDomains = nextDomains;
    await chrome.storage.local.set({ [DOMAINS_KEY]: nextDomains });
    showToast("Website list overwritten successfully.");
    updateCountAndList();
    hideImportModal();
  });
  importMergeBtn.addEventListener("click", async () => {
    const previousCount = Object.keys(allDomains).length;
    if (!await requestDomainAccess(Object.keys(tempImportDomains))) {
      showToast("Site access was not granted; list unchanged.", false);
      return;
    }
    allDomains = { ...allDomains, ...tempImportDomains };
    await chrome.storage.local.set({ [DOMAINS_KEY]: allDomains });
    const addedCount = Object.keys(allDomains).length - previousCount;
    showToast(`Merged lists successfully. Added ${addedCount} domain(s).`);
    updateCountAndList();
    hideImportModal();
  });
  importModal.addEventListener("click", (e) => {
    if (e.target === importModal) {
      hideImportModal();
    }
  });
}
document.addEventListener("DOMContentLoaded", () => {
  loadConfig();
  setupEventListeners();
});
