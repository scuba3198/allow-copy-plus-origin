(function() {
  'use strict';

  const DOMAINS_KEY = "DOMAINS_KEY";
  let allDomains = {};

  // Wait for options page content to render
  const observer = new MutationObserver((mutations, obs) => {
    const optionsContainer = document.querySelector('.options');
    if (optionsContainer) {
      obs.disconnect(); // Stop observing once found
      initWebsitesManager(optionsContainer);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  function initWebsitesManager(container) {
    const panel = document.createElement('div');
    panel.id = 'custom-websites-panel';
    panel.innerHTML = `
      <div class="panel-header">
        <h2 class="panel-title">Allowed Websites</h2>
        <span id="websites-count" class="panel-count">0</span>
      </div>
      <div class="search-wrapper">
        <input type="text" id="websites-search" class="search-input" placeholder="Search domains...">
      </div>
      <div id="websites-list" class="websites-list-container">
        <!-- Websites list items go here -->
      </div>
      <div class="add-domain-wrapper">
        <input type="text" id="add-domain-input" class="add-input" placeholder="Manually add domain (e.g. example.com)">
        <button id="add-domain-btn" class="btn btn-primary">Add</button>
      </div>
      <div class="actions-row">
        <button id="export-websites-btn" class="btn btn-outline">Export List</button>
        <button id="import-websites-btn" class="btn btn-primary">Import List</button>
        <input type="file" id="import-websites-file" style="display: none;" accept=".json">
      </div>
    `;
    container.appendChild(panel);

    setupHandlers();
    refreshWebsitesList();
  }

  function setupHandlers() {
    const searchInput = document.getElementById('websites-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        renderDomainsList(e.target.value.trim().toLowerCase());
      });
    }

    const addBtn = document.getElementById('add-domain-btn');
    const addInput = document.getElementById('add-domain-input');
    if (addBtn && addInput) {
      addBtn.addEventListener('click', () => {
        handleAddDomain(addInput.value.trim());
      });
      addInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          handleAddDomain(addInput.value.trim());
        }
      });
    }

    const exportBtn = document.getElementById('export-websites-btn');
    if (exportBtn) {
      exportBtn.addEventListener('click', handleExport);
    }

    const importBtn = document.getElementById('import-websites-btn');
    const importFile = document.getElementById('import-websites-file');
    if (importBtn && importFile) {
      importBtn.addEventListener('click', () => {
        importFile.click();
      });
      importFile.addEventListener('change', handleImportFile);
    }
  }

  function showToast(message, isSuccess = true) {
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast-notification ${isSuccess ? 'toast-success' : 'toast-error'}`;
    toast.innerText = message;
    document.body.appendChild(toast);

    // Trigger reflow for transition
    toast.getBoundingClientRect();
    toast.style.opacity = '1';

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(20px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function refreshWebsitesList() {
    chrome.storage.sync.get(DOMAINS_KEY, (result) => {
      allDomains = result[DOMAINS_KEY] || {};
      const countLabel = document.getElementById('websites-count');
      if (countLabel) {
        countLabel.innerText = Object.keys(allDomains).length;
      }
      const searchInput = document.getElementById('websites-search');
      renderDomainsList(searchInput ? searchInput.value.trim().toLowerCase() : '');
    });
  }

  function renderDomainsList(filterText = '') {
    const listContainer = document.getElementById('websites-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';
    const domains = Object.keys(allDomains).filter(d => d.includes(filterText)).sort();

    if (domains.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'empty-list-message';
      emptyMsg.innerText = filterText ? 'No matching websites found' : 'No websites allowed yet';
      listContainer.appendChild(emptyMsg);
      return;
    }

    domains.forEach(domain => {
      const item = document.createElement('div');
      item.className = 'website-item';
      
      const domainSpan = document.createElement('span');
      domainSpan.className = 'website-domain';
      domainSpan.innerText = domain;
      item.appendChild(domainSpan);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'website-delete-btn';
      deleteBtn.innerHTML = '&#x1F5D1;'; // Trash icon
      deleteBtn.title = 'Remove domain';
      deleteBtn.addEventListener('click', () => {
        handleDeleteDomain(domain);
      });
      item.appendChild(deleteBtn);

      listContainer.appendChild(item);
    });
  }

  function handleDeleteDomain(domain) {
    if (allDomains[domain]) {
      delete allDomains[domain];
      chrome.storage.sync.set({ [DOMAINS_KEY]: allDomains }, () => {
        showToast(`Removed ${domain}`);
        refreshWebsitesList();
      });
    }
  }

  function handleAddDomain(domain) {
    if (!domain) return;
    
    // Simple sanitization & scheme stripping
    let cleanDomain = domain.toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
    
    // Domain regex check
    const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/;
    if (!domainRegex.test(cleanDomain)) {
      showToast('Please enter a valid website domain name', false);
      return;
    }

    if (allDomains[cleanDomain]) {
      showToast('Domain is already added', false);
      return;
    }

    allDomains[cleanDomain] = new Date().toISOString();
    chrome.storage.sync.set({ [DOMAINS_KEY]: allDomains }, () => {
      showToast(`Added ${cleanDomain}`);
      const addInput = document.getElementById('add-domain-input');
      if (addInput) addInput.value = '';
      refreshWebsitesList();
    });
  }

  function sanitizeAndValidateDomain(domain) {
    if (typeof domain !== 'string') return null;
    const cleanDomain = domain.trim().toLowerCase().replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
    const domainRegex = /^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,}$/;
    if (domainRegex.test(cleanDomain)) {
      return cleanDomain;
    }
    return null;
  }

  function handleExport() {
    if (Object.keys(allDomains).length === 0) {
      showToast('No domains to export', false);
      return;
    }
    const dataStr = JSON.stringify(allDomains, null, 2);
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
  }

  function handleImportFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const importedDomains = {};

        if (Array.isArray(parsed)) {
          parsed.forEach(item => {
            const clean = sanitizeAndValidateDomain(item);
            if (clean) {
              importedDomains[clean] = new Date().toISOString();
            }
          });
        } else if (parsed && typeof parsed === 'object') {
          Object.keys(parsed).forEach(key => {
            const clean = sanitizeAndValidateDomain(key);
            if (clean) {
              const val = parsed[key];
              const date = (typeof val === 'string' && !isNaN(Date.parse(val))) ? val : new Date().toISOString();
              importedDomains[clean] = date;
            }
          });
        } else {
          showToast('Invalid file format. Expected JSON array or object.', false);
          return;
        }

        if (Object.keys(importedDomains).length === 0) {
          showToast('No valid domains found in the selected file', false);
          return;
        }

        showImportOptionsModal(importedDomains, file.name);
      } catch (err) {
        showToast('Failed to parse JSON file', false);
      } finally {
        e.target.value = '';
      }
    };
    reader.readAsText(file);
  }

  function showImportOptionsModal(importedDomains, fileName) {
    const existing = document.querySelector('.modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modalBox = document.createElement('div');
    modalBox.className = 'modal-box';

    const count = Object.keys(importedDomains).length;

    modalBox.innerHTML = `
      <h3 class="modal-title">Import Allowed Websites</h3>
      <p class="modal-text">
        Found <strong>${count}</strong> website(s) in <strong>${escapeHtml(fileName)}</strong>.<br><br>
        Do you want to merge these websites with your existing list, or overwrite it completely?
      </p>
      <div class="modal-actions">
        <button id="import-cancel-btn" class="btn btn-secondary">Cancel</button>
        <button id="import-overwrite-btn" class="btn btn-outline" style="border-color: #ff4444; color: #ff4444;">Overwrite List</button>
        <button id="import-merge-btn" class="btn btn-primary">Merge Lists</button>
      </div>
    `;

    overlay.appendChild(modalBox);
    document.body.appendChild(overlay);

    const cancelBtn = overlay.querySelector('#import-cancel-btn');
    const overwriteBtn = overlay.querySelector('#import-overwrite-btn');
    const mergeBtn = overlay.querySelector('#import-merge-btn');

    const closeModal = () => {
      overlay.remove();
    };

    cancelBtn.addEventListener('click', closeModal);

    // Cancel on clicking outside the modal box
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        closeModal();
      }
    });

    overwriteBtn.addEventListener('click', () => {
      chrome.storage.sync.set({ [DOMAINS_KEY]: importedDomains }, () => {
        showToast('Website list overwritten successfully');
        refreshWebsitesList();
        closeModal();
      });
    });

    mergeBtn.addEventListener('click', () => {
      const mergedDomains = { ...allDomains, ...importedDomains };
      chrome.storage.sync.set({ [DOMAINS_KEY]: mergedDomains }, () => {
        const addedCount = Object.keys(mergedDomains).length - Object.keys(allDomains).length;
        showToast(`Merged successfully. Added ${addedCount} new website(s)`);
        refreshWebsitesList();
        closeModal();
      });
    });
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
  }
})();
