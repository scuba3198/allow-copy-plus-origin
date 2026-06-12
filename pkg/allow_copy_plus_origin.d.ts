/* tslint:disable */
/* eslint-disable */

/**
 * Adds a domain to the allowed list, sanitizing it first.
 *
 * Returns the updated domains JSON string, or a descriptive error message.
 */
export function add_domain(domain: string, current_domains_json: string): string;

/**
 * Deletes a domain from the allowed list.
 *
 * Returns the updated domains JSON string, or a descriptive error message.
 */
export function delete_domain(domain: string, current_domains_json: string): string;

/**
 * Converts a domain name into a safe CSS class name.
 * Replaces all dots with underscores.
 * E.g. "google.com" -> "google_com"
 */
export function get_host_class(host: string): string;

/**
 * Imports and parses a JSON domains list, merging with or overwriting the current list.
 * Supports both an array of strings `["site.com"]` and timestamp objects `{"site.com": "timestamp"}`.
 *
 * Returns the updated domains JSON string, or a descriptive error message.
 */
export function import_domains(imported_json: string, current_domains_json: string, mode: string): string;

/**
 * Sanitizes a raw domain string by stripping protocols and paths,
 * and validates the domain using a regex pattern.
 *
 * Returns `Some(sanitized_domain)` if valid, or `None` if invalid.
 */
export function sanitize_and_validate_domain(domain: string): string | undefined;

/**
 * Checks if a page's host should have copy bypass enabled.
 *
 * Returns `true` if copy bypass is enabled in settings and the host (or its parent domain)
 * exists in the allowed domains list.
 */
export function should_bypass(host: string, domains_json: string, settings_json: string): boolean;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly add_domain: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly delete_domain: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly get_host_class: (a: number, b: number) => [number, number];
    readonly import_domains: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number, number];
    readonly sanitize_and_validate_domain: (a: number, b: number) => [number, number];
    readonly should_bypass: (a: number, b: number, c: number, d: number, e: number, f: number) => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
