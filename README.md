# 🔓 Allow Copy+ Origin

**Allow Copy+ Origin** is a privacy-focused, sanitized fork of the popular "Allow Copy +" Chrome extension. This version is designed for users who want the powerful bypass capabilities of the original extension without any of the telemetry, data collection, or promotional bloat.

## 🌟 Why this fork?

The original extension, while functional, contains several behaviors that may concern privacy-conscious users:
- **Telemetry:** Shares usage statistics and visited domain lists with the developer's server.
- **OCR Privacy:** Transmits image data to an external server when using the text detection feature.
- **Promotional Bloat:** Injects context menus for other products and displays large banners in the settings.
- **Forced Redirects:** Automatically opens tabs for welcome/update pages and donation requests.

**Allow Copy+ Origin** removes all of these behaviors while keeping the core bypass engine 100% intact.

## ✨ Key Differences

- **🔒 Privacy First:** All external tracking and "phone home" mechanisms have been neutralized.
- **🚫 Zero Bloat:** No promotional context menus, banners, or forced redirects.
- **📉 Lightweight:** Reduced background activity by disabling non-essential data processing.
- **🛠️ Air-Gapped:** All hardcoded server URLs have been redirected to `127.0.0.1`, ensuring no data ever leaves your device.

## 🚀 Installation

### Using the ZIP file (Recommended)
1. Download the [Allow-Copy-Origin.zip](./Allow-Copy-Origin.zip) from this repository.
2. Extract the ZIP file to a folder on your computer.
3. Open your Chromium-based browser (Chrome, Edge, Brave, etc.) and navigate to `chrome://extensions`.
4. Enable **"Developer mode"** in the top right corner.
5. Click **"Load unpacked"** and select the folder you extracted.

### Manual Installation
1. Clone this repository: `git clone https://github.com/[USER]/allow-copy-plus-origin.git`
2. Follow steps 3-5 above.

## 🛠️ Technical Modifications
- **Background Script (`285.js`):** Neutralized all fetch/XHR calls to developer domains. Stubbed tracking functions (`updateActivateStat`, `Ke`, `Ge`).
- **Content Script Bridge (`974.js`):** Replaced with a no-op to prevent domain leakages.
- **Options Page:** Injected CSS to hide promotional banners and non-essential settings.
- **Manifest:** Renamed to "Allow Copy+ Origin" and removed update URLs to prevent auto-overwriting by the original version.

---

*Original code and assets belong to the original author (PiDevEx). This fork is for personal use and privacy preservation.*
