<p align="center">
  <img src="images/128.png" width="96" alt="Allow Copy+ Origin Logo">
</p>

<h1 align="center">Allow Copy+ Origin</h1>

<p align="center">
  <strong>A privacy-first, ultra-lightweight browser extension to bypass selection and copy restrictions, powered by Rust WebAssembly and compiled TypeScript.</strong>
</p>

---

## Overview

**Allow Copy+ Origin** is a sanitized, high-performance Manifest V3 Chrome Extension designed to bypass website blocks on text selection, copy/paste shortcuts, dragging, and right-click context menus. 

This project completely removes the telemetry, bloatware, tracking, and promotional code found in the original extension. By executing the core business logic (subdomain matching, target domain classification, config parsing, and DOM list rendering) inside local WebAssembly, and using strictly-typed TypeScript wrappers for browser bindings, it achieves near-zero CPU overhead and zero data leakage.

> [!NOTE]
> All matching decisions, target evaluation, formatting routines, and HTML generation run locally in your browser inside a sandboxed WebAssembly module. No external network requests are ever made.

---

## Key Features

- **Rust WebAssembly Core**: High-speed matching engine, target domain classification, domain validation, and config parser compiled directly from Rust.
- **Strict Separation of Concerns**: TypeScript serves strictly as a browser API and DOM interaction glue layer. All decision logic is executed inside the Rust WASM module.
- **Strict TypeScript Integration**: Fully typed bindings for the background service worker, options manager, and injected content scripts, ensuring robust interop and stability.
- **Early MAIN World Intercept**: Injects a script at `document_start` to override `EventTarget.prototype.addEventListener` before the host page's scripts can run selection locks.
- **Zero Telemetry & Tracking**: Completely self-contained. No analytics endpoints, tracking SDKs, or external OCR servers.
- **Fidelity Options Page**: Retains the authentic visual style of the original options page using clean, static HTML/CSS that interfaces directly with the WASM runtime.

---

## Developer Guide

### Prerequisites

To compile the WebAssembly engine and compile the TypeScript bindings from source, you will need the following tools:

1. **Rust Toolchain** (with Wasm target):
   ```bash
   # Add the WebAssembly target
   rustup target add wasm32-unknown-unknown
   
   # Install wasm-bindgen CLI (matching cargo dependency version 0.2.123)
   cargo install --version 0.2.123 wasm-bindgen-cli
   ```

2. **Node.js** (for TypeScript compilation):
   Ensure Node.js and NPM are installed, then initialize dependencies:
   ```bash
   npm install
   ```

### Building the Project

Run the following compilation sequence to build the project and output the extension package:

```bash
# 1. Compile the Rust module to WASM
cargo build --target wasm32-unknown-unknown --release

# 2. Generate JavaScript bindings in the pkg directory
wasm-bindgen --target web --out-dir pkg target/wasm32-unknown-unknown/release/allow_copy_plus_origin.wasm

# 3. Compile TypeScript files into JavaScript
npm run build
```

This will output the compiled Javascript files (`background.js`, `inject_main.js`, `inject_isolated.js`, `options/options.js`) directly into the target paths required by the extension manifest.

### Installation

1. Open your browser and navigate to `chrome://extensions/`.
2. Toggle on **Developer mode** in the top-right corner.
3. Click **Load unpacked** in the top-left corner.
4. Select the root folder of this repository.
