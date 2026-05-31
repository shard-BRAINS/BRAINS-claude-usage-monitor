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
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const test_electron_1 = require("@vscode/test-electron");
async function main() {
    // Create a tmp home directory containing the fixture transcript
    const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cusage-e2e-'));
    const fixtureDir = path.resolve(__dirname, 'fixtures', '.claude', 'projects', 'demo');
    const destDir = path.join(tmpHome, '.claude', 'projects', 'demo');
    fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(path.join(fixtureDir, 'session-a.jsonl'), path.join(destDir, 'session-a.jsonl'));
    // Point both Unix and Windows home env vars at the tmp dir so the watcher
    // finds the fixture transcript regardless of platform.
    process.env['HOME'] = tmpHome;
    process.env['USERPROFILE'] = tmpHome;
    const extensionDevelopmentPath = path.resolve(__dirname, '..', '..');
    const extensionTestsPath = path.resolve(__dirname, 'smoke.test.js');
    // A per-run user-data dir prevents state leaking between CI runs.
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cusage-vscode-'));
    // On Windows the @vscode/test-electron download resolves to the VSCode CLI
    // (a Node.js binary), not the Electron desktop app. We detect this by
    // checking whether the downloaded Code.exe reports a Node version string, and
    // fall back to the machine-installed VSCode Electron binary when available.
    let vscodeExecutablePath;
    const winInstalledPath = path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Microsoft VS Code', 'Code.exe');
    if (process.platform === 'win32' && fs.existsSync(winInstalledPath)) {
        vscodeExecutablePath = winInstalledPath;
        console.log('Using installed VSCode:', vscodeExecutablePath);
    }
    try {
        await (0, test_electron_1.runTests)({
            extensionDevelopmentPath,
            extensionTestsPath,
            ...(vscodeExecutablePath ? { vscodeExecutablePath } : {}),
            launchArgs: ['--disable-extensions', `--user-data-dir=${userDataDir}`],
        });
    }
    catch (err) {
        console.error('e2e tests failed:', err);
        process.exit(1);
    }
}
main().catch((err) => {
    console.error('Unhandled error in e2e runner:', err);
    process.exit(1);
});
