"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.run = run;
// smoke.test.ts — runs inside the VSCode Extension Development Host via
// @vscode/test-electron. Must export a CommonJS `run` function.
const assert = __importStar(require("assert"));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Mocha = require('mocha');
const vscode = __importStar(require("vscode"));
// Must match `<publisher>.<name>` in package.json.
const EXT_ID = 'BRAINS-Certified.BRAINS-claude-usage-monitor';
// Compiled by tsc with module=commonjs, so the named export below becomes
// `exports.run`. We also explicitly attach `module.exports.run` so the loader
// contract @vscode/test-electron requires (CommonJS `{ run }`) is honored
// independent of future tsconfig changes.
/** Pause for up to `ms` milliseconds, polling `predicate` every 200ms. */
async function waitFor(predicate, ms) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
        if (predicate())
            return true;
        await new Promise((r) => setTimeout(r, 200));
    }
    return predicate();
}
async function run() {
    const mocha = new Mocha({ ui: 'bdd', timeout: 15_000, color: true });
    mocha.suite.addTest(new Mocha.Test('extension activates and registers the sidebar webview view', async () => {
        const ext = vscode.extensions.getExtension(EXT_ID);
        assert.ok(ext, `Extension ${EXT_ID} not found`);
        if (!ext.isActive) {
            await ext.activate();
        }
        // Wait up to 5 seconds for activation to settle.
        const activated = await waitFor(() => ext.isActive, 5_000);
        assert.ok(activated, 'Extension did not become active within 5 seconds');
        // Verify the view contribution declared in package.json is present.
        const views = ext.packageJSON?.contributes?.views?.claudeUsageMonitor;
        assert.ok(Array.isArray(views), 'packageJSON.contributes.views.claudeUsageMonitor is missing');
        assert.strictEqual(views[0]?.id, 'claudeUsageMonitor.view', 'First view id should be claudeUsageMonitor.view');
    }));
    mocha.suite.addTest(new Mocha.Test('status bar item is visible with non-empty text after watcher fires', async () => {
        // VSCode does not expose a public API to enumerate status bar items, so
        // this test verifies the structural contract only: the extension is active
        // and its contribution structure is correct. Actual status-bar text
        // verification is covered by the manual checklist (MANUAL_CHECKS.md step 2).
        //
        // Gap: a future test could use the VSCode testing extension API or
        // snapshot the rendered HTML via the webview test helpers once they
        // become stable.
        const ext = vscode.extensions.getExtension(EXT_ID);
        assert.ok(ext?.isActive, 'Extension must be active for status bar check');
        // At minimum, confirm the expected contribution keys exist.
        const props = ext.packageJSON?.contributes?.configuration?.properties;
        assert.ok(typeof props?.['claudeUsageMonitor.warningTokens'] === 'object', 'warningTokens configuration property must be declared');
        assert.ok(typeof props?.['claudeUsageMonitor.criticalTokens'] === 'object', 'criticalTokens configuration property must be declared');
    }));
    return new Promise((resolve, reject) => {
        mocha.run((failures) => {
            if (failures > 0) {
                reject(new Error(`${failures} test(s) failed`));
            }
            else {
                resolve();
            }
        });
    });
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
module.exports = { run };
