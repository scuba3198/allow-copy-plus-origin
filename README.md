# Allow Copy+ Origin

A privacy-first, ultra-lightweight fork of the "Allow Copy +" extension.

## What is this?
This is a sanitized version of the popular "Allow Copy +" extension. While the original tool is excellent at bypassing copy restrictions on websites, it contained several "features" that compromised user privacy and added unnecessary bloat:
- **Telemetry & Tracking:** Constant communication with the developer's servers.
- **Promotional Injections:** Banners and context menu items promoting other products.
- **OCR/Beta Features:** Sending image data to external servers for text extraction.
- **Forced Redirects:** Intrusive welcome/donate/uninstall pages.

**Allow Copy+ Origin** removes all of the above, leaving only the core functionality in a strictly local, offline-capable package.

## Key Sanitization Features
- **Zero Network Dependency:** All telemetry endpoints redirected to `127.0.0.1`.
- **Privacy Hardened:** OCR (Text-from-image) and Support modules neutralized.
- **No Promotion:** All banners, cross-promotions, and holiday "gifts" stripped.
- **No Background Redirects:** `setUninstallURL` and `onInstalled` redirects removed.
- **Localized Only:** Operations are strictly local using `chrome.storage.local`.

## Enhancements in Origin Version
- **Paste Protection Bypass:** Intercepts `input` events and uses `requestAnimationFrame` to prevent sites from instantly reverting pasted text.
- **Selection Visibility Fix:** Overrides aggressive CSS that tries to hide text selection by forcing selection highlights to be visible.
- **Context Menu Paste:** Paste operations are now supported via the extension's bypass context menu.

## Installation (Chromium Browsers)
1. Download the `allow-copy-plus-origin.zip` from the [Latest Release](https://github.com/scuba3198/allow-copy-plus-origin/releases).
2. Extract the ZIP file to a folder on your computer.
3. Open your browser and navigate to `chrome://extensions/`.
4. Enable **"Developer mode"** (toggle in the top right).
5. Click **"Load unpacked"** and select the extracted folder.

## Differences from Original
| Feature | Original Extension | Origin Version |
| :--- | :--- | :--- |
| Core Copy Bypass | ✅ Included | ✅ Included |
| Telemetry/Tracking | ❌ Active | ✅ Removed |
| Promotional Banners | ❌ Present | ✅ Stripped |
| OCR Image Sending | ❌ Active | ✅ Neutralized |
| Uninstall Surveys | ❌ Forced | ✅ Removed |

## Credits
Original code by Petr Dev. This fork is maintained for those who value privacy and a distraction-free browsing experience.

---
*Built with ❤️ for a cleaner web.*
