//! Allow Copy+ Origin Core Library
//!
//! Provides WebAssembly entry points for Chrome Extension logic,
//! focusing on domain validation, options checking, and allowed site lists.
//! This module runs strictly locally and does not perform network operations.

use std::collections::HashMap;
use regex::Regex;
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

/// Struct representing the extension configuration settings.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Settings {
    /// Whether copy bypass is active globally.
    #[serde(rename = "allowProtectedTextToCopy")]
    pub allow_protected_text_to_copy: bool,
    /// Whether the context menu bypass is hidden (disabled).
    #[serde(rename = "hideContextMenu")]
    pub hide_context_menu: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            allow_protected_text_to_copy: true,
            hide_context_menu: false,
        }
    }
}

/// Structure indicating the bypass action to perform for a tab.
#[derive(Debug, Serialize, Deserialize)]
pub struct TabAction {
    /// Action to perform: "inject_main", "inject_isolated_and_css", "remove_bypass", or "do_nothing"
    pub action: String,
    /// Path to the toolbar icon corresponding to active/inactive state
    pub icon: String,
    /// Whether the custom copy context menu should be visible
    #[serde(rename = "showMenu")]
    pub show_menu: bool,
}

/// Sanitizes a raw domain string by stripping protocols and paths,
/// and validates the domain using a regex pattern.
///
/// Returns `Some(sanitized_domain)` if valid, or `None` if invalid.
#[wasm_bindgen]
pub fn sanitize_and_validate_domain(domain: &str) -> Option<String> {
    let mut clean = domain.trim().to_lowercase();
    
    // Strip protocol schemes (https:// and http://)
    if let Some(stripped) = clean.strip_prefix("https://") {
        clean = stripped.to_string();
    } else if let Some(stripped) = clean.strip_prefix("http://") {
        clean = stripped.to_string();
    }
        
    // Strip everything after the first slash (paths, queries)
    let clean = clean.split('/').next().unwrap_or("");
    
    if clean.is_empty() {
        return None;
    }

    // Regexp to match a valid hostname (subdomains + domain name + TLD)
    let Ok(re) = Regex::new(r"^([a-z0-9]+(-[a-z0-9]+)*\.)+[a-z]{2,63}$") else {
        return None;
    };

    if re.is_match(clean) {
        Some(clean.to_string())
    } else {
        None
    }
}

/// Checks if a page's host should have copy bypass enabled.
///
/// Returns `true` if copy bypass is enabled in settings and the host (or its parent domain)
/// exists in the allowed domains list.
#[wasm_bindgen]
pub fn should_bypass(host: &str, domains_json: &str, settings_json: &str) -> bool {
    let Ok(settings) = serde_json::from_str::<Settings>(settings_json) else {
        return false;
    };

    if !settings.allow_protected_text_to_copy {
        return false;
    }

    let Ok(domains) = serde_json::from_str::<HashMap<String, String>>(domains_json) else {
        return false;
    };

    let clean_host = host.trim().to_lowercase();

    if domains.contains_key(&clean_host) {
        return true;
    }

    for allowed_domain in domains.keys() {
        if clean_host.ends_with(&format!(".{}", allowed_domain)) {
            return true;
        }
    }

    false
}

/// Evaluates a Chrome tab update event and decides what actions the background script should take.
///
/// Returns a serialized `TabAction` object to JavaScript.
#[wasm_bindgen]
pub fn evaluate_tab_update(
    status: &str,
    host: &str,
    domains_json: &str,
    settings_json: &str,
) -> JsValue {
    let is_allowed = should_bypass(host, domains_json, settings_json);

    let action = match status {
        "loading" => "inject_main",
        "complete" if is_allowed => "inject_isolated_and_css",
        "complete" => "remove_bypass",
        _ => "do_nothing",
    };

    let command = TabAction {
        action: action.to_string(),
        icon: if is_allowed { "/images/32-on.png" } else { "/images/32.png" }.to_string(),
        show_menu: is_allowed,
    };

    serde_wasm_bindgen::to_value(&command).unwrap_or(JsValue::NULL)
}

