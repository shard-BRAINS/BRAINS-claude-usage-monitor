import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const vsixFiles = fs.readdirSync(repoRoot)
  .filter(f => f.endsWith('.vsix'))
  .map(f => {
    const full = path.join(repoRoot, f);
    return { file: full, mtime: fs.statSync(full).mtimeMs };
  })
  .sort((a, b) => b.mtime - a.mtime);

if (vsixFiles.length === 0) {
  console.error('[package:check] FAIL — no .vsix file at repo root.');
  process.exit(2);
}

const { file } = vsixFiles[0];
const size = fs.statSync(file).size;
const label = path.basename(file);

if (size > 1_048_576) {
  console.error(`[package:check] FAIL — ${label} is ${size} bytes, exceeds 1 MB.`);
  process.exit(1);
}

console.log(`[package:check] OK — ${label} is ${size} bytes (under 1 MB).`);
