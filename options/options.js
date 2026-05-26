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
})();
