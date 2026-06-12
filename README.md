<p align="center">
  <img src="images/128.png" width="128" alt="Allow Copy+ Origin Logo">
</p>

<h1 align="center">Allow Copy+ Origin</h1>

<p align="center">
  <strong>A privacy-first, ultra-lightweight bypass for text selection and copy restrictions, written in Rust WebAssembly.</strong>
</p>

---

## Overview

**Allow Copy+ Origin** is a sanitized, high-performance browser extension designed to bypass website restrictions on text selection, copy, cut, paste, and right-click context menus. 

This extension is built with privacy and performance as its core principles. Both the background service worker and the options controller have been rewritten to run on a core Rust WebAssembly engine, executing all domain operations locally. It contains no telemetry, no analytics, no external network requests, and no promotional injections.

> [!NOTE]
> All domain matching, HTML list rendering, JSON parsing, and sanitization logic run inside local WebAssembly, ensuring maximum execution speed and zero data leakage.

---

## Features

- **Rust WebAssembly Core**: Highly optimized matching engine, DOM HTML renderer, and domain manager compiled from Rust.
- **Zero Network Footprint**: Completely self-contained. No analytics endpoints, tracking scripts, or external OCR servers.
- **Early MAIN World Interceptor**: Overrides `EventTarget.prototype.addEventListener` at `document_start` before page scripts can register copy blockers.
- **Dynamic CSS Injection**: Restores selection highlighting and bypasses transparent blocking overlays.
- **Wildcard Subdomain Matching**: If a parent domain (e.g. `example.com`) is allowed, all subdomains (e.g. `sub.example.com`) are automatically bypassed.
- **Clean Original UI**: Restores the original layout of the options page as a static, bloat-free HTML/CSS page that calls the Rust Wasm engine for domain additions, deletions, lists, and backups.

---

## Installation

### For Chromium Browsers (Chrome, Edge, Brave, Vivaldi)

1. Download or clone this repository to a folder on your computer.
2. Open your browser and navigate to `chrome://extensions/`.
3. Enable **Developer mode** (toggle switch in the top right corner).
4. Click **Load unpacked** in the top left corner.
5. Select the root folder of this project.

---

## Developer Guide

### Prerequisites

To build the extension from source, you will need the Rust toolchain and the `wasm-bindgen` CLI tool installed.

```bash
# Install Rust (via rustup)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# Install the WebAssembly compilation target
rustup target add wasm32-unknown-unknown

# Install the wasm-bindgen CLI tool (must match the crate version 0.2.123)
cargo install --version 0.2.123 wasm-bindgen-cli
```

### Building the Project

Run the following commands in the root directory to compile the Rust code and generate the JavaScript WebAssembly bindings:

```bash
# 1. Compile the library to Wasm target
cargo build --target wasm32-unknown-unknown --release

# 2. Generate the bindings wrapper in the pkg directory
wasm-bindgen --target web --out-dir pkg target/wasm32-unknown-unknown/release/allow_copy_plus_origin.wasm
```

After building, the extension is ready to be loaded via `chrome://extensions/` using the **Load unpacked** option.
