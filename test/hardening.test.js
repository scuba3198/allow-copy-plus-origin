const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const manifest = JSON.parse(read("manifest.json"));

assert.equal(manifest.host_permissions, undefined);
assert.deepEqual(manifest.optional_host_permissions, ["*://*/*"]);
assert(manifest.permissions.includes("activeTab"));
assert.equal(manifest.web_accessible_resources, undefined);
assert(!read("options/index.html").includes("fonts.googleapis.com"));
assert.equal((read("src/background.ts").match(/storage\.sync\.get/g) || []).length, 1);
assert(!read("options/options.ts").includes("storage.sync"));
assert(!read("src/content-isolate.ts").includes("MutationObserver"));
assert(!read("src/content-main.ts").includes("EventTarget.prototype.addEventListener"));
const main = read("src/content-main.ts");
assert(main.includes('const KIEC_HOSTNAME = "portal.kiec.edu.np"'));
assert(main.includes("const isKiecHost = hostname === KIEC_HOSTNAME"));
assert(main.includes("reconstructKiecCopy(event as ClipboardEvent)"));
assert(main.includes('event.clipboardData.setData("text/plain", reconstructed)'));
assert(main.includes("event.type === \"copy\" && isKiecHost"));
assert(main.includes('node.nodeName === "BR" && range.intersectsNode(node)'));
assert(main.includes("getClosestBlockAncestor"));
assert(main.includes("if (lastBlock !== currentBlock)"));
assert(main.includes('parts.push("\\n\\n")'));
const background = read("src/background.ts");
const actionClick = background.slice(
  background.indexOf("chrome.action.onClicked.addListener"),
  background.indexOf("// Context Menu Clicks")
);
const requestIndex = actionClick.indexOf("chrome.permissions.request");
const firstAwait = actionClick.indexOf("await");
assert(requestIndex !== -1 && (firstAwait === -1 || requestIndex < firstAwait));
assert(actionClick.includes("const activeTab = tab"));
assert(actionClick.includes("domains[hostname] && hasAccess"));
assert(actionClick.includes("if (!permission.granted)"));
assert(!read("src/background.ts").includes("allFrames"));
assert(read("src/background.ts").includes("permissions.request"));
assert(read("src/background.ts").includes("SYNC_MIGRATED_KEY"));
assert(read("src/background.ts").includes("storage.sync.remove"));
assert(read("src/background.ts").includes("DisableDomain"));
assert(read("src/background.ts").includes("tabs.query({ url"));
assert(read("options/options.ts").includes("requestDomainAccess"));
assert(read("options/options.ts").includes('type: "DisableDomain"'));
assert(read("src/content-isolate.ts").includes("ACP_TEARDOWN"));
assert(read("src/content-isolate.ts").includes("acpActiveClass"));
assert(/try\s*\{[\s\S]*chrome\.runtime\.sendMessage[\s\S]*catch/.test(read("src/content-isolate.ts")));
assert(read("src/content-isolate.ts").includes("if (stopped) return"));
const isolate = read("src/content-isolate.ts");
assert(isolate.indexOf("document.dispatchEvent(new CustomEvent(TEARDOWN_EVENT))") < isolate.indexOf("chrome.runtime.onMessage.removeListener(messageListener)"));
assert(read("src/content-main.ts").includes("TEARDOWN_EVENT"));
assert(read("src/content-main.ts").includes("disableAllowCopyMainWorld"));

console.log("extension hardening checks passed");
