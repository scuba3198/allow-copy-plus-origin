(function() {
  'use strict';

  const DOMAINS_KEY = "DOMAINS_KEY";

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
    // Event listeners setup will go here
  }

  function refreshWebsitesList() {
    // List loading logic will go here
  }
})();