/// Generates the HTML list items representation for allowed websites.
///
/// Performs sorting and query filtering inside WebAssembly to offload JavaScript UI construction.
#[wasm_bindgen]
pub fn render_domains_list_html(domains_json: &str, filter_text: &str) -> String {
    let domains: HashMap<String, String> = serde_json::from_str(domains_json).unwrap_or_default();
    let filter = filter_text.trim().to_lowercase();

    let mut filtered_domains: Vec<&String> = domains
        .keys()
        .filter(|domain| domain.contains(&filter))
        .collect();

    filtered_domains.sort();

    if filtered_domains.is_empty() {
        let msg = if filter.is_empty() {
            "No websites allowed yet"
        } else {
            "No matching websites found"
        };
        return format!("<div class=\"empty-list-message\">{}</div>", msg);
    }

    let mut html = String::new();
    for domain in filtered_domains {
        html.push_str("<div class=\"website-item\">\n");
        html.push_str(&format!(
            "  <span class=\"website-domain\">{}</span>\n",
            domain
        ));
        html.push_str(&format!(
            "  <button class=\"website-delete-btn\" data-domain=\"{}\" title=\"Remove domain\">&#x1F5D1;</button>\n",
            domain
        ));
        html.push_str("</div>\n");
    }

    html
}

/// Pretty-prints the domains list to JSON for exporting.
#[wasm_bindgen]
pub fn export_domains_json(domains_json: &str) -> String {
    let domains: HashMap<String, String> = serde_json::from_str(domains_json).unwrap_or_default();
    serde_json::to_string_pretty(&domains).unwrap_or_else(|_| domains_json.to_string())
}

/// Converts a domain name into a safe CSS class name.
/// Replaces all dots with underscores.
#[wasm_bindgen]
pub fn get_host_class(host: &str) -> String {
    host.replace('.', "_")
}

/// Adds a domain to the allowed list, sanitizing it first.
///
/// Returns the updated domains JSON string, or a descriptive error message.
#[wasm_bindgen]
pub fn add_domain(domain: &str, current_domains_json: &str) -> Result<String, String> {
    let clean_domain = sanitize_and_validate_domain(domain)
        .ok_or_else(|| "Please enter a valid website domain name".to_string())?;

    let mut domains: HashMap<String, String> = serde_json::from_str(current_domains_json)
        .unwrap_or_default();

    if domains.contains_key(&clean_domain) {
        return Err("Domain is already added".to_string());
    }

    let timestamp = "2026-06-12T00:00:00.000Z".to_string(); // fallback
    domains.insert(clean_domain, timestamp);

    serde_json::to_string(&domains)
        .map_err(|e| format!("Failed to serialize domains list: {}", e))
}

/// Deletes a domain from the allowed list.
///
/// Returns the updated domains JSON string, or a descriptive error message.
#[wasm_bindgen]
pub fn delete_domain(domain: &str, current_domains_json: &str) -> Result<String, String> {
    let mut domains: HashMap<String, String> = serde_json::from_str(current_domains_json)
        .map_err(|e| format!("Failed to parse current domains list: {}", e))?;

    let clean_domain = domain.trim().to_lowercase();
    if domains.remove(&clean_domain).is_none() {
        return Err("Domain not found in the allowed list".to_string());
    }

    serde_json::to_string(&domains)
        .map_err(|e| format!("Failed to serialize domains list: {}", e))
}

