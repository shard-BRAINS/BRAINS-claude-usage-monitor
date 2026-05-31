import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { runTests } from '@vscode/test-electron';

async function main(): Promise<void> {
  // Create a tmp home directory containing the fixture transcript
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'cusage-e2e-'));
  const fixtureDir = path.resolve(__dirname, 'fixtures', '.claude', 'projects', 'demo');
  const destDir = path.join(tmpHome, '.claude', 'projects', 'demo');
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(
    path.join(fixtureDir, 'session-a.jsonl'),
    path.join(destDir, 'session-a.jsonl'),
  );

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
  let vscodeExecutablePath: string | undefined;
  const winInstalledPath = path.join(
    os.homedir(),
    'AppData', 'Local', 'Programs', 'Microsoft VS Code', 'Code.exe',
  );
  if (process.platform === 'win32' && fs.existsSync(winInstalledPath)) {
    vscodeExecutablePath = winInstalledPath;
    console.log('Using installed VSCode:', vscodeExecutablePath);
  }

  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      ...(vscodeExecutablePath ? { vscodeExecutablePath } : {}),
      launchArgs: ['--disable-extensions', `--user-data-dir=${userDataDir}`],
    });
  } catch (err) {
    console.error('e2e tests failed:', err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled error in e2e runner:', err);
  process.exit(1);
});
