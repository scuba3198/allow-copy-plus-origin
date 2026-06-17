# <img src="images/48.png" width="38" height="38" align="center" alt="Logo" /> Allow Copy+ Origin

A privacy-first, ultra-lightweight, and fully sanitized fork of the "Allow Copy +" extension, rewritten in type-safe TypeScript.

## What is this?

This is a hardened, open-source version of the popular "Allow Copy +" extension. While the original tool is excellent at bypassing copy restrictions on websites, it contained telemetry tracking, promotional ads, and external dependencies. 

**Allow Copy+ Origin** removes all bloat, keeps processing strictly offline, and updates the core engine in TypeScript.

> [!NOTE]
> All network dependency endpoints have been completely removed or redirected to `127.0.0.1`. The extension operates strictly locally using `chrome.storage.sync`.

---

## Key Sanitization Features

* **Zero Network Dependency:** Neutralized OCR (image text extraction) and telemetry modules.
* **No Promotion:** Removed all injected promotional banners, holiday popups, and cross-promotion items.
* **No Redirects:** Stripped intrusive welcome, donation, and uninstall surveys.
* **Strict Privacy:** All domain configurations are persisted locally.

## Enhancements in Origin Version

* **TypeScript Migration:** Source code is fully audited and type-safe under strict compiler controls.
* **Paste Protection Bypass:** Intercepts input actions and leverages `requestAnimationFrame` to prevent sites from instantly reverting pasted text.
* **Selection Visibility Fix:** Overrides CSS styles that attempt to hide text highlights.
* **Overlay clickthroughs:** Automatically resolves Squarespace and typical right-click overlay blocker elements.
* **Context Menu Copy:** Direct selection copy actions via the custom context menu.

---

## Installation (Unpacked Developer Mode)

1. Clone or download this repository.
2. Open your Chromium-based browser and navigate to `chrome://extensions/`.
3. Enable **"Developer mode"** in the top-right corner.
4. Click **"Load unpacked"** and select the extension directory.

## Development and Building

The extension relies on `esbuild` to compile TypeScript source files into the final scripts.

### Prerequisites

Ensure you have Node.js and NPM installed:

```bash
# Install dependencies
npm install

# Build the extension
npm run build

# Watch for file changes during development
npm run watch
```

### File Structure

* `src/background.ts`: Service worker managing active tabs, context menus, and script injection.
* `src/content-isolate.ts`: Isolated script that runs in target pages to swallow restriction events.
* `src/content-main.ts`: Main-world script that overrides event listener registrations on targeted sites.
* `options/`: Options page files (`index.html`, `options.css`, `options.ts`).
* `dist/`: Output directory containing compiled JavaScript outputs.

---

## Differences from Original

| Feature | Original Extension | Origin Version |
| :--- | :---: | :---: |
| **Core Copy Bypass** | ✅ | ✅ |
| **Telemetry & Tracking** | ❌ (Active) | ✅ (Removed) |
| **Promotional Ads** | ❌ (Present) | ✅ (Stripped) |
| **OCR Image Sending** | ❌ (Active) | ✅ (Neutralized) |
| **Uninstall Surveys** | ❌ (Forced) | ✅ (Removed) |
| **Open Source TypeScript** | ❌ (Compiled JS) | ✅ (Type-Safe TS) |

---

## Credits

Original extension by Petr Dev. This fork is maintained for individuals who value privacy, minimal overhead, and clean open-source software.
