# Allowed Websites Import/Export Feature Design

## Overview
This feature introduces the ability for users of **Allow Copy+ Origin** to manage, import, and export the websites they have enabled copy/paste restriction bypasses on directly from the Options page.

## Requirements & Constraints
- **Offline & Local-Only**: Must run completely locally without sending any data to external servers, adhering to the sanitized nature of the extension.
- **Robust Storage**: Modify and interact with `chrome.storage.sync` under the key `DOMAINS_KEY`.
- **UI Customization**: Inject the management panel dynamically into the existing React options page layout without modifying the bundled React source code, preventing compatibility or build breakage.
- **Format Support**: Support importing both list arrays (`["site.com"]`) and timestamp objects (`{"site.com": "timestamp"}`).

## Design Specification

### 1. Options Page Injection
We will inject a script `options/custom.js` and a stylesheet `options/custom.css` into `options/index.html`.
The script will use a `MutationObserver` to watch for the `.options` container to be rendered. Once it exists, the script will append the websites management panel container `#custom-websites-panel` directly after it.

### 2. User Interface Layout
The management panel will contain:
- **Header**: "Allowed Websites" with a count badge.
- **Search Bar**: An input field to filter the listed domains.
- **List Container**: A scrollable box (`max-height: 250px`) containing the list of allowed domains. Each domain item will feature:
  - The domain name string.
  - A red trash/delete icon displayed on hover.
- **Add Manual Domain**: A row containing a text input and a button to manually add a domain to the bypass list.
- **Action Buttons**:
  - **Export JSON**: Triggers a browser download of the domain list as a JSON file.
  - **Import JSON**: Triggers a file picker to select a JSON file.

### 3. Import Dialogue / Choice Modal
When a file is loaded for import, a modal overlay will appear:
- Title: "Import Websites"
- Question: "How would you like to import the websites from '<filename>'?"
- Actions:
  - **Merge**: Merges the imported domains with the existing list (preserving existing ones).
  - **Overwrite**: Replaces the existing list entirely with the imported ones.
  - **Cancel**: Aborts the import.

### 4. Validation
Before saving any imported data:
- Ensure the file is valid JSON.
- Verify it is either an array of strings or a key-value object.
- Validate that each entry is a well-formed hostname/domain name (e.g. alphanumeric characters, hyphens, and dots).
- Strip any trailing/leading whitespace or protocol schemes (like `http://` or `https://`).

### 5. Styles (Integration with Dark Mode)
The styling will use standard CSS variables declared in the extension's original CSS:
- `--black-lighter` for panel container background.
- `--text` for font color.
- `--yellow` and `--yellow-light` for primary buttons and borders.
- Custom premium styling (glassmorphism/subtle transitions) to match a highly polished UI.