/// Imports and parses a JSON domains list, merging with or overwriting the current list.
/// Supports both an array of strings `["site.com"]` and timestamp objects `{"site.com": "timestamp"}`.
///
/// Returns the updated domains JSON string, or a descriptive error message.
#[wasm_bindgen]
pub fn import_domains(
    imported_json: &str,
    current_domains_json: &str,
    mode: &str,
) -> Result<String, String> {
    let parsed: serde_json::Value = serde_json::from_str(imported_json)
        .map_err(|_| "Invalid file format. Expected JSON array or object.".to_string())?;

    let mut imported_map = HashMap::new();
    let current_time = "2026-06-12T00:00:00.000Z".to_string();

    if let Some(arr) = parsed.as_array() {
        for val in arr {
            if let Some(s) = val.as_str() {
                if let Some(clean) = sanitize_and_validate_domain(s) {
                    imported_map.insert(clean, current_time.clone());
                }
            }
        }
    } else if let Some(obj) = parsed.as_object() {
        for (key, val) in obj {
            if let Some(clean) = sanitize_and_validate_domain(key) {
                let timestamp = val.as_str().map(|s| s.to_string()).unwrap_or_else(|| current_time.clone());
                imported_map.insert(clean, timestamp);
            }
        }
    } else {
        return Err("Invalid file format. Expected JSON array or object.".to_string());
    }

    if imported_map.is_empty() {
        return Err("No valid domains found in the selected file".to_string());
    }

    let mut current_map: HashMap<String, String> = if mode == "overwrite" {
        HashMap::new()
    } else {
        serde_json::from_str(current_domains_json).unwrap_or_default()
    };

    for (k, v) in imported_map {
        current_map.insert(k, v);
    }

    serde_json::to_string(&current_map)
        .map_err(|e| format!("Failed to serialize domains list: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_and_validate_domain() {
        assert_eq!(
            sanitize_and_validate_domain("https://www.google.com/search?q=rust"),
            Some("www.google.com".to_string())
        );
        assert_eq!(
            sanitize_and_validate_domain("http://example.co.uk/"),
            Some("example.co.uk".to_string())
        );
        assert_eq!(
            sanitize_and_validate_domain("  SUB.DOMAIN.ORG  "),
            Some("sub.domain.org".to_string())
        );
        assert_eq!(sanitize_and_validate_domain("invalid-domain"), None);
        assert_eq!(sanitize_and_validate_domain("http://"), None);
    }

    #[test]
    fn test_should_bypass() {
        let domains = r#"{"google.com": "2026-06-12", "example.co.uk": "2026-06-12"}"#;
        let settings = r#"{"allowProtectedTextToCopy": true, "hideContextMenu": false}"#;
        let disabled_settings = r#"{"allowProtectedTextToCopy": false, "hideContextMenu": false}"#;

        assert!(should_bypass("google.com", domains, settings));
        assert!(should_bypass("sub.google.com", domains, settings));
        assert!(should_bypass("example.co.uk", domains, settings));
        assert!(!should_bypass("google.com", domains, disabled_settings));
        assert!(!should_bypass("other.com", domains, settings));
    }



    #[test]
    fn test_render_domains_list_html() {
        let domains = r#"{"google.com": "2026", "apple.com": "2026"}"#;
        let html = render_domains_list_html(domains, "google");
        assert!(html.contains("google.com"));
        assert!(!html.contains("apple.com"));

        let empty_html = render_domains_list_html(domains, "nonexistent");
        assert!(empty_html.contains("No matching websites found"));
    }

    #[test]
    fn test_export_domains_json() {
        let domains = r#"{"google.com": "2026"}"#;
        let exported = export_domains_json(domains);
        assert!(exported.contains("{\n"));
        assert!(exported.contains("\"google.com\": \"2026\""));
    }

    #[test]
    fn test_get_host_class() {
        assert_eq!(get_host_class("www.google.com"), "www_google_com");
    }

    #[test]
    fn test_add_delete_domain() {
        let empty = "{}";
        let res = add_domain("google.com", empty).unwrap();
        assert!(res.contains("google.com"));

        let deleted = delete_domain("google.com", &res).unwrap();
        assert_eq!(deleted, "{}");
    }

    #[test]
    fn test_import_domains() {
        let current = r#"{"existing.com": "2026"}"#;
        
        let imported_arr = r#"["google.com", "example.com"]"#;
        let res1 = import_domains(imported_arr, current, "merge").unwrap();
        assert!(res1.contains("existing.com"));
        assert!(res1.contains("google.com"));
        assert!(res1.contains("example.com"));

        let imported_obj = r#"{"new.com": "2026"}"#;
        let res2 = import_domains(imported_obj, current, "overwrite").unwrap();
        assert!(!res2.contains("existing.com"));
        assert!(res2.contains("new.com"));
    }
}
